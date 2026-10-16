"use strict";
// GET  /api/admin                          -> list every request and access key
// POST /api/admin { action, id, plan, contact }
//        approve | reject | revoke | delete | rekey (new key, unlinks other devices)
//        promo_start | promo_stop  (the 8-hour $80 Matches offer)
//        create  (a new approved client with an access key, for someone who paid you directly)
// Every call must carry the owner's secret in the x-admin-key header. The secret lives only
// in the ADMIN_KEY environment variable on Vercel. After 10 wrong tries an address is locked
// out for about 15 minutes.
const crypto = require("crypto");
const L = require("./_lib");

function sameKey(given, real) {
  return L.safeEq(given, real);
}

// What the owner's panel sees: the key, but not the clients' device ids.
function view(rec) {
  const r = L.effective(rec);
  const o = Object.assign({}, r, { deviceCount: L.deviceCount(r), maxDevices: L.MAX_DEVICES });
  delete o.devices;
  return o;
}

module.exports = async (req, res) => {
  const real = process.env.ADMIN_KEY || "";
  // Fail closed: no key, a short key, or no database means the admin API stays off.
  if (real.length < 12 || !L.configured()) return L.send(res, 503, { error: "not_configured" });
  if (req.method !== "GET" && req.method !== "POST") return L.send(res, 405, { error: "method" });
  if (!L.sameOrigin(req) || L.tooBig(req)) return L.send(res, 403, { error: "origin" });

  try {
    const failKey = "dp:rl:adm:" + L.ip(req);
    const [fails] = await L.redis([["GET", failKey]]);
    if (Number(fails || 0) >= 10) return L.send(res, 429, { error: "locked" });

    if (!sameKey(req.headers["x-admin-key"] || "", real)) {
      await L.hit(failKey, 900);
      return L.send(res, 401, { error: "unauthorized" });
    }

    if (req.method === "GET") {
      const [ids] = await L.redis([["SMEMBERS", "dp:ids"]]);
      const items = [];
      for (let i = 0; i < ids.length; i += 100) {
        const chunk = ids.slice(i, i + 100);
        const [vals] = await L.redis([["MGET", ...chunk.map(L.keyOf)]]);
        vals.forEach((v) => {
          if (!v) return;
          try {
            items.push(view(JSON.parse(v)));
          } catch (e) {
            /* skip a damaged record */
          }
        });
      }
      items.sort((a, b) => b.createdAt - a.createdAt);
      return L.send(res, 200, { items, promo: await L.promo(), now: Date.now() });
    }

    const b = L.body(req);
    const now = Date.now();

    // The 8-hour offer: start it (the clock starts now, the same end time for every visitor) or stop it early.
    if (b.action === "promo_start") {
      const endsAt = now + L.PROMO_MS;
      await L.redis([["SET", L.PROMO_KEY, JSON.stringify({ endsAt }), "EX", Math.ceil(L.PROMO_MS / 1000) + 60]]);
      return L.send(res, 200, { ok: true, promo: await L.promo(), now });
    }
    if (b.action === "promo_stop") {
      await L.redis([["DEL", L.PROMO_KEY]]);
      return L.send(res, 200, { ok: true, promo: null, now });
    }

    if (b.action === "create") {
      const contact = L.cleanText(b.contact, 60);
      if (!L.PLANS.includes(b.plan)) return L.send(res, 400, { error: "invalid" });
      if (contact.length < 2) return L.send(res, 400, { error: "contact" });
      const id = L.newId();
      const k = L.newKey();
      const rec = {
        id,
        plan: b.plan,
        method: "manual",
        contact,
        status: "approved",
        origin: false,
        devices: [],
        key: k,
        createdAt: now,
        updatedAt: now,
        approvedAt: now,
        expiresAt: now + L.YEAR_MS,
      };
      await L.redis([
        ["SET", L.keyOf(id), JSON.stringify(rec)],
        ["SADD", "dp:ids", id],
        ["SET", L.keyIdx(k), id],
      ]);
      return L.send(res, 200, { ok: true, id, key: k });
    }

    if (!L.ID_RE.test(String(b.id || ""))) return L.send(res, 400, { error: "invalid" });
    const key = L.keyOf(b.id);
    const [cur] = await L.redis([["GET", key]]);

    if (b.action === "delete") {
      const cmds = [
        ["DEL", key],
        ["SREM", "dp:ids", b.id],
      ];
      if (cur) {
        try {
          const r = JSON.parse(cur);
          if (r.key) cmds.push(["DEL", L.keyIdx(r.key)]);
          (r.devices || []).forEach((d) => cmds.push(["DEL", L.linkOf(d)]));
        } catch (e) {
          /* damaged record: still delete it */
        }
      }
      await L.redis(cmds);
      return L.send(res, 200, { ok: true });
    }

    if (!cur) return L.send(res, 404, { error: "missing" });
    const rec = JSON.parse(cur);
    const extra = [];

    if (b.action === "approve") {
      rec.status = "approved";
      rec.plan = L.PLANS.includes(b.plan) ? b.plan : rec.plan;
      rec.approvedAt = now;
      rec.expiresAt = now + L.YEAR_MS;
      if (!rec.key) rec.key = L.newKey();
      extra.push(["SET", L.keyIdx(rec.key), rec.id]);
    } else if (b.action === "reject") {
      rec.status = "rejected";
      rec.expiresAt = null;
    } else if (b.action === "revoke") {
      rec.status = "revoked";
      rec.expiresAt = null;
    } else if (b.action === "rekey") {
      const fresh = L.newKey();
      if (rec.key) extra.push(["DEL", L.keyIdx(rec.key)]);
      (rec.devices || []).forEach((d) => extra.push(["DEL", L.linkOf(d)]));
      extra.push(["SET", L.keyIdx(fresh), rec.id]);
      rec.key = fresh;
      rec.devices = [];
    } else {
      return L.send(res, 400, { error: "action" });
    }
    rec.updatedAt = now;
    await L.redis([["SET", key, JSON.stringify(rec)], ...extra]);
    return L.send(res, 200, { ok: true, status: rec.status, key: rec.key || null });
  } catch (e) {
    return L.send(res, 500, { error: "server" });
  }
};
