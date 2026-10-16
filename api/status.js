"use strict";
// GET /api/status?id=<device id>
// The client site asks whether its payment request was approved. The id is a random
// 128-bit value created on the client's device, so it works like a private ticket number.
// A device that entered an access key is linked to the record that key belongs to.
const L = require("./_lib");

module.exports = async (req, res) => {
  if (req.method !== "GET") return L.send(res, 405, { error: "method" });
  if (!L.sameOrigin(req) || L.tooBig(req)) return L.send(res, 403, { error: "origin" });
  if (!L.configured()) return L.send(res, 503, { error: "not_configured" });
  try {
    const id = new URL(req.url, "http://local").searchParams.get("id") || "";
    if (!L.ID_RE.test(id)) return L.send(res, 400, { error: "invalid" });

    const n = await L.hit("dp:rl:st:" + L.ip(req), 600);
    if (n > 300) return L.send(res, 429, { error: "rate" });

    const [own, lnk] = await L.redis([["GET", L.keyOf(id)], ["GET", L.linkOf(id)]]);
    const mine = own ? L.effective(JSON.parse(own)) : null;

    // The link only counts while the owner's record still lists this device (a reset removes it).
    let linked = null;
    if (lnk) {
      const [c] = await L.redis([["GET", L.keyOf(lnk)]]);
      if (c) {
        const r = JSON.parse(c);
        if (Array.isArray(r.devices) && r.devices.includes(id)) linked = L.effective(r);
      }
    }

    const rec = linked && linked.status === "approved" ? linked : mine || linked;
    if (!rec) return L.send(res, 200, { status: "none" });
    return L.send(res, 200, { status: rec.status, plan: rec.plan, expiresAt: rec.expiresAt || null });
  } catch (e) {
    return L.send(res, 500, { error: "server" });
  }
};
