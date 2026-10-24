// Captures of the bench, 1440 x 900, and a pass of checks (console errors, the 16 / 16 px check, each gesture).
// Run from app/: LD_CHROMIUM=/opt/pw-browsers/chromium node ../design/rounds/2026-10-21-tuiles/capture.mjs [--probe]
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..', '..', '..'); // design/rounds/<round>/ -> repository root
const require = createRequire(join(REPO, 'app', 'package.json'));
const { chromium } = require('@playwright/test');
const OUT = join(REPO, '.impeccable', 'planche-tuiles');
const probe = process.argv.includes('--probe');

const server = createServer(async (req, res) => {
  const path = join(HERE, decodeURIComponent(new URL(req.url, 'http://x').pathname));
  let body = null;
  try { body = await readFile(path); } catch { /* not found */ }
  if (body) { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); res.end(body); } else { res.writeHead(404); res.end(); }
});
await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
const base = `http://127.0.0.1:${server.address().port}`;
await mkdir(OUT, { recursive: true });

const browser = await chromium.launch(process.env.LD_CHROMIUM ? { executablePath: process.env.LD_CHROMIUM } : {});
const log = [];
async function page(url, { reduced = false } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: reduced ? 'reduce' : 'no-preference' });
  const p = await ctx.newPage();
  p.on('console', (m) => { if (m.type() === 'error') log.push(`${url}: ${m.text()}`); });
  p.on('pageerror', (e) => log.push(`${url}: ${e.message}`));
  await p.goto(base + url);
  await p.evaluate(() => document.fonts.ready);
  await p.waitForTimeout(350);
  return { p, ctx };
}
const rects = (p) => p.evaluate(() => Object.fromEntries(['verdicts', 'couverture', 'sources', 'livraison'].map((id) => {
  const r = document.querySelector(`.w[data-float="${id}"]`).getBoundingClientRect();
  return [id, [r.x, r.y, r.width, r.height].map(Math.round).join(' ')];
})));
const verdict = (p) => p.evaluate(() => document.documentElement.dataset.spacing + ' ' + (document.querySelector('.bench [data-check]').title.split('\n')[0]));
const rows = (p) => p.evaluate(() => {
  const b = document.querySelector('.w[data-float="couverture"] .w-body'); const br = b.getBoundingClientRect();
  return [...b.querySelectorAll('tbody tr')].filter((r) => { const q = r.getBoundingClientRect(); return q.bottom <= br.bottom - 12 && q.top >= br.top; }).length;
});
async function shot(url, name, prep) {
  const { p, ctx } = await page(url);
  if (prep) await prep(p);
  await p.screenshot({ path: join(OUT, name) });
  log.push(`${name}: ${await verdict(p)}, Couverture ${await rows(p)} lignes lisibles sur 30`);
  await ctx.close();
}

if (probe) {
  for (const d of ['t1', 't2', 't3']) {
    for (const st of ['', 'cov']) {
      const { p, ctx } = await page(`/${d}.html?state=${st}`);
      log.push(`${d} ${st || 'maquette'}: ${await verdict(p)} ${JSON.stringify(await rects(p))} cov rows ${await rows(p)}`);
      await ctx.close();
    }
  }
  // gestures, each followed by the check
  {
    const { p, ctx } = await page('/t1.html');
    const g = p.locator('.grip.col');
    const b = await g.boundingBox();
    await p.mouse.move(b.x + 8, b.y + 300); await p.mouse.down(); await p.mouse.move(b.x - 200, b.y + 300, { steps: 8 }); await p.mouse.up();
    await p.waitForTimeout(80);
    log.push(`t1 drag col -200: ${await verdict(p)} ${JSON.stringify(await rects(p))}`);
    const r = p.locator('.grip.row').first(); const rb = await r.boundingBox();
    await p.mouse.move(rb.x + 100, rb.y + 8); await p.mouse.down(); await p.mouse.move(rb.x + 100, rb.y + 400, { steps: 8 }); await p.mouse.up();
    await p.waitForTimeout(80);
    log.push(`t1 drag row +400: ${await verdict(p)} ${JSON.stringify(await rects(p))}`);
    await r.focus(); await p.keyboard.press('Shift+ArrowUp'); await p.waitForTimeout(80);
    log.push(`t1 key shift-up: ${await verdict(p)} ${await r.getAttribute('aria-valuenow')}`);
    await p.reload(); await p.waitForTimeout(350);
    log.push(`t1 reload keeps: ${JSON.stringify(await rects(p))}`);
    await g.dblclick(); await r.dblclick(); await p.waitForTimeout(350);
    log.push(`t1 dblclick: ${await verdict(p)} ${JSON.stringify(await rects(p))}`);
    await ctx.close();
  }
  {
    const { p, ctx } = await page('/t2.html');
    await p.locator('.w[data-float="sources"] [data-wset]').click();
    await p.locator('.popover.wset [data-size="compact"]').click(); await p.waitForTimeout(350);
    log.push(`t2 sources compact: ${await verdict(p)} ${JSON.stringify(await rects(p))}`);
    await p.locator('.w[data-float="livraison"] [data-wset]').click();
    await p.locator('.popover.wset [data-first]').click(); await p.waitForTimeout(350);
    log.push(`t2 livraison first: ${await verdict(p)} ${JSON.stringify(await rects(p))}`);
    await p.locator('.w[data-float="couverture"] [data-wset]').click();
    await p.locator('.popover.wset [data-size="big"]').click(); await p.waitForTimeout(350);
    log.push(`t2 couverture big: ${await verdict(p)} ${JSON.stringify(await rects(p))}`);
    for (const id of ['verdicts', 'sources', 'livraison']) {
      await p.locator(`.w[data-float="${id}"] [data-wset]`).click();
      await p.locator('.popover.wset [data-size="compact"]').click(); await p.waitForTimeout(300);
    }
    log.push(`t2 all compact: ${await verdict(p)} ${JSON.stringify(await rects(p))}`);
    await ctx.close();
  }
  {
    const { p, ctx } = await page('/t3.html');
    const h = await p.locator('.w[data-float="livraison"] .w-head h2').boundingBox();
    await p.mouse.move(h.x + 5, h.y + 5); await p.mouse.down(); await p.mouse.move(400, 400, { steps: 10 });
    const lifted = await p.evaluate(() => [!!document.querySelector('.w[data-lifted]'), !!document.querySelector('.place-frame.target[data-on]')]);
    await p.mouse.up(); await p.waitForTimeout(350);
    log.push(`t3 drag livraison to big: lifted/target ${lifted} ${await verdict(p)} ${JSON.stringify(await rects(p))}`);
    await p.locator('.w[data-float="couverture"] [data-promote]').click(); await p.waitForTimeout(350);
    log.push(`t3 promote couverture: ${await verdict(p)} ${JSON.stringify(await rects(p))}`);
    await ctx.close();
  }
} else {
  for (const d of ['t1', 't2', 't3']) {
    await shot(`/${d}.html?bench=0`, `${d}-maquette-clair-1440.png`);
    await shot(`/${d}.html?bench=0&state=cov`, `${d}-couverture-clair-1440.png`);
    await shot(`/${d}.html?bench=0&state=cov&theme=dark`, `${d}-couverture-sombre-1440.png`);
  }
  await shot('/t1.html', 't1-banc-clair-1440.png');
  await shot('/t1.html?bench=0', 't1-glisse-clair-1440.png', async (p) => {
    const r = p.locator('.grip.row').first(); const rb = await r.boundingBox();
    await p.mouse.move(rb.x + 200, rb.y + 8); await p.mouse.down(); await p.mouse.move(rb.x + 200, rb.y + 160, { steps: 6 });
    await p.waitForTimeout(60);
  });
  await shot('/t2.html?bench=0&pop=couverture', 't2-reglages-clair-1440.png');
  await shot('/t2.html?bench=0&state=cov', 't2-couverture-compactes-clair-1440.png', async (p) => {
    for (const id of ['sources', 'livraison']) {
      await p.locator(`.w[data-float="${id}"] [data-wset]`).click();
      await p.locator('.popover.wset [data-size="compact"]').click(); await p.waitForTimeout(320);
    }
  });
  await shot('/t3.html?bench=0&lift=1', 't3-glisse-clair-1440.png');
}
console.log(log.join('\n'));
await browser.close();
server.close();
