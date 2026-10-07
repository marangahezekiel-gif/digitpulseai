"use strict";
// POST /api/deriv  { code, verifier }
// After a client logs in with Deriv, the site sends the one-time login code here. Deriv requires
// that this exchange happens on a server, not in the browser. The server swaps the code for a
// short-lived token, reads ONLY the account numbers, and throws the token away. Nothing from
// Deriv is stored or logged. The browser gets back just the account ids and whether each is
// real or demo (for the welcome message).
const L = require("./_lib");

const APP_ID = "34yJS0kUHIBFwADximqJH";
const SITE = "https://digitpulseai.site/";

module.exports = async (req, res) => {
  if (req.method !== "POST") return L.send(res, 405, { error: "method" });
  try {
    const b = L.body(req);
    const code = String(b.code || "");
    const verifier = String(b.verifier || "");
    if (!/^[A-Za-z0-9._~-]{8,512}$/.test(code) || !/^[A-Za-z0-9._~-]{43,128}$/.test(verifier)) {
      return L.send(res, 400, { error: "invalid" });
    }
    if (L.configured()) {
      const n = await L.hit("dp:rl:dv:" + L.ip(req), 3600);
      if (n > 20) return L.send(res, 429, { error: "rate" });
    }

    const t = await fetch("https://auth.deriv.com/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        client_id: APP_ID,
        code,
        code_verifier: verifier,
        redirect_uri: SITE,
      }).toString(),
      signal: AbortSignal.timeout(8000),
    });
    if (!t.ok) return L.send(res, 502, { error: "exchange" });
    const tj = await t.json();
    const token = tj && tj.access_token;
    if (typeof token !== "string" || !token) return L.send(res, 502, { error: "exchange" });

    const a = await fetch("https://api.derivws.com/trading/v1/options/accounts", {
      headers: { Authorization: "Bearer " + token, Accept: "application/json" },
      signal: AbortSignal.timeout(8000),
    });
    if (!a.ok) return L.send(res, 502, { error: "accounts" });
    const aj = await a.json();
    const list = (Array.isArray(aj && aj.data) ? aj.data : [])
      .filter((x) => x && typeof x.account_id === "string" && /^[A-Za-z0-9]{3,20}$/.test(x.account_id))
      .slice(0, 6)
      .map((x) => ({ id: x.account_id, type: x.account_type === "demo" ? "demo" : "real" }));
    return L.send(res, 200, { ok: true, accounts: list });
  } catch (e) {
    return L.send(res, 502, { error: "exchange" });
  }
};
