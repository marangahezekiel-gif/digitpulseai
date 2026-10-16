"use strict";
// Shared helpers for the DigitpulseAi serverless functions.
// Storage is an Upstash Redis database (added from the Vercel Marketplace). Its REST
// credentials arrive as environment variables; both common names are supported.
const crypto = require("crypto");

const STORE_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const STORE_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

const PLANS = ["matches", "rfeo", "ou"];
const METHODS = ["usdt", "mpesa"];
const ID_RE = /^[a-f0-9]{32}$/;
const YEAR_MS = 365 * 24 * 60 * 60 * 1000;

// Access keys: 12 characters from an alphabet without 0/O/1/I, so they are easy to read out.
// A key can unlock the plan on at most MAX_DEVICES devices (the client's own device counts).
const KEY_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const MAX_DEVICES = 2;

function configured() {
  return !!(STORE_URL && STORE_TOKEN);
}

// Run one or more Redis commands in a single round trip. Returns an array of results.
async function redis(commands) {
  const r = await fetch(STORE_URL.replace(/\/$/, "") + "/pipeline", {
    method: "POST",
    headers: { Authorization: "Bearer " + STORE_TOKEN, "Content-Type": "application/json" },
    body: JSON.stringify(commands),
  });
  if (!r.ok) throw new Error("store " + r.status);
  const out = await r.json();
  return out.map((x) => {
    if (x && x.error) throw new Error(x.error);
    return x ? x.result : null;
  });
}

function send(res, code, obj) {
  res.statusCode = code;
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'");
  res.end(JSON.stringify(obj));
}

function body(req) {
  let b = req.body;
  if (typeof b === "string") {
    try {
      b = JSON.parse(b);
    } catch (e) {
      b = null;
    }
  }
  return b && typeof b === "object" ? b : {};
}

// Hashed client address, used only as a rate-limit key (never stored with a request).
function ip(req) {
  const raw =
    String(req.headers["x-vercel-forwarded-for"] || "").split(",")[0].trim() ||
    String(req.headers["x-forwarded-for"] || "").split(",")[0].trim() ||
    String(req.headers["x-real-ip"] || "") ||
    "unknown";
  return crypto.createHash("sha256").update(raw).digest("hex").slice(0, 24);
}

// Count a hit against a key; the counter expires `seconds` after the first hit.
// If the timer is ever missing (for example a request died between the two steps), it is put back,
// so a counter can never stay stuck and block an address for good.
async function hit(key, seconds) {
  const [n, ttl] = await redis([["INCR", key], ["TTL", key]]);
  if (n === 1 || !(Number(ttl) > 0)) await redis([["EXPIRE", key, seconds]]);
  return n;
}

// Browsers attach an Origin header to cross-site requests. Anything that comes from another website is
// refused, so a page on some other site cannot make a visitor's browser call these endpoints.
// Calls without an Origin header (the Safaricom callback, curl, server to server) are not browser calls.
function sameOrigin(req) {
  const h = req.headers || {};
  if (String(h["sec-fetch-site"] || "") === "cross-site") return false;
  const o = String(h.origin || "");
  if (!o || o === "null") return o === "";
  try {
    const host = String(h["x-forwarded-host"] || h.host || "").toLowerCase();
    return new URL(o).host.toLowerCase() === host;
  } catch (e) {
    return false;
  }
}

// Compare two secrets without leaking, through timing, how much of the guess was right.
function safeEq(a, b) {
  const x = crypto.createHash("sha256").update(String(a)).digest();
  const y = crypto.createHash("sha256").update(String(b)).digest();
  return crypto.timingSafeEqual(x, y);
}

// Reject oversized requests before reading them (the forms here send a few hundred bytes).
function tooBig(req) {
  return Number((req.headers || {})["content-length"] || 0) > 20000;
}

function keyOf(id) {
  return "dp:req:" + id;
}

// An approved record past its end date reads as "expired".
function effective(rec) {
  if (rec && rec.status === "approved" && rec.expiresAt && Date.now() > rec.expiresAt) {
    return Object.assign({}, rec, { status: "expired" });
  }
  return rec;
}

// The limited-time offer the owner starts from /admin: Matches / Differs at a lower price until a fixed end time.
// It is stored with a matching expiry, so once the end time passes it is simply gone.
const PROMO_KEY = "dp:promo";
const PROMO_PLAN = "matches";
const PROMO_PRICE = 80;
const PROMO_MS = 8 * 60 * 60 * 1000;
async function promo() {
  const [v] = await redis([["GET", PROMO_KEY]]);
  if (!v) return null;
  try {
    const p = JSON.parse(v);
    return p && p.endsAt > Date.now() ? { plan: PROMO_PLAN, price: PROMO_PRICE, endsAt: p.endsAt } : null;
  } catch (e) {
    return null;
  }
}

function cleanText(s, max) {
  return String(s || "")
    .replace(/[\u0000-\u001f\u007f<>]/g, "")
    .trim()
    .slice(0, max);
}

function newId() {
  return crypto.randomBytes(16).toString("hex");
}

function newKey() {
  const b = crypto.randomBytes(12);
  let s = "";
  for (let i = 0; i < 12; i++) s += KEY_CHARS[b[i] & 31]; // 32 characters, so no bias
  return s;
}

// Accepts "DPAI-ABCD-EFGH-JKLM", lower case, spaces, no dashes... Returns the 12 characters or null.
function cleanKey(input) {
  let s = String(input || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (s.length === 16 && s.indexOf("DPAI") === 0) s = s.slice(4);
  return /^[A-HJ-NP-Z2-9]{12}$/.test(s) ? s : null;
}

// Lookup entry: key -> record id. Only a hash of the key is used as the database key.
function keyIdx(k) {
  return "dp:key:" + crypto.createHash("sha256").update("dpai-key:" + k).digest("hex");
}

// Lookup entry: a device that redeemed a key -> the record it unlocks.
function linkOf(cid) {
  return "dp:link:" + cid;
}

function deviceCount(rec) {
  return (rec.origin ? 1 : 0) + (Array.isArray(rec.devices) ? rec.devices.length : 0);
}

module.exports = {
  configured,
  redis,
  send,
  body,
  ip,
  hit,
  sameOrigin,
  safeEq,
  tooBig,
  keyOf,
  effective,
  cleanText,
  newId,
  newKey,
  cleanKey,
  keyIdx,
  linkOf,
  deviceCount,
  promo,
  PROMO_KEY,
  PROMO_MS,
  PLANS,
  METHODS,
  ID_RE,
  YEAR_MS,
  MAX_DEVICES,
};
