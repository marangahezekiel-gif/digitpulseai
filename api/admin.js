"use strict";
// GET  /api/admin                     -> list every payment request
// POST /api/admin { action, id, plan } -> approve | reject | revoke | delete
// Every call must carry the owner's secret in the x-admin-key header. The secret lives only
// in the ADMIN_KEY environment variable on Vercel. After 10 wrong tries an address is locked
// out for about 15 minutes.
const crypto = require("crypto");
const L = require("./_lib");

function sameKey(given, real) {
  const a = crypto.createHash("sha256").update(String(given)).digest();
  const b = crypto.createHash("sha256").update(String(real)).digest();
  return crypto.timingSafeEqual(a, b);
}

module.exports = async (req, res) => {
  const real = process.env.ADMIN_KEY || "";
  // Fail closed: no key, a short key, or no database means the admin API stays off.
  if (real.length < 12 || !L.configured()) return L.send(res, 503, { error: "not_configured" });
  if (req.method !== "GET" && req.method !== "POST") return L.send(res, 405, { error: "method" });

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
            items.push(L.effective(JSON.parse(v)));
          } catch (e) {
            /* skip a damaged record */
          }
        });
      }
      items.sort((a, b) => b.createdAt - a.createdAt);
      return L.send(res, 200, { items });
    }

    const b = L.body(req);
    if (!L.ID_RE.test(String(b.id || ""))) return L.send(res, 400, { error: "invalid" });
    const key = L.keyOf(b.id);

    if (b.action === "delete") {
      await L.redis([
        ["DEL", key],
        ["SREM", "dp:ids", b.id],
      ]);
      return L.send(res, 200, { ok: true });
    }

    const [cur] = await L.redis([["GET", key]]);
    if (!cur) return L.send(res, 404, { error: "missing" });
    const rec = JSON.parse(cur);
    const now = Date.now();

    if (b.action === "approve") {
      rec.status = "approved";
      rec.plan = L.PLANS.includes(b.plan) ? b.plan : rec.plan;
      rec.approvedAt = now;
      rec.expiresAt = now + L.YEAR_MS;
    } else if (b.action === "reject") {
      rec.status = "rejected";
      rec.expiresAt = null;
    } else if (b.action === "revoke") {
      rec.status = "revoked";
      rec.expiresAt = null;
    } else {
      return L.send(res, 400, { error: "action" });
    }
    rec.updatedAt = now;
    await L.redis([["SET", key, JSON.stringify(rec)]]);
    return L.send(res, 200, { ok: true, status: rec.status });
  } catch (e) {
    return L.send(res, 500, { error: "server" });
  }
};
