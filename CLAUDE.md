# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

WT-X ("walltrade X") is a trading journal / dashboard ("Journal de Trading") built as **one self-contained HTML file**: `Journal_Trading_Dashboard_CMVP2_FinalGaps_Fix3.html` (~10.9k lines, ~600 KB), the current working version. The UI, code comments, and identifiers are mostly in **French**; keep new UI text and comments in French to match.

There is no build system, package manager, or linter. To run it, open the file in a browser. External dependencies are CDN scripts only: Chart.js 4.4.4 (cdnjs, with a jsdelivr fallback loaded at runtime) and SheetJS/xlsx 0.18.5, plus Google Fonts.

## File layout

- Lines ~1–1579: one `<style>` block. Design tokens are CSS custom properties on `:root`. Some tokens are self-referencing placeholders (e.g. `--bg-elevated:var(--bg-elevated)`); the theme engine sets the real values at runtime with `style.setProperty`, so change colors through the theme engine, not only in `:root`.
- Lines ~1581–2874: HTML markup. Each app page is a `<section class="view" id="view-…">` (dashboard, trades-en-cours, comptes, bilans, calendrier, rapports, backtesting, playbook, notebook, plus placeholder views). `showView(id)` switches between them. Most interaction goes through inline `onclick="…"` handlers that call global functions.
- Lines ~2875–10867: one `<script>`, made of sections with banner comments like `/* ===== STORAGE ===== */`, `/* ===== MODULE PLAYBOOK ===== */`, `/* ===== NOTEBOOK : moteur ===== */`, `/* ===== INIT ===== */`. To find a feature, grep for its banner. Line numbers shift after every edit, so use `Edit` with unique string anchors.

## Architecture

**Global mutable state.** Everything lives in top-level `let` globals declared in the `STATE` section: `SETTINGS`, `TRADES` (closed trades), `OPEN_TRADES` (open and pending positions), `ACCOUNTS`/`currentAccountId`, `DASHBOARD_LAYOUT`, `REPORTS`, `STRATEGIES`, `PERIOD_NOTES`, `NOTEBOOK`, and others. There are no modules or framework. Functions mutate the globals, call the matching `persistX()`, then re-render.

**Persistence uses `window.storage`, not `localStorage`.** All reads and writes are `await window.storage.get(key, false)` / `window.storage.set(key, json, false)`, which is the async key-value API of the Claude.ai artifact host. This file never defines it. Opened as a plain local file, every storage call throws, the `try/catch` swallows the error, and the app runs with defaults and seed data that are never saved. Keys are scoped per account: `trades_<accId>`, `open_trades_<accId>`, `settings_<accId>`, `periodNotes_<accId>`, `dashboard_layout_<accId>`, `reports_<accId>`, `strategies_<accId>`, `notebook_<accId>`, `theme_library_<accId>`, `theme_active_<accId>`. The global keys are `accounts` and `currentAccountId`. `loadState()` → `loadAccountData()` also migrates legacy single-account data and older trade shapes. These migrations must stay **non-destructive**: they only fill in missing fields and never delete or rewrite existing values.

**Rendering.** `renderAll()` calls `buildSeries()` once to get the equity/capital series from `TRADES`, then runs each widget renderer inside a `safe()` wrapper, so one renderer failing doesn't break the rest. Chart renderers must not call `new Chart` until Chart.js has loaded. The `CHART.JS : CHARGEMENT ROBUSTE` section (`ensureChartJsWatcher`, `onChartJsBecameReady`) handles late loading and the CDN fallback.

**R-multiple / P&L engine: rules the code depends on.** These are documented throughout the comments (labelled "Phase A/B/C", "MVP moteur", "C-MVP1/2"):
- Each calculation has one "source unique de vérité" helper. Reuse it instead of re-deriving the math: `computeRRFromPrices` (`calcRR` is an alias), `computePlannedR` (weighted across multiple TPs), `deriveTradeResultFromRealizedR` (TP/SL/BE comes strictly from the sign of Realized R), `tradeRealizedR`, `computeRealizedRFromPnL`, `computeRiskAmountAtEntry`, `getCurrentCapital`, plus the Profit Factor and Win Rate helpers in `BREAKDOWN STATS`.
- **Never invent a value.** Missing, invalid, NaN, or ±Infinity inputs return `null` (meaning "unknown"), never `0`. An unknown R is not Break Even. Keep this when adding code paths: no `(x||0)` fallbacks on financial values.
- Keep full precision internally and round only for display (e.g. `fRRFullPrecision` alongside the rounded `#fRR` field).
- `realizedPnL`, `capitalAtEntry`, and `riskAmountAtEntry` are fixed when a trade opens or closes. `buildSeries` treats `realizedPnL` as the source of truth for P&L, and capital is derived from it, never the other way round.
- Open-position flows (opening, multi-TP partial closes in `confirmCloseTrade`, triggering pending orders) validate *everything* before changing any state. Numeric parsing is strict (it does not use `parseFloat`'s permissive behaviour).

**Execution spec & volume (C-MVP2)** live under the `SPÉCIFICATION D'EXÉCUTION & VOLUME` banner. `getInstrumentExecutionSpec(symbol, broker, account)` resolves constraints in priority order: broker, platform, verified instrument, WT-X profile, unknown. Specs are added through `registerInstrumentExecutionSpec()`; there is no made-up broker database. Automatic volume is floored to the step by `normalizeAutomaticVolume`. Manual input goes through `validateManualVolume`, which rejects values instead of rounding them silently. Out-of-range values, or volumes with an unknown spec, return explicit error codes (`BELOW_MIN`, `ABOVE_MAX`, `EXECUTION_SPEC_UNKNOWN`) rather than being clamped. `formatExecutionVolume` shows a volume with as many decimals as the step allows.

**Other subsystems** (each under its own banner): the theme engine (theme library, palette generator, 9-shade ramp), the modular dashboard widgets (layout order, widths and sizes in `DASHBOARD_LAYOUT`, long-press drag, resize), the trading calendar, reports with period comparison, backtesting/replay, the playbook (strategies and instrument specs), and a Notion-like notebook (a block tree with pages, slash menu, drag & drop, tables, columns, embeds).

## Tests

`tests/wtx_cmvp2_volume_tests.js` is an in-page browser harness, not a Node test. Serve the repo root over a local HTTP server (e.g. `npx http-server` or `python -m http.server`), open the Fix3 page, and run this in the devtools console:

```js
window.__wtxErrors = window.__wtxErrors || [];
eval(await (await fetch('/tests/wtx_cmvp2_volume_tests.js')).text());
await window.__wtxRunTests();
```

Loading the script only defines `window.__wtxRunTests`; calling it runs the suites and returns (and stores in `window.__wtxTestReport`) a report with `total`, `pass`, `fail`, `bySuite` and `failures`. The harness snapshots and restores `TRADES`, `OPEN_TRADES` and `SETTINGS`, and stubs `alert`/`confirm`. It reads `window.__wtxErrors`, which the page does not define, so it must exist before the run (ideally filled by a `window.onerror` collector so JS errors show up in `jsErrors`). The usage comment at the top of the test file returns `__wtxTestReport` without calling `__wtxRunTests`, so it returns `null`. The last recorded run was 174/174.
