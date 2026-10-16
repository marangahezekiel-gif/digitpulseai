"use strict";
// Safaricom Daraja (M-Pesa Express / STK push) helpers. Off until every env var below is set.
//   MPESA_CONSUMER_KEY, MPESA_CONSUMER_SECRET  - from developer.safaricom.co.ke
//   MPESA_SHORTCODE, MPESA_PASSKEY             - the business till / paybill and its Lipa na M-Pesa passkey
//   MPESA_TXN_TYPE   CustomerBuyGoodsOnline (till, default) or CustomerPayBillOnline (paybill)
//   MPESA_PARTYB     optional, the till number when the shortcode is a store/head-office number
//   MPESA_CALLBACK_SECRET  any long random text; becomes part of the callback address
//   MPESA_ENV        "sandbox" to test, anything else = live
//   MPESA_KES_RATE   optional fixed USD->KES rate (otherwise a daily public rate is used)
const E = process.env;
const base = () => (E.MPESA_ENV === "sandbox" ? "https://sandbox.safaricom.co.ke" : "https://api.safaricom.co.ke");

function enabled() {
  return !!(E.MPESA_CONSUMER_KEY && E.MPESA_CONSUMER_SECRET && E.MPESA_SHORTCODE && E.MPESA_PASSKEY && E.MPESA_CALLBACK_SECRET);
}

// Where Safaricom sends its answer. Set SITE_URL to change it (for a staging site); no trailing slash.
function callbackBase() {
  const u = String(E.SITE_URL || "https://digitpulseai.site").replace(/\/+$/, "");
  return /^https:\/\/[a-z0-9.-]+(:[0-9]+)?$/i.test(u) ? u : "https://digitpulseai.site";
}

async function token() {
  const r = await fetch(base() + "/oauth/v1/generate?grant_type=client_credentials", {
    headers: { Authorization: "Basic " + Buffer.from(E.MPESA_CONSUMER_KEY + ":" + E.MPESA_CONSUMER_SECRET).toString("base64") },
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.access_token) throw new Error("daraja_token");
  return j.access_token;
}

function stamp() {
  const d = new Date(Date.now() + 3 * 3600 * 1000); // Nairobi time
  return d.toISOString().replace(/[-T:]/g, "").slice(0, 14);
}

function pass(ts) {
  return Buffer.from(E.MPESA_SHORTCODE + E.MPESA_PASSKEY + ts).toString("base64");
}

async function call(path, payload) {
  const t = await token();
  const r = await fetch(base() + path, {
    method: "POST",
    headers: { Authorization: "Bearer " + t, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const j = await r.json().catch(() => ({}));
  return { ok: r.ok, j };
}

async function push(amount, phone, callbackUrl) {
  const ts = stamp();
  return call("/mpesa/stkpush/v1/processrequest", {
    BusinessShortCode: E.MPESA_SHORTCODE,
    Password: pass(ts),
    Timestamp: ts,
    TransactionType: E.MPESA_TXN_TYPE || "CustomerBuyGoodsOnline",
    Amount: amount,
    PartyA: phone,
    PartyB: E.MPESA_PARTYB || E.MPESA_SHORTCODE,
    PhoneNumber: phone,
    CallBackURL: callbackUrl,
    AccountReference: "DigitpulseAi",
    TransactionDesc: "DigitpulseAi plan",
  });
}

async function query(checkoutId) {
  const ts = stamp();
  return call("/mpesa/stkpushquery/v1/query", {
    BusinessShortCode: E.MPESA_SHORTCODE,
    Password: pass(ts),
    Timestamp: ts,
    CheckoutRequestID: checkoutId,
  });
}

// 07xx / 01xx / 7xx / +254... -> 2547XXXXXXXX or null
function phone(s) {
  let d = String(s || "").replace(/[^0-9]/g, "");
  if (d.startsWith("254")) d = d.slice(3);
  else if (d.startsWith("0")) d = d.slice(1);
  return /^[17][0-9]{8}$/.test(d) ? "254" + d : null;
}

async function kesRate() {
  const fixed = Number(E.MPESA_KES_RATE);
  if (fixed > 0) return fixed;
  for (const u of ["https://latest.currency-api.pages.dev/v1/currencies/usd.json", "https://open.er-api.com/v6/latest/USD"]) {
    try {
      const j = await (await fetch(u)).json();
      const v = j.usd ? j.usd.kes : j.rates && j.rates.KES;
      if (v > 50 && v < 500) return v;
    } catch (e) {}
  }
  return 0;
}

module.exports = { callbackBase, enabled, push, query, phone, kesRate };
