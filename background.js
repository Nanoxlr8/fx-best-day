// background.js — daily alarm + optional threshold notification.
// fx-core logic is inlined (MV3 service workers can't share page scripts).
/* global chrome */

function recordHistory(history, rate) {
  const date = new Date().toISOString().slice(0, 10);
  const out = history.filter(h => h.date !== date);
  out.push({ date, rate });
  return out.slice(-60);
}
function lastNDays(history, n) { return history.slice(-n); }
function avg(arr) { return arr.length ? arr.reduce((s, x) => s + x, 0) / arr.length : null; }
function maxOf(arr) { return arr.length ? Math.max(...arr) : null; }
function minOf(arr) { return arr.length ? Math.min(...arr) : null; }
function computeVerdict(rate, history, wantHigh) {
  const recent = lastNDays(history, 7).map(r => r.rate);
  if (recent.length < 5) return { text: "Too early to call", level: "wait" };
  const a7 = avg(recent), hi = maxOf(recent);
  if (((hi - rate) / hi) * 100 <= 0.5) return { text: "Convert today — near the peak", level: "convert" };
  if (rate > a7) return { text: "Reasonable to convert today", level: "convert" };
  return { text: "Worth waiting a day or two", level: "wait" };
}
async function fetchRate(base, quote, apiKey) {
  let url, parser;
  if (apiKey && apiKey.trim()) {
    url = "https://v6.exchangerate-api.com/v6/" + apiKey.trim() + "/latest/" + base;
    parser = (d) => d.conversion_rates[quote];
  } else {
    url = "https://open.er-api.com/v6/latest/" + base;
    parser = (d) => d.rates[quote];
  }
  const res = await fetch(url);
  if (!res.ok) throw new Error("HTTP " + res.status);
  const data = await res.json();
  const rate = parser(data);
  if (typeof rate !== "number") throw new Error("pair not found");
  return rate;
}

function getSettings() {
  return new Promise((resolve) => chrome.storage.local.get(["fx_settings"], (r) =>
    resolve(Object.assign({ base: "USD", quote: "EGP", apiKey: "", wantHigh: true, notify: false }, r.fx_settings || {}))));
}
function getHistory() {
  return new Promise((resolve) => chrome.storage.local.get(["fx_history"], (r) => resolve(r.fx_history || [])));
}
function saveHistory(h) {
  return new Promise((resolve) => chrome.storage.local.set({ fx_history: h }, resolve));
}

chrome.alarms.create("dailyFx", { periodInMinutes: 60 * 18 });

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== "dailyFx") return;
  const s = await getSettings();
  const history = await getHistory();
  try {
    const rate = await fetchRate(s.base, s.quote, s.apiKey);
    const updated = recordHistory(history, rate);
    await saveHistory(updated);
    const v = computeVerdict(rate, updated, s.wantHigh);
    if (s.notify && v.level === "convert") {
      chrome.notifications.create({
        type: "basic",
        iconUrl: "icons/icon48.png",
        title: `FX Best-Day: convert ${s.base}→${s.quote} now`,
        message: `${rate.toFixed(3)} — ${v.text}.`,
      });
    }
  } catch (e) { /* silent */ }
});
