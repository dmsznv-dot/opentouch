// Throwaway spike: serves repo root, opens index.html, checks both canvases render the shared video.
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path'; import { createRequire } from 'node:module';
const require = createRequire(import.meta.url); const { chromium } = require('playwright');
const root = path.resolve(process.argv[2]); const video = process.argv[3] || '/tests/fixtures/bars.webm';
const types = { '.html':'text/html', '.webm':'video/webm', '.mp4':'video/mp4' };
const srv = http.createServer((req,res)=>{ const f=path.join(root, decodeURIComponent(req.url.split('?')[0])); if(!fs.existsSync(f)){res.statusCode=404;return res.end();} res.setHeader('Content-Type', types[path.extname(f)]||'application/octet-stream'); fs.createReadStream(f).pipe(res); }).listen(0);
const port = srv.address().port;
const browser = await chromium.launch({ args:['--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage(); const logs=[]; page.on('console', m=>{ if(m.type()==='error') logs.push(m.text()); });
await page.goto(`http://localhost:${port}/spikes/window-open/index.html?v=${video}`);
await page.waitForTimeout(1500);
const r = await page.evaluate(()=>window.result);
console.log(JSON.stringify({ chromium: browser.version(), ...r, consoleErrors: logs }));
await browser.close(); srv.close();
const ok = r.parent && r.child && r.parent.slice(0,3).some(v=>v>0) && r.child.slice(0,3).some(v=>v>0) && r.errors.length===0;
process.exit(ok?0:1);
