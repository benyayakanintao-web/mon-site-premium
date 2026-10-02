// WT-X — serveur statique local (aucune dépendance). WT-X doit être servi en HTTP, jamais ouvert via file://.
// Usage : npm run serve  (PORT=xxxx pour changer le port, 8080 par défaut)
import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const APP_PAGE = 'Journal_Trading_Dashboard_CMVP2_FinalGaps_Fix3.html';

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

export function startServer(port = 0){
  const server = http.createServer(async (req, res) => {
    try{
      let urlPath = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
      if(urlPath === '/') urlPath = '/' + APP_PAGE;
      const file = path.resolve(ROOT, '.' + urlPath);
      if(!file.startsWith(ROOT + path.sep)){ res.writeHead(403).end(); return; }
      if(!(await stat(file)).isFile()) throw new Error('not a file');
      const body = await readFile(file);
      res.writeHead(200, {
        'Content-Type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream',
        'Cache-Control': 'no-store',
      });
      res.end(body);
    }catch{
      // Requête automatique du navigateur : la page ne déclare pas de favicon, ce n'est pas une ressource manquante de WT-X.
      if(req.url === '/favicon.ico'){ res.writeHead(204).end(); return; }
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Not found');
    }
  });
  return new Promise(resolve => server.listen(port, '127.0.0.1', () => resolve(server)));
}

if(process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href){
  const server = await startServer(Number(process.env.PORT) || 8080);
  console.log(`WT-X : http://127.0.0.1:${server.address().port}/`);
}
