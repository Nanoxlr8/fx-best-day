// popup.js — UI controller. Uses fx-core.js (loaded as a module-free script).
/* global fxCore, chrome */

const $ = (id) => document.getElementById(id);

function getSettings() {
  return new Promise((resolve) => {
    chrome.storage.local.get(["fx_settings"], (r) => {
      resolve(Object.assign(
        { base: "USD", quote: "EGP", apiKey: "", wantHigh: true },
        r.fx_settings || {}
      ));
    });
  });
}

function getHistory() {
  return new Promise((resolve) => {
    chrome.storage.local.get(["fx_history"], (r) => resolve(r.fx_history || []));
  });
}

function saveHistory(h) {
  return new Promise((resolve) => chrome.storage.local.set({ fx_history: h }, resolve));
}

function toast(msg) {
  const t = $("toast");
  t.textContent = msg;
  t.classList.add("show");
  setTimeout(() => t.classList.remove("show"), 2200);
}

function setLoading(on) {
  $("refreshBtn").disabled = on;
  $("rateNow").textContent = on ? "…" : $("rateNow").textContent;
  $("rateSub").textContent = on ? "fetching…" : $("rateSub").textContent;
}

function drawSpark(history) {
  const cv = $("spark");
  const ctx = cv.getContext("2d");
  ctx.clearRect(0, 0, cv.width, cv.height);
  const pts = history.slice(-30).map(h => h.rate);
  if (pts.length < 2) return;
  const min = Math.min(...pts), max = Math.max(...pts);
  const range = max - min || 1;
  const w = cv.width, h = cv.height, pad = 6;
  ctx.beginPath();
  pts.forEach((p, i) => {
    const x = pad + (i / (pts.length - 1)) * (w - pad * 2);
    const y = h - pad - ((p - min) / range) * (h - pad * 2);
    i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
  });
  ctx.strokeStyle = "#2f7df6";
  ctx.lineWidth = 2;
  ctx.stroke();
}

function fmtDate(iso) {
  // 2026-08-20 -> 20 Aug
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString([], { day: "numeric", month: "short" });
}

async function render() {
  const settings = await getSettings();
  $("pairLabel").textContent = `${settings.base} → ${settings.quote}`;
  setLoading(true);
  try {
    let history = await getHistory();
    const rate = await fxCore.fetchRate(settings.base, settings.quote, settings.apiKey);
    history = fxCore.recordHistory(history, rate);
    await saveHistory(history);

    const recent = fxCore.lastNDays(history, 7).map(r => r.rate);
    const v = fxCore.computeVerdict(rate, history, settings.wantHigh);
    const best = fxCore.bestDayThisWeek(history, rate, settings.wantHigh);

    $("rateNow").textContent = `${rate.toFixed(3)} ${settings.quote}`;
    $("rateSub").textContent = `1 ${settings.base} = ${rate.toFixed(4)} ${settings.quote}`;
    $("verdictText").textContent = v.text;
    $("verdictReason").textContent = v.reason;
    document.querySelector(".verdict").style.borderLeftColor =
      v.level === "convert" ? "#3fbf6f" : "#f5a623";

    $("avg7").textContent = fxCore.avg(recent)?.toFixed(3) ?? "—";
    $("high7").textContent = fxCore.maxOf(recent)?.toFixed(3) ?? "—";
    $("low7").textContent = fxCore.minOf(recent)?.toFixed(3) ?? "—";

    // Best-day-this-week line
    if (best) {
      if (best.isTodayBest) {
        $("verdictReason").textContent += ` Today is the best day so far this week.`;
      } else {
        $("verdictReason").textContent += ` Best this week was ${fmtDate(best.bestDate)} (${best.bestRate.toFixed(3)}), ${best.pctOff.toFixed(1)}% better.`;
      }
    }

    drawSpark(history);
    $("updated").textContent = "updated " + new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch (e) {
    setLoading(false);
    $("rateSub").textContent = "error";
    const msg = /pair not found/.test(e.message)
      ? "Pair not found — check base/quote in settings"
      : /timed out/.test(e.message)
        ? "Request timed out — check connection"
        : "Failed: " + e.message;
    toast(msg);
    return;
  }
  setLoading(false);
}

// Export / import history
$("exportBtn").addEventListener("click", async () => {
  const history = await getHistory();
  const blob = new Blob([fxCore.exportHistory(history)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `fx-history-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
  toast("History exported");
});

$("importBtn").addEventListener("click", () => $("importFile").click());
$("importFile").addEventListener("change", async (ev) => {
  const file = ev.target.files[0];
  if (!file) return;
  try {
    const text = await file.text();
    const imported = fxCore.importHistory(text);
    const existing = await getHistory();
    // merge by date
    const map = new Map(existing.map(h => [h.date, h]));
    imported.forEach(h => map.set(h.date, h));
    const merged = [...map.values()].sort((a, b) => a.date.localeCompare(b.date)).slice(-60);
    await saveHistory(merged);
    toast(`Imported ${imported.length} day(s)`);
    render();
  } catch (e) {
    toast("Import failed: " + e.message);
  }
  ev.target.value = "";
});

document.addEventListener("DOMContentLoaded", () => {
  $("refreshBtn").addEventListener("click", render);
  $("settingsBtn").addEventListener("click", () => chrome.runtime.openOptionsPage());
  render();
});
