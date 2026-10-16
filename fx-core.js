// Shared FX logic — used by popup and background.
// Kept dependency-free so it runs in the extension and in Node tests.

const DEFAULT_BASE = "USD";
const DEFAULT_QUOTE = "EGP";
const HISTORY_KEY = "fx_history";
const SETTINGS_KEY = "fx_settings";
const NO_KEY_ENDPOINT = "https://open.er-api.com/v6/latest/"; // free, no key, current only
const KEYED_ENDPOINT = "https://v6.exchangerate-api.com/v6/";  // needs API key

// ---- Pure functions (testable) ----

function lastNDays(history, n) {
  // history: [{date:'YYYY-MM-DD', rate:Number}]
  return history.slice(-n);
}

function avg(arr) {
  if (!arr.length) return null;
  return arr.reduce((s, x) => s + x, 0) / arr.length;
}

function maxOf(arr) { return arr.length ? Math.max(...arr) : null; }
function minOf(arr) { return arr.length ? Math.min(...arr) : null; }

// Decide verdict. `wantHigh` = true means user wants to SELL base / get max quote
// (e.g. convert USD salary to EGP -> want high EGP per USD).
function computeVerdict(rate, history, wantHigh = true) {
  const recent = lastNDays(history, 7).map(r => r.rate);
  if (recent.length < 5) {
    return {
      text: "Too early to call",
      reason: `Only ${recent.length} day(s) logged. Check back after ~5 days for a real signal.`,
      level: "wait",
    };
  }
  const a7 = avg(recent);
  const hi = maxOf(recent);
  const lo = minOf(recent);
  const peakPct = ((hi - rate) / hi) * 100; // how far below the peak we are

  if (peakPct <= 0.5) {
    return { text: "Convert today — near the peak", reason: `Rate is within 0.5% of the 7-day high (${hi.toFixed(3)}).`, level: "convert" };
  }
  if (rate > a7) {
    return { text: "Reasonable to convert today", reason: `Slightly above the 7-day average (${a7.toFixed(3)}).`, level: "convert" };
  }
  return { text: "Worth waiting a day or two", reason: `Below the 7-day average (${a7.toFixed(3)}); could improve.`, level: "wait" };
}

// ---- Async data ----

async function fetchRate(base, quote, apiKey, timeoutMs = 10000) {
  let url, parser;
  if (apiKey && apiKey.trim()) {
    url = KEYED_ENDPOINT + apiKey.trim() + "/latest/" + base;
    parser = (d) => d.conversion_rates[quote];
  } else {
    url = NO_KEY_ENDPOINT + base;
    parser = (d) => d.rates[quote];
  }
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  let res;
  try {
    res = await fetch(url, { signal: ctrl.signal });
  } catch (e) {
    if (e.name === "AbortError") throw new Error("request timed out");
    throw new Error("network error");
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) throw new Error("HTTP " + res.status);
  const data = await res.json();
  if (data.result && data.result !== "success") throw new Error(data.error || "api error");
  const rate = parser(data);
  if (typeof rate !== "number") throw new Error("pair not found");
  return rate;
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

// ---- Pro license gate ----
// Lite: single pair, no watchlist, no digest config.
// Pro: unlocked by a license key.
//
// Two-layer verification:
//  1) Local checksum (offline, fast reject of malformed keys).
//  2) Remote Gumroad check via a serverless worker (real enforcement).
//     Set VERIFY_URL to your deployed worker. If blank or unreachable,
//     we fall back to local-only (still deters casual copying).
const PRO_KEY_PREFIX = "FXPRO-";
const VERIFY_URL = ""; // Set to the deployed worker's verification endpoint.

function verifyProKeyLocal(key) {
  if (!key || typeof key !== "string") return false;
  const k = key.trim().toUpperCase();
  if (!k.startsWith(PRO_KEY_PREFIX)) return false;
  const body = k.slice(PRO_KEY_PREFIX.length);
  if (!/^[0-9A-Z]{6,}-[0-9]{2}$/.test(body)) return false;
  const main = body.slice(0, -3);
  let sum = 0;
  for (const c of main) sum += c.charCodeAt(0);
  const suffix = parseInt(body.slice(-2), 10);
  return sum % 97 === suffix;
}

// Async: try remote verify, fall back to local checksum.
async function verifyProKey(key) {
  if (!verifyProKeyLocal(key)) return false;
  if (!VERIFY_URL) return true; // offline / not configured -> trust local
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 8000);
    const res = await fetch(`${VERIFY_URL}?key=${encodeURIComponent(key.trim().toUpperCase())}`, { signal: ctrl.signal });
    clearTimeout(t);
    if (!res.ok) return verifyProKeyLocal(key); // network issue -> local trust
    const data = await res.json();
    return !!data.valid;
  } catch {
    return verifyProKeyLocal(key); // unreachable -> local trust
  }
}

function isProVerifyRemote() {
  return !!VERIFY_URL;
}

// Build a valid demo key (for your own testing / generation script).
function makeProKey(seed) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let main = "";
  let s = (seed || 1) * 2654435761 >>> 0;
  for (let i = 0; i < 8; i++) {
    s = (s * 1103515245 + 12345) >>> 0;
    main += chars[s % chars.length];
  }
  let sum = 0;
  for (const c of main) sum += c.charCodeAt(0);
  const suffix = String(sum % 97).padStart(2, "0");
  return PRO_KEY_PREFIX + main + "-" + suffix;
}

// Best day THIS WEEK: among the last 7 calendar days, find the day closest to
// the user's goal. wantHigh=true -> best = max rate; false -> min rate.
// Returns { bestDate, bestRate, todayRate, pctOff, isTodayBest }.
function bestDayThisWeek(history, rate, wantHigh = true) {
  const week = lastNDays(history, 7);
  if (week.length === 0) return null;
  let best = week[0];
  for (const r of week) {
    if (wantHigh ? r.rate > best.rate : r.rate < best.rate) best = r;
  }
  const pctOff = best.rate === 0 ? 0 : Math.abs((best.rate - rate) / best.rate) * 100;
  return {
    bestDate: best.date,
    bestRate: best.rate,
    todayRate: rate,
    pctOff,
    isTodayBest: Math.abs(best.rate - rate) < 1e-9,
  };
}

// Export/import history as JSON string (for backup / sync across machines).
function exportHistory(history) {
  return JSON.stringify({ type: "fx-best-day-history", version: 1, history }, null, 2);
}
function importHistory(text) {
  const data = JSON.parse(text);
  if (!data || !Array.isArray(data.history)) throw new Error("invalid file");
  // basic shape check
  const ok = data.history.every(h => h && typeof h.date === "string" && typeof h.rate === "number");
  if (!ok) throw new Error("malformed history");
  return data.history.slice(-60);
}

// Merge today's rate into history (dedupe by date), keep last 60.
function recordHistory(history, rate) {
  const date = todayStr();
  const out = history.filter(h => h.date !== date);
  out.push({ date, rate });
  return out.slice(-60);
}

// Generate the digest config the Hermes cron job consumes.
// Output: JSON written to fx_digest_config.json (read by the Telegram digest job).
// Pairs come from the Pro watchlist; threshold triggers a "convert now" alert.
function buildDigestConfig(settings, watchlist) {
  const pairs = (watchlist && watchlist.length ? watchlist : [{
    base: settings.base, quote: settings.quote, wantHigh: settings.wantHigh
  }]).map(p => ({
    base: (p.base || "USD").toUpperCase(),
    quote: (p.quote || "EGP").toUpperCase(),
    wantHigh: p.wantHigh !== false
  }));
  return {
    version: 1,
    generated: todayStr(),
    apiKey: settings.apiKey || "",
    notifyThresholdPct: settings.notifyThresholdPct ?? 0.5,
    pairs
  };
}

// ---- Node export for tests ----
if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    computeVerdict, lastNDays, avg, maxOf, minOf, recordHistory, todayStr,
    bestDayThisWeek, exportHistory, importHistory,
    verifyProKey, verifyProKeyLocal, isProVerifyRemote, makeProKey,
    buildDigestConfig
  };
}
