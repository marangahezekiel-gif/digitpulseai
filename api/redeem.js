"use strict";
// POST /api/redeem  { id: <device id>, key: <access key> }
// A client types the access key the owner sent them. If it is valid and still active, this
// device is linked to it (at most MAX_DEVICES devices per key) and the site unlocks.
// 10 wrong keys from one address locks that address out for about 15 minutes.
const L = require("./_lib");

module.exports = async (req, res) => {
  if (req.method !== "POST") return L.send(res, 405, { error: "method" });
  if (!L.sameOrigin(req) || L.tooBig(req)) return L.send(res, 403, { error: "origin" });
  if (!L.configured()) return L.send(res, 503, { error: "not_configured" });
  try {
    const b = L.body(req);
    const cid = String(b.id || "");
    const key = L.cleanKey(b.key);
    if (!L.ID_RE.test(cid) || !key) return L.send(res, 400, { error: "invalid" });

    const failKey = "dp:rl:red:" + L.ip(req);
    const [fails] = await L.redis([["GET", failKey]]);
    if (Number(fails || 0) >= 10) return L.send(res, 429, { error: "locked" });

    const [rid] = await L.redis([["GET", L.keyIdx(key)]]);
    const [cur] = rid ? await L.redis([["GET", L.keyOf(rid)]]) : [null];
    if (!cur) {
      await L.hit(failKey, 900);
      return L.send(res, 404, { error: "notfound" });
    }

    const rec = JSON.parse(cur);
    if (L.effective(rec).status !== "approved") return L.send(res, 403, { error: "inactive" });

    const known = rec.id === cid || (Array.isArray(rec.devices) && rec.devices.includes(cid));
    if (!known) {
      if (L.deviceCount(rec) >= L.MAX_DEVICES) return L.send(res, 409, { error: "devices" });
      rec.devices = (rec.devices || []).concat(cid);
      rec.updatedAt = Date.now();
      await L.redis([
        ["SET", L.keyOf(rec.id), JSON.stringify(rec)],
        ["SET", L.linkOf(cid), rec.id],
      ]);
    }

    // This device may have its own waiting payment request; the key makes it unnecessary.
    if (rec.id !== cid) {
      const [own] = await L.redis([["GET", L.keyOf(cid)]]);
      if (own && JSON.parse(own).status === "pending") {
        await L.redis([
          ["DEL", L.keyOf(cid)],
          ["SREM", "dp:ids", cid],
        ]);
      }
    }
    return L.send(res, 200, { ok: true, status: "approved", plan: rec.plan, expiresAt: rec.expiresAt || null });
  } catch (e) {
    return L.send(res, 500, { error: "server" });
  }
};
