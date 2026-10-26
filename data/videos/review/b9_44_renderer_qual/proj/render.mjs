// Headless native Motion Canvas render: serve vite project, drive Renderer via chromium.
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
const ROOT = new URL('.', import.meta.url).pathname;
const server = spawn('npx', ['vite', '--port', '9009', '--strictPort'], { cwd: ROOT, stdio: 'pipe' });
let ready = false;
server.stdout.on('data', d => { const s = String(d); if (s.includes('ready') || s.includes('Local:')) ready = true; });
server.stderr.on('data', () => {});
const t0 = Date.now();
while (!ready && Date.now() - t0 < 45000) await sleep(1000);
if (!ready) { server.kill(); console.error('VITE_NOT_READY'); process.exit(2); }
console.log('VITE_READY');
// Drive render with playwright chromium headless (software GL).
const { chromium } = await import('playwright');
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
const logs = [];
page.on('console', m => logs.push(`${m.type()}: ${m.text().slice(0, 300)}`));
page.on('pageerror', e => logs.push(`pageerror: ${String(e).slice(0, 300)}`));
await page.goto('http://localhost:9009/', { waitUntil: 'networkidle', timeout: 60000 });
await sleep(8000);
const state = await page.evaluate(() => ({ title: document.title, canvases: document.querySelectorAll('canvas').length, bodyLen: document.body.innerHTML.length }));
console.log('PAGE_STATE', JSON.stringify(state));
console.log('LOGS', JSON.stringify(logs.slice(0, 20)));
await browser.close();
server.kill();
