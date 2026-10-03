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
    String(req.headers["x-forwarded-for"] || "").split(",")[0].trim() ||
    String(req.headers["x-real-ip"] || "") ||
    "unknown";
  return crypto.createHash("sha256").update(raw).digest("hex").slice(0, 24);
}

// Count a hit against a key; the counter expires `seconds` after the first hit.
async function hit(key, seconds) {
  const [n] = await redis([["INCR", key]]);
  if (n === 1) await redis([["EXPIRE", key, seconds]]);
  return n;
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

module.exports = {
  configured,
  redis,
  send,
  body,
  ip,
  hit,
  keyOf,
  effective,
  PLANS,
  METHODS,
  ID_RE,
  YEAR_MS,
};
