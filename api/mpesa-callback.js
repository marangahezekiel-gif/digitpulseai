"use strict";
// Safaricom calls this after the customer answers the prompt. We never trust the call alone:
// the address carries a secret, and a successful result is re-checked with Safaricom (STK Query)
// before the plan is approved. Approval happens once per prompt.
const L = require("./_lib");
const M = require("./_mpesa");

function ok(res) {
  return L.send(res, 200, { ResultCode: 0, ResultDesc: "Accepted" });
}

module.exports = async (req, res) => {
  if (req.method !== "POST") return L.send(res, 405, { error: "method" });
  if (!M.enabled() || !L.configured()) return L.send(res, 503, { error: "not_configured" });
  if (L.tooBig(req)) return L.send(res, 413, { error: "size" });
  {
    const [bad] = await L.redis([["GET", "dp:rl:cbbad:" + L.ip(req)]]).catch(() => [0]);
    if (Number(bad || 0) >= 20) return L.send(res, 429, { error: "locked" });
  }
  try {
    const q = String((req.query && req.query.s) || new URL(req.url, "http://x").searchParams.get("s") || "");
    if (!L.safeEq(q, process.env.MPESA_CALLBACK_SECRET)) {
      await L.hit("dp:rl:cbbad:" + L.ip(req), 900); // guessing the secret is limited
      return L.send(res, 403, { error: "forbidden" });
    }

    const cb = (L.body(req).Body || {}).stkCallback || {};
    const ck = String(cb.CheckoutRequestID || "");
    if (!/^[A-Za-z0-9_-]{6,80}$/.test(ck) || Number(cb.ResultCode) !== 0) return ok(res);

    const [raw] = await L.redis([["GET", "dp:stk:" + ck]]);
    if (!raw) return ok(res);
    const stk = JSON.parse(raw);

    const items = (cb.CallbackMetadata && cb.CallbackMetadata.Item) || [];
    const get = (n) => (items.find((x) => x.Name === n) || {}).Value;
    const paid = Number(get("Amount"));
    const receipt = L.cleanText(get("MpesaReceiptNumber"), 20);
    if (!(paid >= stk.amount) || !receipt) return ok(res);

    // Confirm with Safaricom that this prompt really succeeded.
    const v = await M.query(ck);
    if (!v.ok || String(v.j.ResultCode) !== "0") return ok(res);

    // Only the first confirmation approves.
    const [first] = await L.redis([["SET", "dp:stkdone:" + ck, "1", "NX", "EX", 604800]]);
    if (first !== "OK") return ok(res);

    const [cur] = await L.redis([["GET", L.keyOf(stk.id)]]);
    const rec = cur ? JSON.parse(cur) : { id: stk.id, createdAt: Date.now(), origin: true };
    const now = Date.now();
    const cmds = [];
    if (!(L.effective(rec).status === "approved")) {
      rec.plan = stk.plan;
      rec.method = "mpesa";
      rec.status = "approved";
      rec.approvedAt = now;
      rec.expiresAt = now + L.YEAR_MS;
      if (!rec.key) {
        rec.key = L.newKey();
        cmds.push(["SET", L.keyIdx(rec.key), rec.id]);
      }
    }
    rec.receipt = receipt;
    rec.paidKes = paid;
    rec.updatedAt = now;
    cmds.push(["SET", L.keyOf(rec.id), JSON.stringify(rec)], ["SADD", "dp:ids", rec.id]);
    await L.redis(cmds);
    return ok(res);
  } catch (e) {
    return L.send(res, 500, { error: "server" });
  }
};
