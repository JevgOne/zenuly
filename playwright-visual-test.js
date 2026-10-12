// @ts-check
// Vizuální test — screenshoty všech stránek po přihlášení
const { chromium } = require('@playwright/test');
const fs = require('fs');

const BASE = 'http://localhost:3098';
const EMAIL = 'zenuly3@gmail.com';
const PASS = 'zenulythebest2026!';
const OUT = '/Users/zen/zenuly/.claude-context/tasks';

fs.mkdirSync(OUT, { recursive: true });

(async () => {
  const userDataDir = '/tmp/zenuly-playwright-profile';
  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    slowMo: 200,
    viewport: { width: 1440, height: 900 }
  });
  const page = await context.newPage();

  // Login pokud potřeba
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle', timeout: 15000 }).catch(() => {});
  if (page.url().includes('login')) {
    await page.locator('input[type="email"]').fill(EMAIL);
    await page.locator('input[type="password"]').fill(PASS);
    await page.locator('button[type="submit"]').click();
    await page.waitForURL(url => !url.href.includes('login'), { timeout: 10000 }).catch(() => {});
  }
  console.log('Přihlášen:', page.url());

  const pages = [
    { path: '/weblyx/fronta', name: 'fronta' },
    { path: '/weblyx/ukoly', name: 'ukoly' },
    { path: '/weblyx/kalendar', name: 'kalendar' },
    { path: '/weblyx/pipeline', name: 'pipeline' },
    { path: '/weblyx/import', name: 'import' },
    { path: '/weblyx/report', name: 'report' },
    { path: '/weblyx/export-hodin', name: 'export-hodin' },
    { path: '/weblyx/vykon', name: 'vykon' },
    { path: '/settings', name: 'settings' },
    { path: '/admin/users', name: 'admin-users' },
  ];

  for (const p of pages) {
    await page.goto(BASE + p.path, { waitUntil: 'domcontentloaded', timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(2500); // Čekej na data
    const url = page.url();
    console.log(`${p.name}: ${url}`);
    await page.screenshot({ path: `${OUT}/visual-${p.name}.png`, fullPage: false });
  }

  // Fronta — počkej 8 sekund aby se načetla data
  console.log('Čekám na data fronty...');
  await page.goto(BASE + '/weblyx/fronta', { waitUntil: 'networkidle', timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(8000);
  await page.screenshot({ path: `${OUT}/visual-fronta-loaded.png` });
  console.log('Fronta screenshot uložen');

  await context.close();
  console.log('Hotovo. Screenshoty v:', OUT);
})().catch(e => {
  console.error('ERROR:', e.message);
  process.exit(1);
});
