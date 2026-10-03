// WT-X — non-régression visuelle par styles calculés.
// Compare la page actuelle à la page de référence extraite de Git (par défaut le tag wtx-baseline-pre-refactor) :
// pour chaque vue, chaque largeur d'écran et le média print, les styles calculés de TOUS les éléments du <body>
// (+ <html>, <body>, ::before, ::after) doivent être strictement identiques.
// Usage : npm run test:visual   |   REF=<commit/tag> npm run test:visual
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import puppeteer from 'puppeteer-core';
import { startServer, ROOT, APP_PAGE } from '../../tools/serve.mjs';
import { findBrowser } from '../browser.mjs';

const REF = process.env.REF || 'wtx-baseline-pre-refactor';
const REF_PAGE = 'Journal_Trading_Dashboard_CMVP2_FinalGaps_Fix3.html'; // page monolithique au tag de référence
const OUT_DIR = path.join(ROOT, 'test-results', 'visual');
const VIEWPORTS = [
  { name: 'desktop-1440', width: 1440, height: 900, media: 'screen' },
  { name: 'laptop-1000', width: 1000, height: 800, media: 'screen' },
  { name: 'mobile-390', width: 390, height: 844, media: 'screen' },
  { name: 'print-1440', width: 1440, height: 900, media: 'print' },
].filter(vp => !process.env.VP || process.env.VP.split(',').includes(vp.name)); // VP=desktop-1440,… pour cibler

// Exécuté dans la page : empreinte des styles calculés des éléments situés sous l'un des `roots` (sélecteurs CSS),
// indexée par leur chemin dans le DOM. Les dumps complets restent dans la page (window.__wtxStyleDump) pour que le
// diagnostic porte sur le MÊME instantané que les empreintes (voir styleDetails).
function collectStyles({ roots }){
  const hash = s => { let h = 0x811c9dc5; for(let i = 0; i < s.length; i++){ h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); } return (h >>> 0).toString(16); };
  // Propriétés triées : Chrome énumère les propriétés personnalisées (--…) dans un ordre non déterministe d'un processus à l'autre.
  const dump = (el, pseudo) => { const cs = getComputedStyle(el, pseudo); return Array.from(cs).sort().map(p => p + ':' + cs.getPropertyValue(p) + ';').join(''); };
  // Un pseudo-élément n'est généré que si `content` n'est ni none ni normal : inutile de le dumper sinon.
  const pseudo = (el, which) => { const c = getComputedStyle(el, which).content; return (c === 'none' || c === 'normal') ? '' : dump(el, which); };
  const rootEls = new Set(roots.flatMap(sel => [...document.querySelectorAll(sel)]));
  const out = {};
  const full = window.__wtxStyleDump = {};
  const walk = (el, key, inRoot) => {
    if(['SCRIPT', 'STYLE', 'LINK', 'HEAD'].includes(el.tagName)) return;
    inRoot = inRoot || rootEls.has(el);
    if(inRoot){
      full[key] = dump(el, null) + '|::before|' + pseudo(el, '::before') + '|::after|' + pseudo(el, '::after');
      out[key] = hash(full[key]);
    }
    let i = 0;
    for(const child of el.children){ walk(child, key + '>' + child.tagName.toLowerCase() + (child.id ? '#' + child.id : '') + ':' + (i++), inRoot); }
  };
  walk(document.documentElement, 'html', false);
  return out;
}
const styleDetails = keys => Object.fromEntries(keys.map(k => [k, window.__wtxStyleDump[k]]));

async function openApp(browser, url, vp){
  const page = await browser.newPage();
  await page.setViewport({ width: vp.width, height: vp.height });
  await page.emulateMediaType(vp.media);
  await page.goto(url, { waitUntil: 'networkidle0', timeout: 60000 });
  await page.waitForFunction(() => typeof openTradesTicker !== 'undefined' && openTradesTicker !== null, { timeout: 30000 });
  return page;
}

async function settle(page){
  await page.evaluate(async () => {
    // L'indicateur de navigation est positionné en JS à l'init, parfois avant la fin du chargement des polices web
    // (course préexistante, voir docs/issues/nav-indicator-font-race.md) : on le remesure une fois les polices prêtes,
    // comme le fait déjà showView(), pour ne comparer que le CSS.
    await document.fonts.ready;
    updateActiveIndicator();
    await new Promise(r => setTimeout(r, 400));
    document.getAnimations().forEach(a => { try{ a.finish(); }catch{} });
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  });
}

function diffStyles(a, b){
  const props = s => Object.fromEntries(s.split(';').filter(Boolean).map(kv => { const i = kv.indexOf(':'); return [kv.slice(0, i), kv.slice(i + 1)]; }));
  const out = [];
  const [aParts, bParts] = [a.split('|::'), b.split('|::')];
  aParts.forEach((part, idx) => {
    const pa = props(part.replace(/^(before|after)\|/, '')), pb = props((bParts[idx] || '').replace(/^(before|after)\|/, ''));
    for(const k of new Set([...Object.keys(pa), ...Object.keys(pb)])){
      if(pa[k] !== pb[k]) out.push(`${['', '::before ', '::after '][idx]}${k}: réf "${pa[k]}" / actuel "${pb[k]}"`);
    }
  });
  return out;
}

async function main(){
  // Page de référence extraite de Git, servie depuis test-results/ (ignoré par Git).
  const refHtml = execFileSync('git', ['show', `${REF}:${REF_PAGE}`], { cwd: ROOT, maxBuffer: 64 * 1024 * 1024 });
  await mkdir(OUT_DIR, { recursive: true });
  await writeFile(path.join(OUT_DIR, 'reference.html'), refHtml);

  const server = await startServer(0);
  const base = `http://127.0.0.1:${server.address().port}`;
  // Un navigateur par page : deux onglets d'un même navigateur se mettraient mutuellement en arrière-plan,
  // où requestAnimationFrame ne s'exécute plus (rendu de l'app et stabilisation bloqués).
  const launch = () => puppeteer.launch({ executablePath: findBrowser(), headless: true, protocolTimeout: 300000 });
  const [refBrowser, curBrowser] = await Promise.all([launch(), launch()]);
  let totalDiffs = 0, totalChecks = 0;
  try{
    for(const vp of VIEWPORTS){
      const [ref, cur] = await Promise.all([
        openApp(refBrowser, `${base}/test-results/visual/reference.html`, vp),
        openApp(curBrowser, `${base}/${APP_PAGE}`, vp),
      ]);
      const views = await ref.evaluate(() => [...document.querySelectorAll('section.view')].map(s => s.id));
      const curViews = await cur.evaluate(() => [...document.querySelectorAll('section.view')].map(s => s.id));
      if(JSON.stringify(views) !== JSON.stringify(curViews)) throw new Error(`vues différentes : ${views} / ${curViews}`);
      let vpDiffs = 0;
      // Premier passage : toute la page (vue par défaut active) ; ensuite, pour chaque vue, seuls son sous-arbre
      // et la sidebar (état actif de navigation) changent de styles calculés.
      const passes = [{ label: 'page entière', view: views[0], roots: ['html'] },
        ...views.map(view => ({ label: view, view, roots: ['#' + view, '.sidebar'] }))];
      for(const pass of passes){
        const viewName = pass.view.replace(/^view-/, '');
        await Promise.all([ref, cur].map(async p => { await p.evaluate(v => showView(v), viewName); await settle(p); }));
        const [a, b] = await Promise.all([ref, cur].map(p => p.evaluate(collectStyles, { roots: pass.roots })));
        totalChecks += Object.keys(a).length;
        const structural = Object.keys(a).length !== Object.keys(b).length || Object.keys(a).some(k => !(k in b));
        const changed = Object.keys(a).filter(k => a[k] !== b[k]);
        if(structural || changed.length){
          vpDiffs += changed.length || 1;
          console.log(`  ✗ [${vp.name}] ${pass.label} : ${structural ? 'DOM différent, ' : ''}${changed.length} élément(s) aux styles différents`);
          const detailKeys = changed.slice(0, 5);
          const [da, db] = await Promise.all([ref, cur].map(p => p.evaluate(styleDetails, detailKeys)));
          detailKeys.forEach(k => { console.log(`      ${k}`); diffStyles(da[k] || '', db[k] || '').slice(0, 8).forEach(d => console.log(`        ${d}`)); });
        }
        if(vp.media === 'screen' && pass.roots[0] !== 'html'){
          await ref.screenshot({ path: path.join(OUT_DIR, `${vp.name}-${viewName}-ref.png`) });
          await cur.screenshot({ path: path.join(OUT_DIR, `${vp.name}-${viewName}-cur.png`) });
        }
      }
      console.log(`  ${vpDiffs ? '✗' : '✓'} [${vp.name}] ${views.length} vues comparées${vpDiffs ? '' : ' — styles calculés identiques'}`);
      totalDiffs += vpDiffs;
      await ref.close(); await cur.close();
    }
  } finally {
    await Promise.all([refBrowser.close(), curBrowser.close()]);
    server.close();
  }
  console.log(totalDiffs ? `\nÉCHEC — ${totalDiffs} différence(s)\n` : `\nOK — ${totalChecks} empreintes d'éléments identiques à ${REF}\n`);
  process.exitCode = totalDiffs ? 1 : 0;
}

main().catch(err => { console.error(err); process.exitCode = 1; });
