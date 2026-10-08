"use strict";
// GET  /api/mpesa                          -> { enabled }  (the site shows the "M-Pesa prompt" button only when true)
// POST /api/mpesa { id, plan, phone }      -> sends an M-Pesa payment prompt (STK push) to the phone.
// The amount is worked out here from the plan price, never taken from the browser.
const L = require("./_lib");
const M = require("./_mpesa");
const PRICE = { matches: 150, rfeo: 100, ou: 80 };

module.exports = async (req, res) => {
  if (req.method === "GET") return L.send(res, 200, { enabled: M.enabled() && L.configured() });
  if (req.method !== "POST") return L.send(res, 405, { error: "method" });
  if (!M.enabled() || !L.configured()) return L.send(res, 503, { error: "not_configured" });
  try {
    const b = L.body(req);
    const ph = M.phone(b.phone);
    if (!L.ID_RE.test(String(b.id || "")) || !PRICE[b.plan]) return L.send(res, 400, { error: "invalid" });
    if (!ph) return L.send(res, 400, { error: "phone" });

    const n = await L.hit("dp:rl:stk:" + L.ip(req), 3600);
    if (n > 6) return L.send(res, 429, { error: "rate" });

    const [cur] = await L.redis([["GET", L.keyOf(b.id)]]);
    const old = cur ? JSON.parse(cur) : null;
    if (old && L.effective(old).status === "approved") return L.send(res, 200, { ok: true, status: "approved" });

    const rate = await M.kesRate();
    if (!rate) return L.send(res, 502, { error: "rate_unavailable" });
    const amount = Math.ceil(PRICE[b.plan] * rate);

    const host = String(req.headers["x-forwarded-host"] || req.headers.host || "").replace(/[^a-z0-9.:-]/gi, "");
    const cb = "https://" + host + "/api/mpesa-callback?s=" + encodeURIComponent(process.env.MPESA_CALLBACK_SECRET);
    const r = await M.push(amount, ph, cb);
    const ck = r.j && r.j.CheckoutRequestID;
    if (!r.ok || String(r.j.ResponseCode) !== "0" || !ck) return L.send(res, 502, { error: "push_failed" });

    // Remember the prompt, and show the owner a pending request in case the callback never arrives.
    const now = Date.now();
    const rec = Object.assign({}, old || {}, {
      id: b.id, plan: b.plan, method: "mpesa", contact: ph, status: "pending", origin: true,
      createdAt: (old && old.createdAt) || now, updatedAt: now, approvedAt: null, expiresAt: null,
      stk: ck,
    });
    await L.redis([
      ["SET", "dp:stk:" + ck, JSON.stringify({ id: b.id, plan: b.plan, amount }), "EX", 86400],
      ["SET", L.keyOf(b.id), JSON.stringify(rec)],
      ["SADD", "dp:ids", b.id],
    ]);
    return L.send(res, 200, { ok: true, status: "prompted", amount });
  } catch (e) {
    return L.send(res, 500, { error: "server" });
  }
};
