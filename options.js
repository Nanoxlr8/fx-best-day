// options.js
/* global chrome, fxCore */
const $ = (id) => document.getElementById(id);
const DEFAULTS = {
  base: "USD", quote: "EGP", apiKey: "", wantHigh: true, notify: false,
  proKey: "", watchlist: [], notifyThresholdPct: 0.5
};

let state = Object.assign({}, DEFAULTS);

function renderWatchlist() {
  const box = $("watchlist");
  box.innerHTML = "";
  if (!state.watchlist.length) {
    box.innerHTML = '<div class="hint">No extra pairs. Add one to track multiple currencies.</div>';
  }
  state.watchlist.forEach((p, i) => {
    const row = document.createElement("div");
    row.className = "wl-item";
    row.innerHTML = `
      <input data-i="${i}" data-f="base" maxlength="3" value="${p.base || ""}" placeholder="Base" />
      <input data-i="${i}" data-f="quote" maxlength="3" value="${p.quote || ""}" placeholder="Quote" />
      <button type="button" class="wl-remove" data-rm="${i}">✕</button>`;
    box.appendChild(row);
  });
  box.querySelectorAll("input[data-f]").forEach(inp => {
    inp.addEventListener("input", () => {
      state.watchlist[+inp.dataset.i][inp.dataset.f] = inp.value.toUpperCase();
    });
  });
  box.querySelectorAll("[data-rm]").forEach(b => {
    b.addEventListener("click", () => { state.watchlist.splice(+b.dataset.rm, 1); renderWatchlist(); });
  });
}

function applyProUI(unlocked) {
  $("proBody").classList.toggle("locked", !unlocked);
  $("proLock").style.display = unlocked ? "none" : "block";
}

chrome.storage.local.get(["fx_settings"], (r) => {
  state = Object.assign({}, DEFAULTS, r.fx_settings || {});
  $("base").value = state.base;
  $("quote").value = state.quote;
  $("apiKey").value = state.apiKey || "";
  $("wantHigh").checked = !!state.wantHigh;
  $("notify").checked = !!state.notify;
  $("proKey").value = state.proKey || "";
  $("notifyThresholdPct").value = state.notifyThresholdPct ?? 0.5;
  renderWatchlist();
  const unlocked = fxCore.verifyProKey(state.proKey);
  applyProUI(unlocked);
});

$("unlock").addEventListener("click", async () => {
  const val = $("proKey").value.trim();
  state.proKey = val;
  if (!val) { applyProUI(false); return; }
  $("unlock").textContent = "…";
  const ok = await fxCore.verifyProKey(val);
  $("unlock").textContent = "Unlock";
  applyProUI(ok);
  if (!ok) {
    $("proLock").querySelector(".hint").textContent =
      fxCore.isProVerifyRemote() ? "Invalid or refunded key. Get Pro from Gumroad."
                                 : "Invalid key format. Get Pro from Gumroad.";
  }
});

$("addPair").addEventListener("click", () => {
  state.watchlist.push({ base: "", quote: "" });
  renderWatchlist();
});

$("genDigest").addEventListener("click", () => {
  const settings = {
    base: ($("base").value || "USD").toUpperCase(),
    quote: ($("quote").value || "EGP").toUpperCase(),
    apiKey: $("apiKey").value.trim(),
    wantHigh: $("wantHigh").checked,
    notifyThresholdPct: parseFloat($("notifyThresholdPct").value) || 0.5
  };
  const cfg = fxCore.buildDigestConfig(settings, state.watchlist);
  const blob = new Blob([JSON.stringify(cfg, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "fx_digest_config.json";
  a.click();
  URL.revokeObjectURL(a.href);
  $("saved").textContent = "Digest config downloaded ✓ (place in Hermes cron dir)";
  setTimeout(() => ($("saved").textContent = ""), 3000);
});

$("save").addEventListener("click", () => {
  state.base = ($("base").value || "USD").toUpperCase();
  state.quote = ($("quote").value || "EGP").toUpperCase();
  state.apiKey = $("apiKey").value.trim();
  state.wantHigh = $("wantHigh").checked;
  state.notify = $("notify").checked;
  state.proKey = $("proKey").value.trim();
  state.notifyThresholdPct = parseFloat($("notifyThresholdPct").value) || 0.5;
  chrome.storage.local.set({ fx_settings: state }, () => {
    const el = $("saved");
    el.textContent = "Saved ✓";
    setTimeout(() => (el.textContent = ""), 2000);
  });
});
