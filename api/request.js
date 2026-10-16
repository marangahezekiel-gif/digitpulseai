"use strict";
// POST /api/request  { id, plan, method, contact }
// A client registers that they paid. The request waits for the owner to approve it.
const L = require("./_lib");

module.exports = async (req, res) => {
  if (req.method !== "POST") return L.send(res, 405, { error: "method" });
  if (!L.sameOrigin(req) || L.tooBig(req)) return L.send(res, 403, { error: "origin" });
  if (!L.configured()) return L.send(res, 503, { error: "not_configured" });
  try {
    const b = L.body(req);
    if (!L.ID_RE.test(String(b.id || "")) || !L.PLANS.includes(b.plan) || !L.METHODS.includes(b.method)) {
      return L.send(res, 400, { error: "invalid" });
    }
    const contact = L.cleanText(b.contact, 60);
    if (contact.length < 5) return L.send(res, 400, { error: "contact" });

    const n = await L.hit("dp:rl:req:" + L.ip(req), 3600);
    if (n > 8) return L.send(res, 429, { error: "rate" });

    const key = L.keyOf(b.id);
    const [cur] = await L.redis([["GET", key]]);
    const old = cur ? JSON.parse(cur) : null;
    const now = Date.now();

    // Already approved and still valid: report it, change nothing.
    if (old && old.status === "approved" && !(old.expiresAt && now > old.expiresAt)) {
      return L.send(res, 200, { ok: true, status: "approved", plan: old.plan, expiresAt: old.expiresAt });
    }

    // A new request keeps any access key and linked devices the record already had.
    const pr = await L.promo();
    const rec = Object.assign({}, old || {}, {
      id: b.id,
      plan: b.plan,
      method: b.method,
      contact,
      status: "pending",
      origin: true,
      createdAt: (old && old.createdAt) || now,
      updatedAt: now,
      approvedAt: null,
      expiresAt: null,
      offer: !!(pr && pr.plan === b.plan), // asked while the limited-time price was running
    });
    await L.redis([
      ["SET", key, JSON.stringify(rec)],
      ["SADD", "dp:ids", b.id],
    ]);
    return L.send(res, 200, { ok: true, status: "pending" });
  } catch (e) {
    return L.send(res, 500, { error: "server" });
  }
};
