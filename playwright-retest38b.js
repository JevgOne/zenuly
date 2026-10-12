// @ts-check
// Retest #38b — po restartu dev serveru
const { chromium } = require('@playwright/test');
const fs = require('fs');

const BASE = 'http://localhost:3098';
const EMAIL = 'zenuly3@gmail.com';
const PASS = 'zenulythebest2026!';
const OUT = '/Users/zen/zenuly/.claude-context/tasks/retest38b';
fs.mkdirSync(OUT, { recursive: true });

function hasBrokenDia(text) { return /\\u[0-9a-fA-F]{4}/.test(text); }

(async () => {
  require('child_process').execSync('open -a "Google Chrome" http://localhost:3098', { stdio: 'ignore' });

  // Čerstvý profil — aby nebyla stará session
  const profileDir = '/tmp/zenuly-retest38b';
  if (require('fs').existsSync(profileDir)) {
    require('child_process').execSync(`rm -rf ${profileDir}`);
  }

  const ctx = await chromium.launchPersistentContext(profileDir, {
    headless: false, slowMo: 350, viewport: { width: 1440, height: 900 }
  });
  const page = await ctx.newPage();

  const jsErrors = [];
  page.on('console', m => { if (m.type() === 'error') jsErrors.push(m.text().substring(0, 120)); });
  page.on('pageerror', e => jsErrors.push('PAGE: ' + e.message.substring(0, 120)));

  // ===== LOGIN =====
  console.log('\n=== LOGIN ===');
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle', timeout: 20000 });
  await page.screenshot({ path: `${OUT}/01-login.png` });
  await page.locator('input[type="email"]').fill(EMAIL);
  await page.locator('input[type="password"]').fill(PASS);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL(u => !u.href.includes('login'), { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(3000);

  const landingUrl = page.url();
  const landingOk = landingUrl.includes('/dashboard');
  console.log(`Landing URL: ${landingUrl}`);
  console.log(`[${landingOk ? '✓' : '✗'}] Admin landuje na /dashboard: ${landingOk ? 'OK' : 'BUG — ' + landingUrl}`);
  await page.screenshot({ path: `${OUT}/02-after-login.png` });

  // ===== DASHBOARD =====
  console.log('\n=== DASHBOARD (/weblyx/dashboard) ===');
  if (!landingUrl.includes('/dashboard')) {
    await page.goto(`${BASE}/weblyx/dashboard`, { waitUntil: 'networkidle', timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(3000);
  }
  await page.screenshot({ path: `${OUT}/03-dashboard.png` });

  const dashText = await page.locator('body').textContent().catch(() => '');
  const hasError = dashText.includes('Nepodařilo se načíst');
  const hasKPI = dashText.includes('CELKEM LEADŮ') || dashText.includes('Celkem leadů') ||
                 dashText.includes('HOVORY DNES') || dashText.includes('Hovory dnes');
  const hasPipeline = dashText.includes('Pipeline') || dashText.includes('Nový lead');
  const hasOperators = dashText.includes('Aktivita operátorů') || dashText.includes('Operátor');
  const dashBroken = hasBrokenDia(dashText);

  console.log(`[${!hasError ? '✓' : '✗'}] Bez error zprávy: ${hasError ? 'ERROR: ' + dashText.substring(dashText.indexOf('Nepodařilo'), dashText.indexOf('Nepodařilo') + 50) : 'OK'}`);
  console.log(`[${hasKPI ? '✓' : '✗'}] KPI dlaždice: ${hasKPI ? 'nalezeny' : 'CHYBÍ'}`);
  console.log(`[${hasPipeline ? '✓' : '✗'}] Pipeline sekce: ${hasPipeline ? 'nalezena' : 'CHYBÍ'}`);
  console.log(`[${hasOperators ? '✓' : '✗'}] Operátoři sekce: ${hasOperators ? 'nalezena' : 'CHYBÍ'}`);
  console.log(`[${!dashBroken ? '✓' : '✗'}] Diakritika: ${dashBroken ? 'ROZBITÉ' : 'OK'}`);

  const http500 = jsErrors.filter(e => e.includes('500')).length;
  console.log(`[${http500 === 0 ? '✓' : '✗'}] HTTP 500 chyby: ${http500}`);

  // ===== REPORT =====
  console.log('\n=== REPORT (/weblyx/report) ===');
  await page.goto(`${BASE}/weblyx/report`, { waitUntil: 'networkidle', timeout: 12000 }).catch(() => {});
  await page.waitForTimeout(2000);
  await page.screenshot({ path: `${OUT}/04-report.png` });

  const reportText = await page.locator('body').textContent().catch(() => '');
  const reportBroken = hasBrokenDia(reportText);
  const reportCorrect = reportText.includes('konzultací') || reportText.includes('hovorů') ||
                        reportText.includes('Dovoláno') || reportText.includes('Doporučení');

  console.log(`[${!reportBroken ? '✓' : '✗'}] Diakritika: ${reportBroken ? 'ROZBITÉ — ' + (reportText.match(/\\u[0-9a-fA-F]{4}/g) || []).slice(0, 3).join(', ') : 'OK'}`);
  console.log(`[${reportCorrect ? '✓' : '?'}] Správná čeština: ${reportCorrect ? 'OK' : 'nenalezena (možná prázdná data)'}`);

  // ===== ODHLÁSIT → RE-LOGIN → LANDING =====
  console.log('\n=== ODHLÁSIT → RE-LOGIN → LANDING ===');
  // Klikni na ZA avatar
  await page.goto(`${BASE}/weblyx/dashboard`, { waitUntil: 'domcontentloaded', timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(1000);

  // Hledej avatar tlačítko
  const avatar = page.locator('button:has-text("ZA"), [class*="avatar"], [aria-label*="menu"], [aria-label*="user"]').first();
  if (await avatar.count() > 0) {
    await avatar.click();
    await page.waitForTimeout(800);
    await page.screenshot({ path: `${OUT}/05-menu-open.png` });
    const logoutBtn = page.locator(':text("Odhlásit se"), :text("Odhlásit"), :text("Logout")').first();
    if (await logoutBtn.count() > 0) {
      await logoutBtn.click();
    } else {
      // Zkus přes action endpoint
      await page.goto(`${BASE}/auth/signout`, { timeout: 5000 }).catch(() => {});
    }
  } else {
    // Manuálně přejdi na login (simulace odhlášení)
    await page.evaluate(() => {
      // Smaž Supabase session z localStorage
      const keys = Object.keys(localStorage).filter(k => k.includes('supabase') || k.includes('auth'));
      keys.forEach(k => localStorage.removeItem(k));
    });
    await page.goto(`${BASE}/login`, { waitUntil: 'networkidle', timeout: 10000 }).catch(() => {});
  }

  await page.waitForURL(u => u.href.includes('login'), { timeout: 8000 }).catch(() => {});
  const afterLogoutUrl = page.url();
  console.log(`Po odhlášení URL: ${afterLogoutUrl}`);
  await page.screenshot({ path: `${OUT}/06-after-logout.png` });

  // Re-login
  if (afterLogoutUrl.includes('login')) {
    await page.waitForSelector('input[type="email"]', { timeout: 5000 }).catch(() => {});
    await page.locator('input[type="email"]').fill(EMAIL);
    await page.locator('input[type="password"]').fill(PASS);
    await page.locator('button[type="submit"]').click();
    await page.waitForURL(u => !u.href.includes('login'), { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(3000);
  }

  const reLoginUrl = page.url();
  const reLoginOk = reLoginUrl.includes('/dashboard');
  console.log(`Re-login landing URL: ${reLoginUrl}`);
  console.log(`[${reLoginOk ? '✓' : '✗'}] Admin landuje na /dashboard po re-loginu: ${reLoginOk ? 'OK' : 'BUG — ' + reLoginUrl}`);
  await page.screenshot({ path: `${OUT}/07-relogin-landing.png` });

  // ===== SOUHRN =====
  console.log('\n=== SOUHRN ===');
  const results = [
    ['Admin landing po loginu na /dashboard', landingOk],
    ['Dashboard bez error zprávy', !hasError],
    ['Dashboard KPI dlaždice', hasKPI],
    ['Dashboard pipeline sekce', hasPipeline],
    ['Dashboard operátoři', hasOperators],
    ['Dashboard diakritika', !dashBroken],
    ['Dashboard bez HTTP 500', http500 === 0],
    ['Report diakritika opravena', !reportBroken],
    ['Admin landing po re-loginu na /dashboard', reLoginOk],
  ];

  results.forEach(([name, ok]) => console.log(`  [${ok ? '✓' : '✗'}] ${name}`));
  const passed = results.filter(([, ok]) => ok).length;
  console.log(`\nVýsledek: ${passed}/${results.length} testů prošlo`);

  await ctx.close();
})().catch(e => { console.error('CHYBA:', e.message); process.exit(1); });
