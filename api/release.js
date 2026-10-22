"use strict";
// POST /api/release  { id: <device id> }
// "Disconnect" on a device that entered an access key frees its slot, so the same key can be used
// on another device straight away. The device id is a private 128-bit value made on the client's
// device, so only that device can release itself. The original paying device is never removed here.
const L = require("./_lib");

module.exports = async (req, res) => {
  if (req.method !== "POST") return L.send(res, 405, { error: "method" });
  if (!L.sameOrigin(req) || L.tooBig(req)) return L.send(res, 403, { error: "origin" });
  if (!L.configured()) return L.send(res, 503, { error: "not_configured" });
  try {
    const cid = String(L.body(req).id || "");
    if (!L.ID_RE.test(cid)) return L.send(res, 400, { error: "invalid" });
    const n = await L.hit("dp:rl:rel:" + L.ip(req), 600);
    if (n > 60) return L.send(res, 429, { error: "rate" });

    const [lnk] = await L.redis([["GET", L.linkOf(cid)]]);
    if (lnk) {
      const [cur] = await L.redis([["GET", L.keyOf(lnk)]]);
      if (cur) {
        const rec = JSON.parse(cur);
        if (Array.isArray(rec.devices) && rec.devices.includes(cid)) {
          rec.devices = rec.devices.filter((d) => d !== cid);
          rec.updatedAt = Date.now();
          await L.redis([["SET", L.keyOf(rec.id), JSON.stringify(rec)]]);
        }
      }
      await L.redis([["DEL", L.linkOf(cid)]]);
    }
    return L.send(res, 200, { ok: true });
  } catch (e) {
    return L.send(res, 500, { error: "server" });
  }
};
