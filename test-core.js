// test-core.js — smoke test for fx-core.js logic (no browser needed)
const fx = require("./fx-core.js");

function assert(cond, msg) {
  if (!cond) { console.error("FAIL:", msg); process.exitCode = 1; }
  else console.log("ok  -", msg);
}

(async () => {
  // Build 10 days of history, rate trending up then dipping.
  const hist = [];
  let r = 50.0;
  for (let i = 0; i < 10; i++) {
    hist.push({ date: `2026-08-${String(10 + i).padStart(2, "0")}`, rate: r });
    r += (i < 6 ? 0.2 : -0.15);
  }
  const recent = fx.lastNDays(hist, 7).map(x => x.rate);
  assert(Math.abs(fx.avg(recent) - 50.90) < 0.01, "7-day avg computed");
  assert(Math.abs(fx.maxOf(recent) - 51.2) < 1e-9, "max found");
  assert(Math.abs(fx.minOf(recent) - 50.6) < 1e-9, "min found");

  const v1 = fx.computeVerdict(51.2, hist, true);
  assert(v1.level === "convert", "at-peak => convert");
  const v2 = fx.computeVerdict(50.7, hist, true);
  assert(v2.level === "wait", "below-avg => wait");
  const v3 = fx.computeVerdict(50.0, [{ date: "2026-08-20", rate: 50.0 }], true);
  assert(v3.level === "wait" && /early/.test(v3.text), "insufficient history => too early");

  const h2 = fx.recordHistory(hist, 99.9);
  assert(h2[h2.length - 1].rate === 99.9, "recordHistory appends");
  assert(h2.length <= 60, "recordHistory trims to 60");

  const best = fx.bestDayThisWeek(hist, 50.7, true);
  assert(best.bestDate && Math.abs(best.bestRate - 51.2) < 1e-9, "bestDayThisWeek finds the peak");
  assert(best.isTodayBest === false, "today (50.7) is not the best");
  const bestToday = fx.bestDayThisWeek([{ date: "2026-08-20", rate: 50.0 }], 50.0, true);
  assert(bestToday.isTodayBest === true, "same-day rate => isTodayBest");

  const exp = fx.exportHistory(hist);
  const imp = fx.importHistory(exp);
  assert(imp.length === hist.length, "export/import roundtrip preserves count");

  // Pro key gate
  const key = fx.makeProKey(7);
  assert(fx.verifyProKeyLocal(key) === true, "generated Pro key verifies (local)");
  assert(fx.verifyProKeyLocal("FXPRO-BADKEY-00") === false, "bad Pro key rejected (local)");
  assert(fx.verifyProKeyLocal("") === false, "empty Pro key rejected (local)");
  assert(fx.verifyProKeyLocal("not-a-key") === false, "random string rejected (local)");
  assert(await fx.verifyProKey(key) === true, "async verify trusts local when no remote");
  assert(await fx.verifyProKey("garbage") === false, "async verify rejects garbage");
  assert(fx.isProVerifyRemote() === false, "remote verify off in node");

  // digest config builder
  const cfg = fx.buildDigestConfig(
    { base: "USD", quote: "EGP", apiKey: "K", wantHigh: true },
    [{ base: "gbp", quote: "egp", wantHigh: true }]
  );
  assert(cfg.pairs.length === 1, "watchlist drives pairs");
  assert(cfg.pairs[0].base === "GBP" && cfg.pairs[0].quote === "EGP", "pairs uppercased");
  assert(cfg.apiKey === "K", "apiKey forwarded");
  const cfgLite = fx.buildDigestConfig({ base: "USD", quote: "EGP", wantHigh: true }, []);
  assert(cfgLite.pairs.length === 1 && cfgLite.pairs[0].base === "USD", "empty watchlist => single default pair");

  console.log("\nAll core-logic tests passed.");
})();
