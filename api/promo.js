"use strict";
// GET /api/promo -> { active, plan, price, endsAt, now }
// The site reads this to show the limited-time price and a countdown. `now` is the server's clock,
// so every visitor's countdown ends at the same moment even if their phone clock is wrong.
const L = require("./_lib");

module.exports = async (req, res) => {
  if (req.method !== "GET") return L.send(res, 405, { error: "method" });
  if (!L.configured()) return L.send(res, 200, { active: false, now: Date.now() });
  try {
    if ((await L.hit("dp:rl:promo:" + L.ip(req), 600)) > 600) return L.send(res, 429, { error: "rate" });
    const p = await L.promo();
    return L.send(res, 200, p ? { active: true, plan: p.plan, price: p.price, endsAt: p.endsAt, now: Date.now() } : { active: false, now: Date.now() });
  } catch (e) {
    return L.send(res, 200, { active: false, now: Date.now() });
  }
};
