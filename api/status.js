"use strict";
// GET /api/status?id=<device id>
// The client site asks whether its payment request was approved. The id is a random
// 128-bit value created on the client's device, so it works like a private ticket number.
const L = require("./_lib");

module.exports = async (req, res) => {
  if (req.method !== "GET") return L.send(res, 405, { error: "method" });
  if (!L.configured()) return L.send(res, 503, { error: "not_configured" });
  try {
    const id = new URL(req.url, "http://local").searchParams.get("id") || "";
    if (!L.ID_RE.test(id)) return L.send(res, 400, { error: "invalid" });

    const n = await L.hit("dp:rl:st:" + L.ip(req), 600);
    if (n > 300) return L.send(res, 429, { error: "rate" });

    const [cur] = await L.redis([["GET", L.keyOf(id)]]);
    if (!cur) return L.send(res, 200, { status: "none" });
    const rec = L.effective(JSON.parse(cur));
    return L.send(res, 200, { status: rec.status, plan: rec.plan, expiresAt: rec.expiresAt || null });
  } catch (e) {
    return L.send(res, 500, { error: "server" });
  }
};
