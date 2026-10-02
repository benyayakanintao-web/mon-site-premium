// WT-X — instantané de caractérisation du moteur métier (exécuté DANS la page réelle).
// Ne juge pas si un résultat est "correct" : fige le comportement ACTUEL (baseline avant restructuration)
// pour détecter toute dérive pendant le refactoring. Toute différence avec wtx-baseline.json = régression,
// sauf correction métier explicitement décidée (puis : npm run test:update-baseline).
// Restaure TRADES / SETTINGS : aucune donnée réelle n'est modifiée.
window.__wtxCharacterize = function(){
  // JSON ne sait pas représenter NaN / ±Infinity / -0 / undefined : encodés en chaînes pour rester comparables.
  const enc = v => {
    if(typeof v === 'number'){
      if(Number.isNaN(v)) return 'NaN';
      if(v === Infinity) return 'Infinity';
      if(v === -Infinity) return '-Infinity';
      if(Object.is(v, -0)) return '-0';
    }
    return v === undefined ? 'undefined' : v;
  };
  const snap = x => JSON.parse(JSON.stringify(x, (k, v) => enc(v)));
  const clone = x => JSON.parse(JSON.stringify(x));
  const out = {};

  /* ---- R engine ---- */
  const priceCases = [
    [100, 90, 120, 'Buy'], [100, 110, 80, 'Sell'], [100, 90, 95, 'Buy'], [100, 100, 120, 'Buy'],
    [null, 90, 120, 'Buy'], [100, 90, Infinity, 'Buy'], [100, 90, NaN, 'Buy'],
    [1.0850, 1.0800, 1.0950, 'Buy Limit'], [2000, 2010, 1970, 'Sell Stop'], [0.1 + 0.2, 0.1, 0.5, 'Buy'],
  ];
  out.computeRRFromPrices = priceCases.map(a => computeRRFromPrices(...a));
  out.calcRR = priceCases.map(a => calcRR(...a));
  out.computePlannedR = [
    [100, 90, 'Buy', [{ price: 120, pct: 100 }]],
    [100, 90, 'Buy', [{ price: 110, pct: 50 }, { price: 130, pct: 50 }]],
    [100, 90, 'Buy', [{ price: 110 }, { price: 120 }, { price: 130 }]],
    [100, 110, 'Sell', [{ price: 90, pct: 30 }, { price: 80, pct: 70 }]],
    [100, 90, 'Buy', [{ price: 110, pct: 50 }, { price: null, pct: 50 }]],
    [100, 90, 'Buy', []],
    [100, 90, 'Buy', null],
  ].map(a => computePlannedR(...a));
  out.computePlannedRForOpenTrade = [
    { entry: 100, sl: 90, sens: 'Buy', tps: [{ price: 110, pct: 40 }, { price: 125, pct: 60 }] },
    { entry: 100, sl: 110, sens: 'Sell Limit', tp: 85 },
    { entry: 100, sl: 90, sens: 'Buy' },
    null,
  ].map(ot => computePlannedRForOpenTrade(ot));
  out.deriveTradeResultFromRealizedR = [2, -1, 0, -0, 1e-10, -1e-10, 1e-8, null, undefined, NaN, Infinity, -Infinity, '1']
    .map(v => deriveTradeResultFromRealizedR(v));
  out.computeRiskAmountAtEntry = [[1000, 1], [1000, null], [null, 1], [NaN, 1], [Infinity, 1], [2500, 0.5], [1000, 0]]
    .map(a => computeRiskAmountAtEntry(...a));
  out.computeRealizedRFromPnL = [[20, 10], [-10, 10], [0, 10], [20, 0], [20, -5], [null, 10], [20, null], [NaN, 10]]
    .map(a => computeRealizedRFromPnL(...a));
  out.tradeRealizedR = [{ realizedR: 1.5, rr: 3 }, { rr: 2 }, { realizedR: null, rr: -1 }, {}, { realizedR: NaN, rr: NaN }, null]
    .map(t => tradeRealizedR(t));

  /* ---- Orders ---- */
  const sensCases = ['Buy', 'Sell', 'Buy Limit', 'Buy Stop', 'Sell Limit', 'Sell Stop', '', undefined];
  out.orderBaseDirection = sensCases.map(s => orderBaseDirection(s));
  out.isPendingOrderType = sensCases.map(s => isPendingOrderType(s));
  out.validateSLDirection = [['Buy', 100, 90], ['Buy', 100, 100], ['Sell Stop', 100, 110], ['Sell', 100, 90], ['Buy', null, 90]]
    .map(a => validateSLDirection(...a));

  /* ---- Stats ---- */
  out.computeWinRate = [[3, 1], [0, 0], [0, 2], [null, 1]].map(a => computeWinRate(...a));

  /* ---- Series / stats / positions : jeu de données fixe (couvre les 4 branches de gain de buildSeries) ---- */
  const fixture = [
    { id: 1, date: '2026-01-05', time: '09:00', actif: 'XAUUSD', sens: 'Buy', risk: 1, realizedR: 2, rr: 2, result: 'TP',
      realizedPnL: 20, capitalAtEntry: 1000, riskAmountAtEntry: 10 },
    { id: 2, date: '2026-01-06', time: '10:00', actif: 'EURUSD', sens: 'Sell', risk: 1, realizedR: -1, rr: -1, result: 'SL',
      riskAmountAtEntry: 10.2 },
    { id: 3, date: '2026-01-07', time: '11:00', actif: 'US30', sens: 'Buy', risk: 2, rr: 1.5, result: 'TP' },
    { id: 4, date: '2026-01-08', time: '12:00', actif: 'GBPUSD', sens: 'Buy', risk: 1, realizedR: null, rr: null, result: null },
    { id: 5, date: '2026-01-08', time: '08:00', actif: 'XAUUSD', sens: 'Sell', risk: 1, realizedR: 0, rr: 0, result: 'BE', realizedPnL: 0 },
    { id: 6, date: '2026-01-09', time: '15:00', actif: 'XAUUSD', sens: 'Sell', risk: 1, realizedR: 1.3, rr: 1.3, result: 'TP',
      realizedPnL: 13.4, capitalAtEntry: 1030, riskAmountAtEntry: 10.3 },
  ];
  const saved = { trades: TRADES, settings: SETTINGS };
  try{
    TRADES = clone(fixture);
    SETTINGS = Object.assign(defaultSettings(), { capitalInitial: 1000 });
    const pts = buildSeries();
    out.buildSeries = pts.map(p => ({ id: p.id, gain: p.gain, capital: p.capital, cumR: p.cumR, drawdown: p.drawdown, result: p.result }));
    out.computeStats = computeStats(pts);
    out.computeProfitFactor = computeProfitFactor(pts);
    out.computeAverageRealizedR = computeAverageRealizedR(pts);
    out.computeExpectancy = computeExpectancy(pts);
    out.getCurrentCapital = getCurrentCapital();

    // otFloatingR / otFloatingPnl : comportement ACTUEL figé tel quel (capital courant × risque %),
    // y compris l'écart documenté avec riskAmountAtEntry — voir docs/issues/otFloatingPnl-riskAmountAtEntry.md.
    const openTrades = [
      { sens: 'Buy', entry: 100, sl: 90, currentPrice: 105, risk: 1, riskAmountAtEntry: 7 },
      { sens: 'Sell Stop', entry: 100, sl: 110, currentPrice: 95, risk: 2 },
      { sens: 'Buy', entry: 100, sl: 90, currentPrice: 110, risk: 1, tps: [{ price: 110 }, { price: 120 }],
        totalLots: 1, remainingLots: 0.5, realizedR: 0.75, realizedPnL: 7.5 },
      { sens: 'Buy', entry: 100, sl: 100, currentPrice: 100, risk: 1, realizedR: 0.4 },
      { sens: 'Sell', entry: 100, sl: 110 },
    ];
    out.otFloatingR = openTrades.map(ot => otFloatingR(ot));
    out.otFloatingPnl = openTrades.map(ot => otFloatingPnl(ot));
  } finally {
    TRADES = saved.trades;
    SETTINGS = saved.settings;
  }

  /* ---- Migration non destructive ---- */
  const legacy = [
    { id: 1, date: '2026-01-02', time: '10:00', actif: 'XAUUSD', sens: 'Buy', risk: 1, result: 'TP', rr: 2 },
    { id: 2, date: '2026-01-03', time: '10:00', actif: 'EURUSD', sens: 'Sell', risk: 1, result: 'BE', rr: -0.5, entry: 1.1, sl: 1.105, tp: 1.09 },
    { id: 3, date: '2026-01-04', time: '10:00', actif: 'US30', sens: 'Buy', risk: 1, result: 'TP' },
    { id: 4, date: '2026-01-05', time: '10:00', actif: 'XAUUSD', sens: 'Buy', risk: 1, realizedR: 1, rr: 1, result: 'TP',
      plannedR: 2, capitalAtEntry: 1000, riskAmountAtEntry: 10, realizedPnL: 10 },
    { id: 5, date: '2026-01-06', time: '10:00', actif: 'XAUUSD', sens: 'Buy', risk: 1, rr: 1, entry: 100, sl: 90,
      tpDetails: [{ price: 110, pct: 50 }, { price: 120, pct: 50 }] },
  ];
  const migrated = clone(legacy);
  const changed = migrateTradesPlannedRealized(migrated);
  out.migrateTradesPlannedRealized = { changed, trades: migrated, idempotent: migrateTradesPlannedRealized(migrated) === false };

  return snap(out);
};
