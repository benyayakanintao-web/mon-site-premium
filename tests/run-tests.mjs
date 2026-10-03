// WT-X — lanceur de tests automatisés (Node + navigateur headless via puppeteer-core).
// La page réelle est servie en HTTP (tools/serve.mjs), puis 4 contrôles sont exécutés :
//   1. démarrage sans erreur JavaScript ;
//   2. exposition des handlers globaux (onclick/oninput… du HTML et des gabarits JS) ;
//   3. suite existante tests/wtx_cmvp2_volume_tests.js ;
//   4. instantané de caractérisation du moteur (tests/baseline/characterize.js) comparé à wtx-baseline.json.
// Usage : npm test   |   npm run test:update-baseline (réécrit la référence — uniquement après décision explicite)
// Navigateur : variable CHROME_PATH, sinon Chrome / Edge installés sur la machine.
import { existsSync } from 'node:fs';
import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import puppeteer from 'puppeteer-core';
import { startServer, ROOT, APP_PAGE } from '../tools/serve.mjs';
import { findBrowser } from './browser.mjs';

const UPDATE = process.argv.includes('--update-baseline');
const BASELINE_FILE = path.join(ROOT, 'tests', 'baseline', 'wtx-baseline.json');
const RESULTS_DIR = path.join(ROOT, 'test-results');

const NOT_HANDLERS = new Set(['if', 'return', 'function', 'typeof', 'new', 'void', 'await', 'event', 'this', 'window', 'document']);

// Noms de fonctions appelées depuis les attributs on*="nom(" : page principale + futurs fichiers src/**/*.js.
async function collectHandlerNames(){
  const sources = [await readFile(path.join(ROOT, APP_PAGE), 'utf8')];
  const srcDir = path.join(ROOT, 'src');
  if(existsSync(srcDir)){
    for(const entry of await readdir(srcDir, { recursive: true })){
      if(entry.endsWith('.js')) sources.push(await readFile(path.join(srcDir, entry), 'utf8'));
    }
  }
  const names = new Set();
  for(const text of sources){
    for(const m of text.matchAll(/\bon[a-z]+="\s*([A-Za-z_$][\w$]*)\s*\(/g)){
      if(!NOT_HANDLERS.has(m[1])) names.add(m[1]);
    }
  }
  return [...names].sort();
}

function diffKeys(actual, expected, prefix = ''){
  const diffs = [];
  const keys = new Set([...Object.keys(actual || {}), ...Object.keys(expected || {})]);
  for(const k of keys){
    const a = actual?.[k], e = expected?.[k];
    if(isDeepStrictEqual(a, e)) continue;
    if(a && e && typeof a === 'object' && typeof e === 'object') diffs.push(...diffKeys(a, e, `${prefix}${k}.`));
    else diffs.push(`${prefix}${k} : obtenu ${JSON.stringify(a)} / attendu ${JSON.stringify(e)}`);
  }
  return diffs;
}

async function main(){
  const executablePath = findBrowser();

  const server = await startServer(0);
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const browser = await puppeteer.launch({ executablePath, headless: true, args: ['--no-first-run', '--no-default-browser-check'] });
  const pageErrors = [];
  let failed = false;
  const fail = msg => { failed = true; console.log(`  ✗ ${msg}`); };
  const pass = msg => console.log(`  ✓ ${msg}`);

  try{
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });
    // Collecteur d'erreurs attendu par la suite existante (window.__wtxErrors), installé avant tout script de la page.
    await page.evaluateOnNewDocument(() => {
      window.__wtxErrors = [];
      window.addEventListener('error', e => window.__wtxErrors.push(String(e.message || e.error)));
      window.addEventListener('unhandledrejection', e => window.__wtxErrors.push('unhandledrejection: ' + String(e.reason)));
    });
    page.on('pageerror', err => pageErrors.push(err.message));
    page.on('console', msg => { if(msg.type() === 'error') pageErrors.push('console.error: ' + msg.text()); });

    /* 1. Démarrage */
    console.log(`\n[1] Démarrage — ${baseUrl}/ (${path.basename(executablePath)})`);
    await page.goto(`${baseUrl}/`, { waitUntil: 'networkidle0', timeout: 60000 });
    // init() se termine par la création de openTradesTicker : marqueur de fin de démarrage.
    await page.waitForFunction(() => typeof openTradesTicker !== 'undefined' && openTradesTicker !== null, { timeout: 30000 });
    const startup = await page.evaluate(() => ({
      chartJs: typeof Chart !== 'undefined',
      trades: TRADES.length,
      accounts: ACCOUNTS.length,
      activeView: document.querySelector('.view.active')?.id || null,
      storageHost: typeof window.storage !== 'undefined',
    }));
    await mkdir(RESULTS_DIR, { recursive: true });
    await page.screenshot({ path: path.join(RESULTS_DIR, 'startup.png'), fullPage: false });
    const startupErrors = [...pageErrors];
    if(startupErrors.length) fail(`erreurs au démarrage : ${startupErrors.join(' | ')}`);
    else pass(`démarrage sans erreur (vue ${startup.activeView}, ${startup.trades} trades, Chart.js ${startup.chartJs ? 'chargé' : 'ABSENT'}, window.storage ${startup.storageHost ? 'présent' : 'absent'})`);

    /* 2. Handlers globaux */
    console.log('\n[2] Handlers globaux on*="…"');
    const handlerNames = await collectHandlerNames();
    const missingHandlers = await page.evaluate(names => names.filter(n => {
      try{ return (0, eval)(`typeof ${n}`) !== 'function'; }catch{ return true; }
    }), handlerNames);

    /* 3. Suite existante */
    console.log('\n[3] Suite existante — tests/wtx_cmvp2_volume_tests.js');
    await page.addScriptTag({ url: '/tests/wtx_cmvp2_volume_tests.js' });
    const report = await page.evaluate(async () => {
      const r = await window.__wtxRunTests();
      return { total: r.total, pass: r.pass, fail: r.fail, bySuite: r.bySuite, failures: r.failures, jsErrors: r.jsErrors };
    });
    await writeFile(path.join(RESULTS_DIR, 'volume-tests-report.json'), JSON.stringify(report, null, 2));
    if(report.fail === 0 && report.jsErrors.length === 0) pass(`${report.pass}/${report.total} réussis`);
    else{
      fail(`${report.pass}/${report.total} réussis, ${report.fail} échec(s), ${report.jsErrors.length} erreur(s) JS`);
      report.failures.forEach(f => console.log(`      [${f.suite}] ${f.name} — ${f.detail}`));
      report.jsErrors.forEach(e => console.log(`      JS : ${e}`));
    }

    /* 4. Caractérisation */
    console.log('\n[4] Caractérisation du moteur — tests/baseline/characterize.js');
    await page.addScriptTag({ url: '/tests/baseline/characterize.js' });
    const characterization = await page.evaluate(() => window.__wtxCharacterize());

    const current = {
      page: APP_PAGE,
      handlers: { count: handlerNames.length, missing: missingHandlers },
      volumeSuite: { total: report.total, pass: report.pass, fail: report.fail },
      characterization,
    };

    if(UPDATE){
      await mkdir(path.dirname(BASELINE_FILE), { recursive: true });
      await writeFile(BASELINE_FILE, JSON.stringify(current, null, 2) + '\n');
      console.log(`\n  → référence réécrite : ${path.relative(ROOT, BASELINE_FILE)}`);
    }
    if(!existsSync(BASELINE_FILE)){
      fail('aucune référence tests/baseline/wtx-baseline.json — lancer npm run test:update-baseline');
    }else{
      const baseline = JSON.parse(await readFile(BASELINE_FILE, 'utf8'));
      const newlyMissing = missingHandlers.filter(n => !baseline.handlers.missing.includes(n));
      if(newlyMissing.length) fail(`handlers devenus inaccessibles : ${newlyMissing.join(', ')}`);
      else pass(`${handlerNames.length} handlers référencés, aucun nouveau manquant (${missingHandlers.length} déjà absents dans la référence)`);
      if(handlerNames.length < baseline.handlers.count) fail(`handlers détectés : ${handlerNames.length} < référence ${baseline.handlers.count} (balisage perdu ?)`);

      const diffs = diffKeys(characterization, baseline.characterization);
      if(diffs.length){ fail(`caractérisation différente de la référence (${diffs.length} écart(s)) :`); diffs.slice(0, 40).forEach(d => console.log(`      ${d}`)); }
      else pass(`caractérisation identique à la référence (${Object.keys(characterization).length} groupes)`);
    }
  } finally {
    await browser.close();
    server.close();
  }

  console.log(failed ? '\nÉCHEC\n' : '\nOK\n');
  process.exitCode = failed ? 1 : 0;
}

main().catch(err => { console.error(err); process.exitCode = 1; });
