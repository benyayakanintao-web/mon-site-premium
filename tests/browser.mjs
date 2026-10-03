// WT-X — localisation du navigateur utilisé par les tests (puppeteer-core ne télécharge aucun navigateur).
import { existsSync } from 'node:fs';

const BROWSER_CANDIDATES = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].filter(Boolean);

export function findBrowser(){
  const found = BROWSER_CANDIDATES.find(p => existsSync(p));
  if(!found) throw new Error('Aucun navigateur Chrome/Edge trouvé — définir CHROME_PATH.');
  return found;
}
