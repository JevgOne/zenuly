// @ts-check
// Retest #38 — dashboard KPI + report diakritika + admin landing
const { chromium } = require('@playwright/test');
const fs = require('fs');

const BASE = 'http://localhost:3098';
const EMAIL = 'zenuly3@gmail.com';
const PASS = 'zenulythebest2026!';
const OUT = '/Users/zen/zenuly/.claude-context/tasks/retest38';

fs.mkdirSync(OUT, { recursive: true });

function hasBrokenDia(text) {
  return /\\u[0-9a-fA-F]{4}/.test(text);
}

(async () => {
  require('child_process').execSync('open -a "Google Chrome" http://localhost:3098', { stdio: 'ignore' });

  // Použij ČERSTVÝ kontext — smaž persistent profil aby se odhlásil
  const ctx = await chromium.launchPersistentContext('/tmp/zenuly-retest38', {
    headless: false, slowMo: 300, viewport: { width: 1440, height: 900 }
  });
  const page = await ctx.newPage();

  const jsErrors = [];
  page.on('console', m => { if (m.type() === 'error') jsErrors.push(m.text().substring(0, 150)); });
  page.on('pageerror', e => jsErrors.push('PAGE: ' + e.message.substring(0, 150)));

  // ===== TEST 1: DASHBOARD =====
  console.log('\n=== TEST 1: DASHBOARD (/weblyx/dashboard) ===');
  // Přihlásit se čerstvě
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle', timeout: 15000 });
  await page.locator('input[type="email"]').fill(EMAIL);
  await page.locator('input[type="password"]').fill(PASS);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL(u => !u.href.includes('login'), { timeout: 12000 }).catch(() => {});
  await page.waitForTimeout(2000);

  const landingUrl = page.url();
  console.log('Landing URL po přihlášení:', landingUrl);
  await page.screenshot({ path: `${OUT}/01-landing-after-login.png` });

  // Nyní jdi na dashboard
  await page.goto(`${BASE}/weblyx/dashboard`, { waitUntil: 'networkidle', timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(3000);
  await page.screenshot({ path: `${OUT}/02-dashboard.png` });

  const dashText = await page.locator('body').textContent().catch(() => '');
  const dashUrl = page.url();
  console.log('Dashboard URL:', dashUrl);

  const hasError = dashText.includes('Nepodařilo se načíst');
  const hasKPI = dashText.includes('Hovory') || dashText.includes('Konzultace') || dashText.includes('Dovoláno');
  const hasPipeline = dashText.includes('Pipeline') || dashText.includes('pipeline');
  const hasOperators = dashText.includes('Operátor') || dashText.includes('operátor');
  const dashBroken = hasBrokenDia(dashText);

  console.log(`  Error zpráva: ${hasError ? 'ANO — BUG' : 'NE'}`);
  console.log(`  KPI dlaždice: ${hasKPI ? 'OK' : 'CHYBÍ'}`);
  console.log(`  Pipeline sekce: ${hasPipeline ? 'OK' : 'CHYBÍ'}`);
  console.log(`  Operátoři sekce: ${hasOperators ? 'OK' : 'CHYBÍ'}`);
  console.log(`  Diakritika: ${dashBroken ? 'ROZBITÉ' : 'OK'}`);

  // 500 chyby v konzoli?
  const dash500 = jsErrors.filter(e => e.includes('500')).length;
  console.log(`  HTTP 500 chyby: ${dash500}`);

  // ===== TEST 2: REPORT DIAKRITIKA =====
  console.log('\n=== TEST 2: REPORT (/weblyx/report) ===');
  await page.goto(`${BASE}/weblyx/report`, { waitUntil: 'networkidle', timeout: 12000 }).catch(() => {});
  await page.waitForTimeout(2000);
  await page.screenshot({ path: `${OUT}/03-report.png` });

  const reportText = await page.locator('body').textContent().catch(() => '');
  const reportBroken = hasBrokenDia(reportText);
  const reportHasCorrect = reportText.includes('konzultací') || reportText.includes('hovorů') ||
                            reportText.includes('Dovoláno') || reportText.includes('Doporučení');

  console.log(`  Rozbité \\uXXXX: ${reportBroken ? 'ANO — BUG' : 'NE — OK'}`);
  console.log(`  Správná čeština: ${reportHasCorrect ? 'ANO — OK' : 'NE — WARN'}`);
  if (reportBroken) {
    const matches = reportText.match(/\\u[0-9a-fA-F]{4}/g) || [];
    console.log(`  Příklady: ${matches.slice(0, 5).join(', ')}`);
  }

  // ===== TEST 3: ODHLÁSIT A ZNOVU PŘIHLÁSIT =====
  console.log('\n=== TEST 3: ODHLÁSIT → PŘIHLÁSIT → LANDING ===');
  // Odhlásit přes navigaci
  await page.goto(`${BASE}/weblyx/dashboard`, { waitUntil: 'domcontentloaded', timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(1000);

  // Klikni na avatar/menu pro odhlášení
  const avatarBtn = page.locator('[aria-label*="menu"], [aria-label*="profil"], button:has-text("ZA"), [class*="avatar"]').first();
  const avatarCount = await avatarBtn.count();
  if (avatarCount > 0) {
    await avatarBtn.click();
    await page.waitForTimeout(800);
    await page.screenshot({ path: `${OUT}/04-menu-open.png` });
    const logoutBtn = page.locator(':text("Odhlásit"), :text("Logout"), :text("Odhlásit se")').first();
    const logoutCount = await logoutBtn.count();
    if (logoutCount > 0) {
      await logoutBtn.click();
      await page.waitForURL(u => u.href.includes('login'), { timeout: 8000 }).catch(() => {});
      console.log('  Odhlášení: OK, URL:', page.url());
    } else {
      console.log('  Logout tlačítko nenalezeno v menu');
    }
  } else {
    // Přímé odhlášení přes URL (pokud existuje)
    await page.goto(`${BASE}/login`, { waitUntil: 'networkidle', timeout: 10000 }).catch(() => {});
    console.log('  Avatar nenalezen, jdu na login přímo');
  }

  await page.screenshot({ path: `${OUT}/05-after-logout.png` });

  // Přihlásit znovu
  if (page.url().includes('login')) {
    await page.locator('input[type="email"]').fill(EMAIL);
    await page.locator('input[type="password"]').fill(PASS);
    await page.locator('button[type="submit"]').click();
    await page.waitForURL(u => !u.href.includes('login'), { timeout: 12000 }).catch(() => {});
    await page.waitForTimeout(2500);
  }

  const finalLandingUrl = page.url();
  console.log('  Landing po re-loginu:', finalLandingUrl);
  const landingOnDashboard = finalLandingUrl.includes('/dashboard');
  console.log(`  Admin landuje na dashboard: ${landingOnDashboard ? 'ANO — OK' : 'NE — BUG (landuje na: ' + finalLandingUrl + ')'}`);
  await page.screenshot({ path: `${OUT}/06-final-landing.png` });

  // ===== SOUHRN =====
  console.log('\n=== SOUHRN ===');
  const tests = [
    { name: 'Dashboard - bez error zprávy', ok: !hasError },
    { name: 'Dashboard - KPI dlaždice', ok: hasKPI },
    { name: 'Dashboard - pipeline sekce', ok: hasPipeline },
    { name: 'Dashboard - operátoři sekce', ok: hasOperators },
    { name: 'Dashboard - diakritika', ok: !dashBroken },
    { name: 'Report - diakritika opravena', ok: !reportBroken },
    { name: 'Report - správná čeština', ok: reportHasCorrect },
    { name: 'Admin landing na /dashboard', ok: landingOnDashboard },
  ];

  tests.forEach(t => console.log(`  [${t.ok ? '✓' : '✗'}] ${t.name}`));
  const passed = tests.filter(t => t.ok).length;
  console.log(`\nVýsledek: ${passed}/${tests.length} testů prošlo`);

  await ctx.close();
})().catch(e => { console.error('CHYBA:', e.message); process.exit(1); });
