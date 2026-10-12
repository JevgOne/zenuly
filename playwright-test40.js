// @ts-check
// Task #40 — incognito test admin landing po fix #39
const { chromium } = require('@playwright/test');
const fs = require('fs');

const BASE = 'http://localhost:3098';
const EMAIL = 'zenuly3@gmail.com';
const PASS = 'zenulythebest2026!';
const OUT = '/Users/zen/zenuly/.claude-context/tasks/test40';
fs.mkdirSync(OUT, { recursive: true });

function hasBrokenDia(t) { return /\\u[0-9a-fA-F]{4}/.test(t); }

(async () => {
  require('child_process').execSync('open -a "Google Chrome" http://localhost:3098', { stdio: 'ignore' });

  // Čistý browser bez persistent profilu = simulace incognito
  const browser = await chromium.launch({ headless: false, slowMo: 350 });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();

  const errs = [];
  page.on('console', m => { if (m.type() === 'error') errs.push(m.text().substring(0, 100)); });
  page.on('pageerror', e => errs.push('PAGE:' + e.message.substring(0, 100)));

  // 1. Root → login redirect
  console.log('\n=== 1. ROOT → LOGIN ===');
  await page.goto(BASE + '/', { waitUntil: 'networkidle', timeout: 20000 });
  console.log('Root redirect:', page.url());
  await page.screenshot({ path: OUT + '/01-login.png' });

  // 2. Login
  console.log('\n=== 2. PŘIHLÁŠENÍ ===');
  await page.locator('input[type="email"]').fill(EMAIL);
  await page.locator('input[type="password"]').fill(PASS);
  await page.screenshot({ path: OUT + '/02-login-filled.png' });
  await page.locator('button[type="submit"]').click();

  await page.waitForURL(u => !u.href.includes('/login'), { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(3000);

  const landingUrl = page.url();
  const landingOk = landingUrl.includes('/dashboard');
  console.log('Landing URL po loginu:', landingUrl);
  console.log('[' + (landingOk ? '✓' : '✗') + '] Admin landuje na /dashboard: ' + (landingOk ? 'OPRAVENO' : 'BUG — ' + landingUrl));
  await page.screenshot({ path: OUT + '/03-after-login.png' });

  // 3. Dashboard obsah
  console.log('\n=== 3. DASHBOARD OBSAH ===');
  if (!landingUrl.includes('/dashboard')) {
    await page.goto(BASE + '/weblyx/dashboard', { waitUntil: 'networkidle', timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(3000);
  }
  await page.waitForTimeout(1000);
  await page.screenshot({ path: OUT + '/04-dashboard.png' });

  const dashText = await page.locator('body').textContent().catch(() => '');
  const hasError = dashText.includes('Nepodařilo se načíst');
  const hasKPI = dashText.includes('CELKEM LEADŮ') || dashText.includes('HOVORY DNES') || dashText.includes('DOVOLÁNO');
  const hasPipeline = dashText.includes('Pipeline') || dashText.includes('Nový lead');
  const hasOps = dashText.includes('Aktivita operátorů') || dashText.includes('Operátor');
  const dashBroken = hasBrokenDia(dashText);
  const http500 = errs.filter(e => e.includes('500')).length;

  console.log('[' + (!hasError ? '✓' : '✗') + '] Bez error zprávy');
  console.log('[' + (hasKPI ? '✓' : '✗') + '] KPI dlaždice: ' + (hasKPI ? 'nalezeny' : 'CHYBÍ'));
  console.log('[' + (hasPipeline ? '✓' : '✗') + '] Pipeline sekce: ' + (hasPipeline ? 'OK' : 'CHYBÍ'));
  console.log('[' + (hasOps ? '✓' : '✗') + '] Operátoři: ' + (hasOps ? 'OK' : 'CHYBÍ'));
  console.log('[' + (!dashBroken ? '✓' : '✗') + '] Diakritika: ' + (!dashBroken ? 'OK' : 'ROZBITÉ'));
  console.log('[' + (http500 === 0 ? '✓' : '✗') + '] HTTP 500: ' + http500);

  // Souhrn
  console.log('\n=== SOUHRN ===');
  const tests = [
    ['Admin landing na /dashboard po loginu', landingOk],
    ['Dashboard bez error zprávy', !hasError],
    ['Dashboard KPI dlaždice', hasKPI],
    ['Dashboard Pipeline', hasPipeline],
    ['Dashboard Operátoři', hasOps],
    ['Dashboard diakritika OK', !dashBroken],
    ['Dashboard bez HTTP 500', http500 === 0],
  ];
  tests.forEach(([n, ok]) => console.log('  [' + (ok ? '✓' : '✗') + '] ' + n));
  const passed = tests.filter(([, ok]) => ok).length;
  console.log('\nVýsledek: ' + passed + '/' + tests.length + (passed === tests.length ? ' — VŠECHNO OK' : ' — ZBÝVAJÍ BUGY'));

  await browser.close();
})().catch(e => { console.error('CHYBA:', e.message); process.exit(1); });
