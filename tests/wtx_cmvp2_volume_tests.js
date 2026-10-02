// WT-X — C-MVP2 : suites de tests exécutées DANS la page réelle (serveur HTTP local).
// Usage (console de la page) : await (async()=>{ eval(await (await fetch('/tests/wtx_cmvp2_volume_tests.js')).text()); return window.__wtxTestReport; })()
// Le harnais sauvegarde puis restaure TRADES / OPEN_TRADES / SETTINGS : aucune donnée réelle n'est conservée.
window.__wtxTestReport = null;
window.__wtxRunTests = async function(){
  const R = []; let suite = '';
  const ok = (name, cond, detail) => R.push({ suite, name, pass: !!cond, detail: detail === undefined ? '' : String(detail) });
  const near = (a, b, eps) => typeof a === 'number' && typeof b === 'number' && Math.abs(a - b) <= (eps == null ? 1e-9 : eps);
  const eq = (name, a, b) => ok(name, Object.is(a, b) || near(a, b, 1e-12), `obtenu ${JSON.stringify(a)} / attendu ${JSON.stringify(b)}`);
  const $ = id => document.getElementById(id);
  const setVal = (id, v, evt) => { const el = $(id); el.value = v; el.dispatchEvent(new Event(evt || 'input', { bubbles:true })); };
  const alerts = []; const origAlert = window.alert; const origConfirm = window.confirm;
  window.alert = m => alerts.push(String(m)); window.confirm = () => true;
  const snap = { trades: JSON.parse(JSON.stringify(TRADES)), open: JSON.parse(JSON.stringify(OPEN_TRADES)), settings: JSON.parse(JSON.stringify(SETTINGS)) };
  const errStart = window.__wtxErrors.length;
  const registered = [];
  const reg = (level, key, sym, spec) => { registerInstrumentExecutionSpec(level, key, sym, spec); registered.push([level, key, sym]); };
  const lots = (min, step, extra) => Object.assign({ quantityMode:'LOTS', minVolume:min, volumeStep:step }, extra || {});
  try {
    /* ---------------- SUITE A — normalisation / format volume ---------------- */
    suite = 'A';
    eq('0.166666 step 0.001 -> 0.166', normalizeAutomaticVolume(0.166666, lots(0.001, 0.001)).volume, 0.166);
    eq('0.12567 step 0.001 -> 0.125', normalizeAutomaticVolume(0.12567, lots(0.001, 0.001)).volume, 0.125);
    eq('0.0012 step 0.001 -> 0.001', normalizeAutomaticVolume(0.0012, lots(0.001, 0.001)).volume, 0.001);
    const a4 = normalizeAutomaticVolume(0.0008, lots(0.001, 0.001));
    ok('0.0008 min 0.001 -> INVALID (jamais 0)', a4.ok === false && a4.code === 'BELOW_MIN' && a4.volume === undefined, JSON.stringify(a4));
    eq('1 step 1 -> 1', normalizeAutomaticVolume(1, lots(1, 1)).volume, 1);
    eq('0.1 step 0.1 -> 0.1', normalizeAutomaticVolume(0.1, lots(0.1, 0.1)).volume, 0.1);
    eq('bruit flottant 0.19999999999999 step 0.01 -> 0.2', normalizeAutomaticVolume(0.19999999999999796, lots(0.01, 0.01)).volume, 0.2);
    const aMax = normalizeAutomaticVolume(12, lots(0.01, 0.01, { maxVolume:10 }));
    ok('au-dessus du max -> INVALID (pas de plafonnement silencieux)', !aMax.ok && aMax.code === 'ABOVE_MAX', JSON.stringify(aMax));
    const aUnk = normalizeAutomaticVolume(0.5, { quantityMode:'LOTS' });
    ok('contraintes inconnues -> EXECUTION_SPEC_UNKNOWN', !aUnk.ok && aUnk.code === 'EXECUTION_SPEC_UNKNOWN');
    eq('affichage step 1 -> 0 décimale', formatExecutionVolume(3, lots(1, 1)), '3');
    eq('affichage step 0.1 -> 1 décimale', formatExecutionVolume(0.5, lots(0.1, 0.1)), '0.5');
    eq('affichage step 0.01 -> 2 décimales', formatExecutionVolume(0.5, lots(0.01, 0.01)), '0.50');
    eq('affichage step 0.001 -> 3 décimales', formatExecutionVolume(0.5, lots(0.001, 0.001)), '0.500');
    ok('isAlignedToStep 0.3 / 0.1', isAlignedToStep(0.3, 0.1, 0.1) && isAlignedToStep(0.1 + 0.2, 0.1, 0.1));
    ok('isAlignedToStep 0.25 / 0.05', isAlignedToStep(0.25, 0.05, 0.05));
    ok('isAlignedToStep 0.125 / 0.001', isAlignedToStep(0.125, 0.001, 0.001));
    ok('isAlignedToStep 0.1665 / 0.001 = faux', !isAlignedToStep(0.1665, 0.001, 0.001));
    eq('getStepDecimals(0.001)', getStepDecimals(0.001), 3);
    eq('getStepDecimals(1)', getStepDecimals(1), 0);

    /* ---------------- SUITE B — saisie manuelle ---------------- */
    suite = 'B';
    const s001 = lots(0.001, 0.001);
    ok('0.166 step 0.001 -> PASS', validateManualVolume('0.166', s001).ok);
    const b2 = validateManualVolume('0.1665', s001);
    ok('0.1665 step 0.001 -> FAIL (pas d\'arrondi silencieux)', !b2.ok && b2.value === undefined && /pas d'exécution est de 0\.001 lot/.test(b2.error), b2.error);
    const b3 = validateManualVolume('0.0008', s001);
    ok('0.0008 min 0.001 -> FAIL', !b3.ok && /minimum autorisé 0\.001 lot/.test(b3.error), b3.error);
    ok('0.01 min/step 0.01 -> PASS', validateManualVolume('0.01', lots(0.01, 0.01)).ok);
    ok('"0.166abc" -> FAIL', !validateManualVolume('0.166abc', s001).ok && validateManualVolume('0.166abc', s001).error === 'Valeur numérique invalide.');
    ok('"abc" -> FAIL', !validateManualVolume('abc', s001).ok);
    const b7 = validateManualVolume('', s001, { required:true });
    ok('"" obligatoire -> FAIL', !b7.ok && b7.code === 'REQUIRED', b7.error);
    ok('Infinity -> FAIL', !validateManualVolume(Infinity, s001).ok && !validateManualVolume('Infinity', s001).ok);
    ok('NaN -> FAIL', !validateManualVolume(NaN, s001).ok && !validateManualVolume('NaN', s001).ok);
    ok('négatif -> FAIL', !validateManualVolume('-0.5', s001).ok);
    ok('parseStrictNumber("120abc") = NaN', isNaN(parseStrictNumber('120abc')));
    eq('parseStrictNumber(" 0.25 ") = 0.25', parseStrictNumber(' 0.25 '), 0.25);
    ok('aucun message technique (NaN/undefined/null) dans les erreurs', ['abc', '', '0.1665', '0.0008', NaN].every(v => { const e = validateManualVolume(v, s001).error || ''; return !/NaN|undefined|null|false|Error/.test(e); }));

    /* ---------------- SUITE C — Forex ---------------- */
    suite = 'C';
    SETTINGS.executionBroker = null;
    const eur = getInstrumentExecutionSpec('EURUSD');
    ok('EURUSD profil WT-X LOTS 100000 0.01/0.01', eur.source === 'WTX_REFERENCE' && eur.quantityMode === 'LOTS' && eur.contractSize === 100000 && eur.minVolume === 0.01 && eur.volumeStep === 0.01, JSON.stringify(eur));
    ok('profil référence présenté comme non garanti', /non garanti par le broker/.test(eur.sourceLabel));
    ['0.01', '0.02', '0.10', '1.00'].forEach(v => ok(`${v} -> PASS`, isValidVolume(v, eur), validateManualVolume(v, eur).error));
    ['0.009', '0.015', '0'].forEach(v => ok(`${v} -> FAIL`, !isValidVolume(v, eur), validateManualVolume(v, eur).error));
    // C-MVP1 : formule de risque identique à l'ancienne (distance en pips × pipValue).
    const oldLot = (e, s, risk, pip, val) => risk / ((Math.abs(e - s) / pip) * val);
    eq('EURUSD lot théorique identique à l\'ancien calcul', computeLotFromRisk(1.1, 1.095, 100, 'EURUSD'), oldLot(1.1, 1.095, 100, 0.0001, 10));
    eq('XAUUSD lot théorique identique à l\'ancien calcul', computeLotFromRisk(2000, 1990, 100, 'XAUUSD'), oldLot(2000, 1990, 100, 0.1, 10));
    eq('USDJPY lot théorique identique à l\'ancien calcul', computeLotFromRisk(150, 149.5, 100, 'USDJPY'), oldLot(150, 149.5, 100, 0.01, 9.1));
    eq('EURUSD risque 100 / 50 pips -> 0.20 exécutable', computeExecutableVolumeFromRisk(1.1, 1.095, 100, 'EURUSD').volume, 0.2);
    eq('EURUSD risque 83.33 -> floor 0.16 (référence)', computeExecutableVolumeFromRisk(1.1, 1.095, 83.33, 'EURUSD').volume, 0.16);
    reg('broker', 'TestBroker', 'EURUSD', lots(0.001, 0.001));
    SETTINGS.executionBroker = 'TestBroker';
    const eurB = getInstrumentExecutionSpec('EURUSD');
    ok('broker 0.001/0.001 prioritaire, contractSize hérité du profil', eurB.source === 'BROKER_SYMBOL' && eurB.minVolume === 0.001 && eurB.contractSize === 100000 && eurB.fieldSources.minVolume === 'BROKER_SYMBOL' && eurB.fieldSources.contractSize === 'WTX_REFERENCE', JSON.stringify(eurB.fieldSources));
    ['0.001', '0.002', '0.166'].forEach(v => ok(`broker 0.001 : ${v} -> PASS (sans changement de code)`, isValidVolume(v, eurB)));
    eq('broker 0.001 : risque 83.33 -> floor 0.166', computeExecutableVolumeFromRisk(1.1, 1.095, 83.33, 'EURUSD').volume, 0.166);
    SETTINGS.executionBroker = null;

    /* ---------------- SUITE D — Indices ---------------- */
    suite = 'D';
    reg('broker', 'TestBroker', 'US500', lots(0.01, 0.01, { assetClass:'index' }));
    reg('broker', 'TestBroker', 'Japan225', lots(1, 1, { assetClass:'index' }));
    reg('broker', 'TestBroker', 'OtherIndex', lots(0.1, 0.1, { assetClass:'index' }));
    const us = getInstrumentExecutionSpec('US500', 'TestBroker'), jp = getInstrumentExecutionSpec('Japan225', 'TestBroker'), oi = getInstrumentExecutionSpec('OtherIndex', 'TestBroker');
    ok('US500 min 0.01 step 0.01', us.minVolume === 0.01 && us.volumeStep === 0.01);
    ok('Japan225 min 1 step 1', jp.minVolume === 1 && jp.volumeStep === 1);
    ok('OtherIndex min 0.1 step 0.1', oi.minVolume === 0.1 && oi.volumeStep === 0.1);
    ok('US500 0.05 PASS / 0.055 FAIL', isValidVolume('0.05', us) && !isValidVolume('0.055', us));
    ok('Japan225 1 PASS / 0.5 FAIL', isValidVolume('1', jp) && !isValidVolume('0.5', jp));
    ok('OtherIndex 0.3 PASS / 0.35 FAIL', isValidVolume('0.3', oi) && !isValidVolume('0.35', oi));
    ok('0.05 accepté US500 mais refusé Japan225 et OtherIndex (règle par symbole)', isValidVolume('0.05', us) && !isValidVolume('0.05', jp) && !isValidVolume('0.05', oi));
    const usNoBroker = getInstrumentExecutionSpec('US500', null);
    ok('US500 sans fiche broker : volume NON inventé', usNoBroker.minVolume === null && usNoBroker.volumeStep === null && !usNoBroker.volumeConstraintsKnown);

    /* ---------------- SUITE E — Or / métaux ---------------- */
    suite = 'E';
    reg('broker', 'BrokerA', 'XAUUSD', lots(0.01, 0.01));
    reg('broker', 'BrokerB', 'XAUUSD', lots(0.001, 0.001));
    const gA = getInstrumentExecutionSpec('XAUUSD', 'BrokerA'), gB = getInstrumentExecutionSpec('XAUUSD', 'BrokerB');
    ok('Gold A 0.01/0.01', gA.minVolume === 0.01 && gA.volumeStep === 0.01);
    ok('Gold B 0.001/0.001', gB.minVolume === 0.001 && gB.volumeStep === 0.001);
    ok('0.005 refusé A / accepté B', !isValidVolume('0.005', gA) && isValidVolume('0.005', gB));
    eq('normalisation 0.1666 Gold A -> 0.16', normalizeAutomaticVolume(0.1666, gA).volume, 0.16);
    eq('normalisation 0.1666 Gold B -> 0.166', normalizeAutomaticVolume(0.1666, gB).volume, 0.166);
    const gRef = getInstrumentExecutionSpec('XAUUSD', null);
    ok('XAUUSD sans broker : aucun 0.01 imposé', gRef.minVolume === null && gRef.volumeStep === null);
    const gExec = computeExecutableVolumeFromRisk(2000, 1990, 100, 'XAUUSD');
    ok('XAUUSD sans broker : volume théorique conservé + avertissement explicite (C-MVP1)', gExec.ok && gExec.code === 'EXECUTION_SPEC_UNKNOWN' && gExec.normalized === false && near(gExec.volume, 0.1) && /inconnues/.test(gExec.warning), JSON.stringify(gExec));
    const xpt = getInstrumentExecutionSpec('XPTUSD');
    ok('XPTUSD n\'est plus pris pour une paire Forex', xpt.assetClass === 'metal' && xpt.minVolume === null && !xpt.riskComputable, JSON.stringify(xpt));

    /* ---------------- Énergies / commodities ---------------- */
    suite = 'E2-COMMODITIES';
    const uk = getInstrumentExecutionSpec('UKOIL'), ng = getInstrumentExecutionSpec('XNGUSD'), wti = getInstrumentExecutionSpec('USOIL');
    ok('UKOIL = énergie (plus confondu avec un indice "UK")', uk.assetClass === 'energy');
    ok('XNGUSD = énergie (plus confondu avec une paire Forex)', ng.assetClass === 'energy');
    const ukExec = computeExecutableVolumeFromRisk(80, 79, 100, 'UKOIL');
    ok('énergie sans fiche : calcul bloqué, message clair', !ukExec.ok && ukExec.error === "Impossible de calculer un volume fiable : spécification d'instrument indisponible.", JSON.stringify(ukExec));
    reg('broker', 'TestBroker', 'USOIL', { assetClass:'energy', productType:'CFD', quantityMode:'LOTS', contractSize:1000, contractUnit:'barils', minVolume:0.01, volumeStep:0.01, tickSize:0.01, tickValue:10, tickValueCurrency:'USD', riskModel:'TICK_BASED' });
    const oilExec = computeExecutableVolumeFromRisk(80, 79, 150, 'USOIL'); // pas de broker actif -> encore bloqué
    ok('USOIL sans broker actif : bloqué', !oilExec.ok);
    SETTINGS.executionBroker = 'TestBroker';
    const oilExec2 = computeExecutableVolumeFromRisk(80, 79, 150, 'USOIL'); // 1$ / 0.01 × 10 = 1000 $/lot -> 0.15
    ok('USOIL avec fiche broker : 0.15 lot', oilExec2.ok && oilExec2.volume === 0.15 && wti.assetClass === 'energy', JSON.stringify(oilExec2));
    SETTINGS.executionBroker = null;

    /* ---------------- Crypto ---------------- */
    suite = 'E3-CRYPTO';
    reg('broker', 'CfdBroker', 'BTCUSD', { assetClass:'crypto', productType:'CFD', quantityMode:'LOTS', contractSize:1, minVolume:0.001, volumeStep:0.001 });
    reg('broker', 'CfdBroker', 'ETHUSD', { assetClass:'crypto', productType:'CFD', quantityMode:'LOTS', contractSize:1, minVolume:0.01, volumeStep:0.01 });
    reg('broker', 'SpotVenue', 'BTCUSDT', { assetClass:'crypto', productType:'SPOT', quantityMode:'UNITS', contractSize:1, minVolume:0.00001, volumeStep:0.00001, riskModel:'UNIT_PRICE_BASED', tickValueCurrency:'USDT' });
    const btcC = getInstrumentExecutionSpec('BTCUSD', 'CfdBroker'), ethC = getInstrumentExecutionSpec('ETHUSD', 'CfdBroker'), spot = getInstrumentExecutionSpec('BTCUSDT', 'SpotVenue');
    const btcF = getInstrumentExecutionSpec('BTC', null, { venue:'CME' }), btcPlain = getInstrumentExecutionSpec('BTC', null, null);
    ok('BTC CFD 0.001 PASS', isValidVolume('0.001', btcC));
    ok('ETH CFD 0.001 FAIL / 0.01 PASS (règles distinctes)', !isValidVolume('0.001', ethC) && isValidVolume('0.01', ethC));
    ok('BTC spot en UNITÉS 0.00001', spot.quantityMode === 'UNITS' && isValidVolume('0.00012', spot) && formatExecutionVolume(0.00012, spot) === '0.00012');
    eq('BTC spot : 1000 USDT de risque, stop à 1000 -> 1 BTC (modèle UNIT_PRICE_BASED)', normalizeAutomaticVolume(1000 / computeRiskPerVolumeUnit(60000, 59000, spot), spot).volume, 1);
    ok('BTC futures CME = CONTRATS de 5 BTC', btcF.quantityMode === 'CONTRACTS' && btcF.contractSize === 5 && btcF.source === 'VENUE_SYMBOL' && !isValidVolume('0.5', btcF) && isValidVolume('2', btcF));
    ok('"BTC" sans venue n\'est PAS forcé en futures', btcPlain.quantityMode !== 'CONTRACTS' && btcPlain.contractSize !== 5);
    const mbt = getInstrumentExecutionSpec('MBT');
    ok('Micro Bitcoin = 0.10 BTC par contrat', mbt.quantityMode === 'CONTRACTS' && mbt.contractSize === 0.1);

    /* ---------------- SUITE F — Futures ---------------- */
    suite = 'F';
    const mes = getInstrumentExecutionSpec('MES');
    ok('MES CONTRACTS min 1 step 1 multiplicateur 5', mes.quantityMode === 'CONTRACTS' && mes.minVolume === 1 && mes.volumeStep === 1 && mes.contractSize === 5);
    ok('MES 1 PASS', isValidVolume('1', mes)); ok('MES 2 PASS', isValidVolume('2', mes));
    const f05 = validateManualVolume('0.5', mes), f15 = validateManualVolume('1.5', mes);
    ok('MES 0.5 FAIL', !f05.ok, f05.error);
    ok('MES 1.5 FAIL "contrats entiers"', !f15.ok && f15.error === 'Volume invalide pour cet instrument : utilisez des contrats entiers.', f15.error);
    eq('MES risque/contrat 10 pts = 50 $', computeRiskPerVolumeUnit(5000, 4990, mes), 50);
    eq('MES risque 120 $ -> floor 2 contrats', computeExecutableVolumeFromRisk(5000, 4990, 120, 'MES').volume, 2);
    const es = getInstrumentExecutionSpec('ES');
    eq('ES risque/contrat 10 pts = 500 $', computeRiskPerVolumeUnit(5000, 4990, es), 500);
    const gc = getInstrumentExecutionSpec('GC');
    ok('GC CONTRACTS contractSize 100 onces troy', gc.quantityMode === 'CONTRACTS' && gc.contractSize === 100 && /onces/.test(gc.contractUnit));
    eq('GC risque/contrat 10 $ = 1000 $', computeRiskPerVolumeUnit(2000, 1990, gc), 1000);
    eq('GC affichage 2 -> "2 contrats"', formatExecutionVolume(2, gc, { unit:true }), '2 contrats');
    ok('MGC 10 oz / 1OZ 1 oz', getInstrumentExecutionSpec('MGC').contractSize === 10 && getInstrumentExecutionSpec('1OZ').contractSize === 1);

    /* ---------------- SUITE G — Actions ---------------- */
    suite = 'G';
    const shareSpec = { assetClass:'equity', productType:'SHARE', quantityMode:'SHARES', contractSize:1, minVolume:1, volumeStep:1, riskModel:'UNIT_PRICE_BASED', tickValueCurrency:'USD' };
    reg('broker', 'WholeBroker', 'AAPL', shareSpec);
    reg('broker', 'FracBroker', 'AAPL', Object.assign({}, shareSpec, { minVolume:0.01, volumeStep:0.01 }));
    const aW = getInstrumentExecutionSpec('AAPL', 'WholeBroker'), aF = getInstrumentExecutionSpec('AAPL', 'FracBroker');
    ok('AAPL entières 1 PASS', isValidVolume('1', aW)); ok('AAPL entières 10 PASS', isValidVolume('10', aW));
    const g05 = validateManualVolume('0.5', aW);
    ok('AAPL entières 0.5 FAIL (message clair : minimum 1 action)', !g05.ok && g05.error === 'Volume invalide : minimum autorisé 1 action.', g05.error);
    const g15 = validateManualVolume('1.5', aW);
    ok('AAPL entières 1.5 FAIL "actions entières"', !g15.ok && g15.error === 'Volume invalide pour cet instrument : utilisez des actions entières.', g15.error);
    ok('AAPL fractionnées 0.5 PASS', isValidVolume('0.5', aF));
    eq('AAPL risque 5 $/action, 100 $ -> 20 actions', normalizeAutomaticVolume(100 / computeRiskPerVolumeUnit(200, 195, aW), aW).volume, 20);
    ok('AAPL sans fiche : spécification inconnue', getInstrumentExecutionSpec('AAPL', null).source === 'UNKNOWN');

    /* ---------------- SUITE H — Options ---------------- */
    suite = 'H';
    const optStd = { assetClass:'equity', productType:'OPTION', quantityMode:'CONTRACTS', contractSize:100, minVolume:1, volumeStep:1, riskModel:'OPTION_PREMIUM', tickValueCurrency:'USD' };
    reg('broker', 'OptBroker', 'AAPL_C200', optStd);
    reg('broker', 'OptBroker', 'XYZ_ADJ', Object.assign({}, optStd, { contractSize:10 })); // contrat ajusté
    const o1 = getInstrumentExecutionSpec('AAPL_C200', 'OptBroker'), o2 = getInstrumentExecutionSpec('XYZ_ADJ', 'OptBroker');
    ok('option standard : CONTRACTS, contractSize 100 issu de la fiche', o1.quantityMode === 'CONTRACTS' && o1.contractSize === 100 && o1.fieldSources.contractSize === 'BROKER_SYMBOL');
    eq('option standard : prime 2.50 -> stop 1.50 = 100 $/contrat', computeRiskPerVolumeUnit(2.5, 1.5, o1), 100);
    eq('option ajustée (10) : 10 $/contrat — pas de constante 100 globale', computeRiskPerVolumeUnit(2.5, 1.5, o2), 10);
    ok('option 1.5 contrat refusé', !isValidVolume('1.5', o1));

    /* ---------------- SUITE J — Historique ---------------- */
    suite = 'J';
    const today = new Date().toISOString().slice(0, 10);
    const tJ = { id: 990000001, date: today, time: '23:58', actif:'EURUSD', sens:'Buy', session:'', timeframe:'', lots: 0.16666666666666666, risk: 1, entry:1.1, sl:1.095, exit:1.11, result:'TP', rr:2, realizedR:2, realizedPnL:20, plannedR:null, capitalAtEntry:1000, riskAmountAtEntry:10, strategy:'', note:'__WTX_TEST_J__', marketContext:null };
    const tJ2 = Object.assign({}, tJ, { id: 990000002, time:'23:59', actif:'GC', lots: 2, note:'__WTX_TEST_J2__' });
    TRADES.push(tJ, tJ2); renderAll();
    const rowOf = marker => [...document.querySelectorAll('#logTableWrap tbody tr')].find(tr => tr.innerHTML.includes(marker));
    const rJ = rowOf('__WTX_TEST_J__'), rJ2 = rowOf('__WTX_TEST_J2__');
    const volCell = tr => tr ? tr.children[5].textContent.trim() : null;
    eq('historique : 0.16666666666666666 affiché "0.17" (step 0.01)', volCell(rJ), '0.17');
    ok('historique : aucune valeur brute interminable', rJ && !rJ.innerHTML.includes('0.16666666666666666'));
    eq('historique : valeur interne intacte', TRADES.find(t => t.id === 990000001).lots, 0.16666666666666666);
    eq('historique : GC 2 contrats affiché "2"', volCell(rJ2), '2');
    eq('en-tête de colonne "Volume"', document.querySelectorAll('#logTableWrap thead th')[5].textContent, 'Volume');

    /* ---------------- SUITE K — Multi-TP ---------------- */
    suite = 'K';
    [2, 3, 4].forEach(n => {
      const prices = Array.from({ length:n }, (_, i) => 110 + i * 10);
      const tr = pTPBuildTranches(prices, 0.1, null);
      const sum = tr.reduce((a, t) => a + t.lots, 0);
      const prev = tr.slice(0, -1).reduce((a, t) => a + t.lots, 0);
      ok(`${n} TP : ${n} tranches, somme exacte 0.1`, tr.length === n && near(sum, 0.1, 1e-15), sum);
      ok(`${n} TP : dernière tranche = résiduel exact`, tr[n - 1].lots === 0.1 - prev, `${tr[n - 1].lots} vs ${0.1 - prev}`);
      ok(`${n} TP : pleine précision interne (non arrondie)`, n !== 3 || tr[0].lots === 0.1 * (100 / 3) / 100);
    });
    // Clôture réelle tranche par tranche (3 TP) via le modal de clôture.
    const mtId = 990000010;
    OPEN_TRADES.push({ id: mtId, status:'open', actif:'EURUSD', sens:'Buy', session:'', timeframe:'', strategy:'', lots:0.3, risk:1, entry:100, sl:90, tp:110,
      tps: pTPBuildTranches([110, 120, 130], 0.3, null), plannedR:2, capitalAtEntry:10000, riskAmountAtEntry:100, totalLots:0.3, remainingLots:0.3, closedLots:0, realizedPnL:0, realizedR:0, currentPrice:100, createdAt:Date.now(), openedAt:Date.now(), note:'', source:'manual', marketContext:null });
    for (const [i, exitPx] of [[0, '110'], [1, '120'], [2, '130']]) {
      openCloseTradeModal(mtId);
      const ot = OPEN_TRADES.find(o => o.id === mtId);
      $('closeType').value = 'TP'; onCloseTypeChange();
      const active = ot.tps.filter(t => t.status === 'ACTIVE');
      if (active.length >= 2) $('closeTranche').value = active[0].id;
      setVal('closeExit', exitPx);
      await confirmCloseTrade();
    }
    const mtClosed = TRADES.find(t => t.id === mtId);
    ok('3 TP : une seule entrée historique', mtClosed && TRADES.filter(t => t.id === mtId).length === 1 && !OPEN_TRADES.find(o => o.id === mtId));
    ok('3 TP : Realized R final = 2.00R (P&L 200 / risque verrouillé 100)', mtClosed && near(mtClosed.realizedR, 2, 1e-9) && near(mtClosed.realizedPnL, 200, 1e-9), mtClosed && JSON.stringify({ r: mtClosed.realizedR, pnl: mtClosed.realizedPnL }));
    ok('3 TP : riskAmountAtEntry toujours 100, capitalAtEntry toujours 10000', mtClosed && mtClosed.riskAmountAtEntry === 100 && mtClosed.capitalAtEntry === 10000);
    ok('3 TP : rr = realizedR, résultat TP', mtClosed && mtClosed.rr === mtClosed.realizedR && mtClosed.result === 'TP');
    ok('3 TP : volume total conservé dans l\'historique', mtClosed && mtClosed.lots === 0.3);

    /* ---------------- SUITE L — Non-régression C-MVP1 ---------------- */
    suite = 'L';
    eq('deriveTradeResultFromRealizedR(+0.5) = TP', deriveTradeResultFromRealizedR(0.5), 'TP');
    eq('deriveTradeResultFromRealizedR(0) = BE', deriveTradeResultFromRealizedR(0), 'BE');
    eq('deriveTradeResultFromRealizedR(-1) = SL', deriveTradeResultFromRealizedR(-1), 'SL');
    eq('deriveTradeResultFromRealizedR(null) = null (UNKNOWN)', deriveTradeResultFromRealizedR(null), null);
    eq('computeRealizedRFromPnL(50, 100) = 0.5', computeRealizedRFromPnL(50, 100), 0.5);
    eq('computeRealizedRFromPnL(50, null) = null', computeRealizedRFromPnL(50, null), null);
    const closeSingle = async (id, exitPx, extra) => {
      OPEN_TRADES.push(Object.assign({ id, status:'open', actif:'EURUSD', sens:'Buy', session:'', timeframe:'', strategy:'', lots:0.1, risk:1, entry:100, sl:90, tp:null, tps:[],
        plannedR:3, capitalAtEntry:10000, riskAmountAtEntry:100, totalLots:0.1, remainingLots:0.1, closedLots:0, realizedPnL:0, realizedR:0, currentPrice:100,
        createdAt:Date.now(), openedAt:Date.now(), note:'', source:'manual', marketContext:null }, extra || {}));
      openCloseTradeModal(id); setVal('closeExit', exitPx); await confirmCloseTrade();
      return TRADES.find(t => t.id === id);
    };
    const tTP = await closeSingle(990000020, '105');
    ok('TP : realizedR > 0 (+0.5), résultat TP', tTP && near(tTP.realizedR, 0.5) && tTP.result === 'TP' && tTP.rr === tTP.realizedR, tTP && JSON.stringify({ r:tTP.realizedR, res:tTP.result }));
    const tBE = await closeSingle(990000021, '100');
    ok('BE : realizedR = 0, résultat BE', tBE && tBE.realizedR === 0 && tBE.result === 'BE', tBE && JSON.stringify({ r:tBE.realizedR, res:tBE.result }));
    const tSL = await closeSingle(990000022, '90');
    ok('SL : realizedR < 0 (-1), résultat SL — Planned R (3) ne classe pas', tSL && near(tSL.realizedR, -1) && tSL.result === 'SL', tSL && JSON.stringify({ r:tSL.realizedR, res:tSL.result }));
    const tUK = await closeSingle(990000023, '105', { riskAmountAtEntry:null, capitalAtEntry:null });
    ok('UNKNOWN : realizedR = null, rr = null, résultat null (jamais 0, jamais BE)', tUK && tUK.realizedR === null && tUK.rr === null && tUK.result === null, tUK && JSON.stringify({ r:tUK.realizedR, rr:tUK.rr, res:tUK.result }));
    ok('capitalAtEntry / riskAmountAtEntry verrouillés à la clôture', tTP && tTP.capitalAtEntry === 10000 && tTP.riskAmountAtEntry === 100);

    /* ---------------- SUITE I — Clôture (DOM réel) ---------------- */
    suite = 'I';
    const ciId = 990000030;
    OPEN_TRADES.push({ id: ciId, status:'open', actif:'EURUSD', sens:'Buy', session:'', timeframe:'', strategy:'', lots:0.1, risk:1, entry:100, sl:90, tp:null, tps:[],
      plannedR:null, capitalAtEntry:10000, riskAmountAtEntry:100, totalLots:0.1, remainingLots:0.1, closedLots:0, realizedPnL:0, realizedR:0, currentPrice:100, createdAt:Date.now(), openedAt:Date.now(), note:'', source:'manual', marketContext:null });
    openCloseTradeModal(ciId);
    ok('closePnl readonly', $('closePnl').readOnly === true);
    ok('closeRR readonly', $('closeRR').readOnly === true);
    setVal('closeExit', '120');
    ok('Exit valide 120 -> P&L 200.00 / RR 2.00', $('closePnl').value === '200.00' && $('closeRR').value === '2.00', `${$('closePnl').value} / ${$('closeRR').value}`);
    setVal('closeExit', '95');
    ok('Exit modifié 95 -> P&L -50.00 / RR -0.50', $('closePnl').value === '-50.00' && $('closeRR').value === '-0.50', `${$('closePnl').value} / ${$('closeRR').value}`);
    setVal('closeExit', '');
    ok('Exit supprimé -> P&L vide / RR vide (aucune ancienne valeur, aucun 0)', $('closePnl').value === '' && $('closeRR').value === '', `"${$('closePnl').value}" / "${$('closeRR').value}"`);
    setVal('closeExit', '120'); setVal('closeExit', '120abc');
    ok('Exit "120abc" (champ number du navigateur) -> P&L vide / RR vide', $('closePnl').value === '' && $('closeRR').value === '', `"${$('closeExit').value}" -> "${$('closePnl').value}" / "${$('closeRR').value}"`);
    // Même vérification en contournant la désinfection du navigateur : le parseur strict doit refuser.
    $('closeExit').type = 'text';
    setVal('closeExit', '120'); setVal('closeExit', '120abc');
    ok('Exit "120abc" (valeur brute) -> refusé par le parseur strict, champs vidés', $('closeExit').value === '120abc' && $('closePnl').value === '' && $('closeRR').value === '');
    const alertsBefore = alerts.length;
    await confirmCloseTrade();
    ok('Clôture avec "120abc" bloquée (message clair, trade toujours ouvert)', alerts.length === alertsBefore + 1 && alerts[alerts.length - 1] === 'Valeur numérique invalide : prix de sortie.' && !!OPEN_TRADES.find(o => o.id === ciId));
    $('closeExit').type = 'number';
    setVal('closeExit', '0');
    ok('Exit 0 -> champs vidés (jamais 0 fabriqué)', $('closePnl').value === '' && $('closeRR').value === '');
    closeCloseTradeModal();

    /* ---------------- SUITE M — Ordres en attente (DOM réel) ---------------- */
    suite = 'M';
    SETTINGS.executionBroker = null;
    openPositionModal();
    setVal('pActif', 'EURUSD');
    $('pSens').value = 'Buy Stop'; $('pSens').dispatchEvent(new Event('change', { bubbles:true }));
    setVal('pEntry', '1.1050'); setVal('pSL', '1.1000'); setVal('pRisk', '1');
    const capCreate = getCurrentCapital();
    const nOpenBefore = OPEN_TRADES.length;
    await savePosition();
    const pend = OPEN_TRADES[OPEN_TRADES.length - 1];
    ok('pending créé', OPEN_TRADES.length === nOpenBefore + 1 && pend.status === 'pending', alerts.slice(-1)[0]);
    const expectedPendingLots = normalizeAutomaticVolume(computeLotFromRisk(1.105, 1.1, capCreate * 0.01, 'EURUSD'), getInstrumentExecutionSpec('EURUSD')).volume;
    ok('pending : volume normalisé sur la fiche (aperçu)', pend.lots === expectedPendingLots, `${pend.lots} vs ${expectedPendingLots}`);
    ok('pending : capitalAtEntry et riskAmountAtEntry NON capturés', pend.capitalAtEntry === null && pend.riskAmountAtEntry === null);
    const oldLots = pend.lots;
    SETTINGS.capitalInitial = SETTINGS.capitalInitial + 9000; // compte modifié avant déclenchement
    const capTrigger = getCurrentCapital();
    await triggerPendingTrade(pend.id);
    const trig = OPEN_TRADES.find(o => o.id === pend.id);
    const expectedLots = normalizeAutomaticVolume(computeLotFromRisk(1.105, 1.1, capTrigger * 0.01, 'EURUSD'), getInstrumentExecutionSpec('EURUSD')).volume;
    ok('déclenché : statut open', trig.status === 'open');
    ok('déclenché : nouveau volume recalculé et normalisé', trig.lots === expectedLots && trig.totalLots === expectedLots && trig.lots !== oldLots, `${oldLots} -> ${trig.lots} (attendu ${expectedLots})`);
    ok('déclenché : capitalAtEntry capturé au déclenchement', trig.capitalAtEntry === capTrigger && capTrigger !== capCreate);
    ok('déclenché : riskAmountAtEntry capturé au déclenchement', near(trig.riskAmountAtEntry, capTrigger * 0.01, 1e-9));
    // Échec de recalcul : aucune mutation, ancien lot jamais réutilisé.
    openPositionModal();
    setVal('pActif', 'XAUUSD');
    $('pSens').value = 'Buy Limit'; $('pSens').dispatchEvent(new Event('change', { bubbles:true }));
    setVal('pEntry', '1990'); setVal('pSL', '1980'); setVal('pRisk', '1');
    await savePosition();
    const pend2 = OPEN_TRADES[OPEN_TRADES.length - 1];
    ok('pending XAUUSD créé (contraintes inconnues -> volume théorique signalé)', pend2.status === 'pending' && pend2.actif === 'XAUUSD');
    const before2 = JSON.stringify(pend2);
    reg('broker', 'HugeMinBroker', 'XAUUSD', lots(50, 1));
    SETTINGS.executionBroker = 'HugeMinBroker';
    const nAlerts = alerts.length;
    await triggerPendingTrade(pend2.id);
    const after2 = OPEN_TRADES.find(o => o.id === pend2.id);
    ok('échec : ordre laissé en attente, aucune donnée modifiée', after2.status === 'pending' && JSON.stringify(after2) === before2);
    ok('échec : capitalAtEntry / riskAmountAtEntry non capturés', after2.capitalAtEntry === null && after2.riskAmountAtEntry === null);
    ok('échec : message clair affiché', alerts.length === nAlerts + 1 && /Volume calculé inférieur au minimum exécutable/.test(alerts[alerts.length - 1]) && /reste en attente/.test(alerts[alerts.length - 1]), alerts[alerts.length - 1]);
    SETTINGS.executionBroker = null;

    /* ---------------- SUITE N — Parcours navigateur "Ouvrir une position" ---------------- */
    suite = 'N-BROWSER';
    openPositionModal();
    ok('drawer "Ouvrir une position" ouvert', $('positionOverlay').classList.contains('open') || getComputedStyle($('positionOverlay')).display !== 'none');
    $('pSens').value = 'Buy'; $('pSens').dispatchEvent(new Event('change', { bubbles:true }));
    setVal('pActif', 'EURUSD');
    ok('EURUSD : libellé "Lots" + fiche affichée', $('pLotsLabel').textContent === 'Lots' && /Mode : LOTS · Min : 0\.01 · Max : — · Pas : 0\.01/.test($('pVolumeSpecInfo').textContent), $('pVolumeSpecInfo').textContent);
    setVal('pEntry', '1.1000'); setVal('pSL', '1.0950'); setVal('pRiskAmount', '100');
    eq('EURUSD : calcul auto 100 $ / 50 pips -> "0.20"', $('pLots').value, '0.20');
    setVal('pRiskAmount', '83.33');
    eq('EURUSD : 83.33 $ -> floor "0.16" (jamais au-dessus du risque)', $('pLots').value, '0.16');
    setVal('pLots', '0.015');
    ok('EURUSD saisie 0.015 -> erreur pas 0.01', $('pLotHint').textContent === "Volume invalide : le pas d'exécution est de 0.01 lot." && $('pLots').value === '0.015', $('pLotHint').textContent);
    setVal('pLots', '0.009');
    ok('EURUSD saisie 0.009 -> erreur minimum', $('pLotHint').textContent === 'Volume invalide : minimum autorisé 0.01 lot.', $('pLotHint').textContent);
    const nA = alerts.length; const nO = OPEN_TRADES.length;
    await savePosition();
    ok('sauvegarde avec volume invalide bloquée + message', OPEN_TRADES.length === nO && alerts[nA] === 'Volume invalide : minimum autorisé 0.01 lot.', alerts[nA]);
    setVal('pActif', 'MES'); setVal('pEntry', '5000'); setVal('pSL', '4990'); setVal('pRiskAmount', '120');
    ok('MES : libellé "Contrats" + fiche CONTRACTS min 1 pas 1', $('pLotsLabel').textContent === 'Contrats' && /Mode : CONTRACTS · Min : 1 · Max : — · Pas : 1/.test($('pVolumeSpecInfo').textContent), $('pVolumeSpecInfo').textContent);
    eq('MES : calcul auto 120 $ -> "2" contrats', $('pLots').value, '2');
    setVal('pLots', '1.5');
    eq('MES saisie 1.5 -> "utilisez des contrats entiers"', $('pLotHint').textContent, 'Volume invalide pour cet instrument : utilisez des contrats entiers.');
    setVal('pLots', '2');
    ok('MES saisie 2 -> acceptée, risque dérivé 100 $', !/invalide/i.test($('pLotHint').textContent) && $('pRiskAmount').value === '100', `${$('pLotHint').textContent} / ${$('pRiskAmount').value}`);
    ok('MES : avertissement de devise explicite (USD vs compte)', SETTINGS.currency === '$' || /aucune conversion/.test($('pLotHint').textContent), $('pLotHint').textContent);
    setVal('pActif', 'FOOBAR1');
    ok('instrument inconnu : fiche "inconnue" + calcul bloqué', /Spécification d'exécution inconnue/.test($('pVolumeSpecInfo').textContent));
    setVal('pRiskAmount', '100');
    ok('instrument inconnu : message clair, aucun volume inventé', $('pLots').value === '' && $('pLotHint').textContent === "Impossible de calculer un volume fiable : spécification d'instrument indisponible.", $('pLotHint').textContent);
    setVal('pActif', 'MES'); setVal('pLots', '2');
    const nO2 = OPEN_TRADES.length;
    await savePosition();
    const mesTrade = OPEN_TRADES[OPEN_TRADES.length - 1];
    ok('MES 2 contrats ouvert', OPEN_TRADES.length === nO2 + 1 && mesTrade.actif === 'MES' && mesTrade.lots === 2 && mesTrade.status === 'open');
    ok('MES : riskAmountAtEntry = 100 $ figé, capitalAtEntry figé', mesTrade.riskAmountAtEntry === 100 && mesTrade.capitalAtEntry === getCurrentCapital());
    renderOpenTrades();
    ok('carte "Trades en cours" : libellé "Contrats" et volume "2"', document.body.innerHTML.includes('<label>Contrats</label><span>2</span>'));
    openCloseTradeModal(mesTrade.id);
    setVal('closeExit', '5010');
    ok('clôture MES : exit 5010 -> +100.00 $ / 1.00 R', $('closePnl').value === '100.00' && $('closeRR').value === '1.00', `${$('closePnl').value} / ${$('closeRR').value}`);
    setVal('closeExit', '');
    ok('clôture MES : exit effacé -> champs vides', $('closePnl').value === '' && $('closeRR').value === '');
    setVal('closeExit', '5020');
    await confirmCloseTrade();
    const mesClosed = TRADES.find(t => t.id === mesTrade.id);
    ok('clôture MES : Realized R = 2.00 (200 $ / 100 $)', mesClosed && near(mesClosed.realizedR, 2) && mesClosed.result === 'TP');
    const mesRow = [...document.querySelectorAll('#logTableWrap tbody tr')].find(tr => tr.children[1] && tr.children[1].textContent === 'MES');
    eq('historique : MES affiché "2"', mesRow ? mesRow.children[5].textContent.trim() : null, '2');
    // Formulaire "Ajouter un trade" (saisie historique) : volume validé par la même couche centrale.
    openTradeModal();
    setVal('fActif', 'MES'); setVal('fLots', '1.5');
    const nT = TRADES.length, nA2 = alerts.length;
    await saveTrade();
    ok('"Ajouter un trade" : MES 1.5 refusé (contrats entiers)', TRADES.length === nT && alerts[nA2] === 'Volume invalide pour cet instrument : utilisez des contrats entiers.', alerts[nA2]);
    closeTradeModal && closeTradeModal();
  } catch (e) {
    R.push({ suite, name:'EXCEPTION DU HARNAIS', pass:false, detail: e && e.stack ? e.stack : String(e) });
  } finally {
    registered.forEach(([level, key, sym]) => unregisterInstrumentExecutionSpec(level, key, sym));
    TRADES = snap.trades; OPEN_TRADES = snap.open; SETTINGS = snap.settings;
    try { await persistTrades(); await persistOpenTrades(); } catch (e) {}
    try { closePositionModal(); closeCloseTradeModal(); } catch (e) {}
    renderAll();
    window.alert = origAlert; window.confirm = origConfirm;
  }
  const errors = window.__wtxErrors.slice(errStart);
  const bySuite = {};
  R.forEach(r => { bySuite[r.suite] = bySuite[r.suite] || { pass:0, fail:0 }; bySuite[r.suite][r.pass ? 'pass' : 'fail']++; });
  window.__wtxTestReport = { total: R.length, pass: R.filter(r => r.pass).length, fail: R.filter(r => !r.pass).length, bySuite, failures: R.filter(r => !r.pass), jsErrors: errors, results: R };
  return window.__wtxTestReport;
};
