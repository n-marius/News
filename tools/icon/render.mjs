// Rendert die Icons aus icon-vorlage.html (Aufruf: NODE_PATH=/opt/node-tools/node_modules node tools/icon/render.mjs v1)
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const dir = path.dirname(fileURLToPath(import.meta.url));
const ver = process.argv[2] || 'v1';
const tpl = await readFile(path.join(dir, 'icon-vorlage.html'), 'utf8');
const out = (n) => path.join(dir, '..', '..', 'icons', n);
const browser = await chromium.launch();
const jobs = [['icon-512-%.png', 512, 1], ['icon-192-%.png', 192, 1], ['icon-180-%.png', 180, 1], ['icon-512-maskable-%.png', 512, 0.74]];
for (const [name, size, scale] of jobs) {
  const page = await browser.newPage({ viewport: { width: 512, height: 512 }, deviceScaleFactor: size / 512 });
  await page.setContent(tpl.replace('SCALE', String(scale)));
  await page.locator('.i').screenshot({ path: out(name.replace('%', ver)), omitBackground: false });
  await page.close();
}
await browser.close();
