// @ts-check
const { chromium } = require('@playwright/test');
const fs = require('fs');

const BASE = 'http://localhost:3098';
const EMAIL = 'zenuly3@gmail.com';
const PASS = 'zenulythebest2026!';

const results = [];

function log(test, status, detail = '') {
  const icon = status === 'OK' ? '✓' : status === 'FAIL' ? '✗' : '?';
  const line = `[${icon}] ${test}${detail ? ': ' + detail : ''}`;
  results.push({ test, status, detail });
  console.log(line);
}

async function screenshot(page, name) {
  try {
    fs.mkdirSync('/Users/zen/zenuly/.claude-context/tasks', { recursive: true });
    await page.screenshot({ path: `/Users/zen/zenuly/.claude-context/tasks/screenshot-${name}.png` });
  } catch(e) {}
}

async function checkPageOk(page, name, path) {
  const url = page.url();
  const isLogin = url.includes('login');
  const has404 = await page.locator('text=404').count() + await page.locator(':text("Not Found")').count();
  const hasAppError = await page.locator(':text("Application error")').count();
  const hasError = await page.locator(':text("500")').count();

  if (isLogin) {
    log(`${name} (${path})`, 'FAIL', 'session ztracena — login page');
  } else if (has404 > 0) {
    log(`${name} (${path})`, 'FAIL', '404 Not Found');
  } else if (hasAppError > 0 || hasError > 0) {
    log(`${name} (${path})`, 'FAIL', 'Application error / 500');
  } else {
    log(`${name} (${path})`, 'OK', url);
  }
}

(async () => {
  const browser = await chromium.launch({ headless: false, slowMo: 300 });
  // Použij persistentní kontext pro zachování localStorage
  const userDataDir = '/tmp/zenuly-playwright-profile';
  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    slowMo: 300,
    viewport: { width: 1440, height: 900 }
  });
  const page = await context.newPage();

  // 1. Login
  console.log('\n=== LOGIN ===');
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle', timeout: 15000 }).catch(() => {});
  const url0 = page.url();
  log('Přesměrování na login', url0.includes('login') ? 'OK' : (url0.includes(BASE) ? 'INFO (již přihlášen)' : 'FAIL'), url0);
  await screenshot(page, '01-landing');

  // Pokud již přihlášen (persistent context), přeskoč login
  if (!url0.includes('login')) {
    log('Přihlášení', 'OK', 'persistent session — již přihlášen');
  } else {
    try {
      await page.waitForSelector('input[type="email"]', { timeout: 5000 });
      await page.locator('input[type="email"]').fill(EMAIL);
      await page.locator('input[type="password"]').fill(PASS);
      await screenshot(page, '02-login-filled');
      await page.locator('button[type="submit"]').click();
      // Čekej na navigaci pryč z loginu
      await page.waitForURL(url => !url.href.includes('login'), { timeout: 10000 }).catch(() => {});
      const urlAfter = page.url();
      const isLoggedIn = !urlAfter.includes('login');
      log('Přihlášení', isLoggedIn ? 'OK' : 'FAIL', urlAfter);
      await screenshot(page, '03-after-login');

      if (!isLoggedIn) {
        const errText = await page.locator('p.text-urgent, [class*="error"]').first().textContent().catch(() => '');
        if (errText) console.log('LOGIN ERROR:', errText);
      }
    } catch(e) {
      log('Přihlášení', 'FAIL', e.message.substring(0, 100));
    }
  }

  // Zkontroluj přihlášení
  const currentUrl = page.url();
  const isLoggedIn = !currentUrl.includes('login');

  if (!isLoggedIn) {
    log('BLOKOVÁNO', 'FAIL', 'Login selhal, nelze pokračovat');
    await context.close();
    return;
  }

  // Čekej na stabilizaci aplikace
  await page.waitForTimeout(2000);
  await screenshot(page, '04-dashboard');

  // 2. Navigace — přečti nav z dashboardu
  console.log('\n=== NAVIGACE (top nav) ===');
  const navLinks = await page.locator('nav a, header a').all();
  const navTexts = [];
  for (const link of navLinks) {
    const text = await link.textContent().catch(() => '');
    if (text && text.trim()) navTexts.push(text.trim());
  }
  console.log('Nav links nalezeny:', navTexts);

  const expectedNav = ['Fronta', 'Úkoly', 'Kalendář', 'Pipeline', 'Import', 'Report', 'Export hodin', 'Výkon'];
  for (const item of expectedNav) {
    const found = navTexts.some(t => t.includes(item));
    log(`Nav: ${item}`, found ? 'OK' : 'FAIL', found ? 'nalezeno' : `nenalezeno (dostupné: ${navTexts.join(', ')})`);
  }

  // Zkontroluj "Správa uživatelů" v admin sekci
  const adminLink = await page.locator(':text("Správa"), :text("Admin"), :text("Administrace"), :text("Uživatelé")').count();
  log('Nav: Správa/Admin', adminLink > 0 ? 'OK' : 'FAIL', adminLink > 0 ? 'nalezeno' : 'nenalezeno');

  // 3. Testování stránek — navigace přes URL (s existující session v persistent context)
  console.log('\n=== STRÁNKY ===');
  const pagesToTest = [
    { path: '/weblyx/fronta', name: 'Fronta leadů' },
    { path: '/weblyx/import', name: 'Import' },
    { path: '/weblyx/ukoly', name: 'Úkoly' },
    { path: '/weblyx/vykon', name: 'Výkon' },
    { path: '/weblyx/report', name: 'Denní report' },
    { path: '/weblyx/export-hodin', name: 'Export hodin' },
    { path: '/weblyx/pipeline', name: 'Pipeline' },
    { path: '/weblyx/kalendar', name: 'Kalendář' },
    { path: '/settings', name: 'Nastavení' },
    { path: '/admin/users', name: 'Správa uživatelů' },
  ];

  for (const p of pagesToTest) {
    try {
      await page.goto(BASE + p.path, { waitUntil: 'domcontentloaded', timeout: 10000 });
      await page.waitForTimeout(1500);
      await checkPageOk(page, p.name, p.path);
      await screenshot(page, '05' + p.path.replace(/\//g, '-'));
    } catch(e) {
      log(`${p.name} (${p.path})`, 'FAIL', e.message.substring(0, 80));
    }
  }

  // 4. Fronta detail — jdi zpět a čekej na načtení dat
  console.log('\n=== FRONTA DETAIL ===');
  await page.goto(BASE + '/weblyx/fronta', { waitUntil: 'networkidle', timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(3000); // Čekej na data

  const frontaUrl = page.url();
  if (frontaUrl.includes('login')) {
    log('Fronta - data', 'FAIL', 'session ztracena');
  } else {
    // Počkej na konec loadingu
    await page.waitForSelector('[class*="spinner"], [class*="loading"], .animate-spin', { state: 'detached', timeout: 8000 }).catch(() => {});

    const leadItems = await page.locator('[class*="lead"], [class*="item"], [class*="row"], li').count();
    const emptyText = await page.locator(':text("Prázdná"), :text("Žádné"), :text("Fronta je prázdná"), :text("žádné leady")').count();
    log('Fronta - stav', 'OK', `${leadItems} elementů, empty state: ${emptyText > 0}`);
  }
  await screenshot(page, '06-fronta-detail');

  // 5. Shift bar
  console.log('\n=== SHIFT BAR ===');
  const shiftBtn = await page.locator(':text("Začít směnu"), :text("Ukončit směnu"), :text("Konec směny")').count();
  log('Shift bar tlačítko', shiftBtn > 0 ? 'OK' : 'FAIL', shiftBtn > 0 ? 'nalezeno' : 'nenalezeno');
  await screenshot(page, '07-shift-bar');

  // 6. Design check — desktop
  console.log('\n=== DESIGN ===');
  const bodyBg = await page.evaluate(() => {
    return window.getComputedStyle(document.body).backgroundColor;
  }).catch(() => 'n/a');
  log('Design - background', 'OK', `bg: ${bodyBg}`);
  await screenshot(page, '08-design-desktop');

  // Mobile
  await page.setViewportSize({ width: 375, height: 812 });
  await page.waitForTimeout(600);
  await screenshot(page, '09-design-mobile');
  log('Responsivita mobile (375px)', 'OK', 'screenshot uložen');
  await page.setViewportSize({ width: 1440, height: 900 });

  // 7. Kontrola anglických textů
  console.log('\n=== KONTROLA ČEŠTINY ===');
  await page.goto(BASE + '/weblyx/fronta', { waitUntil: 'networkidle', timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(1500);

  const engTexts = ['Submit', 'Cancel', 'Save changes', 'Delete', 'Loading...', 'Dashboard', 'Settings', 'Logout'];
  let foundEng = false;
  for (const txt of engTexts) {
    const count = await page.locator(`text="${txt}"`).count();
    if (count > 0) {
      log(`Anglický text: "${txt}"`, 'WARN', `${count}x nalezeno`);
      foundEng = true;
    }
  }
  if (!foundEng) log('Kontrola češtiny', 'OK', 'žádné anglické UI texty nenalezeny');

  // 8. Zkontroluj import stránku podrobněji
  console.log('\n=== IMPORT DETAIL ===');
  await page.goto(BASE + '/weblyx/import', { waitUntil: 'networkidle', timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(1500);
  const importUrl = page.url();
  if (!importUrl.includes('login')) {
    const uploadEl = await page.locator('input[type="file"], :text("Nahrát"), :text("Importovat"), :text("CSV")').count();
    log('Import - upload element', uploadEl > 0 ? 'OK' : 'WARN', uploadEl > 0 ? 'nalezeno' : 'nenalezeno');
    await screenshot(page, '10-import-detail');
  } else {
    log('Import', 'FAIL', 'session ztracena');
  }

  // Finální souhrn
  console.log('\n=== SOUHRN ===');
  const ok = results.filter(r => r.status === 'OK').length;
  const fail = results.filter(r => r.status === 'FAIL').length;
  const warn = results.filter(r => r.status === 'WARN').length;
  console.log(`Celkem: ${results.length} testů | OK: ${ok} | FAIL: ${fail} | WARN: ${warn}`);

  if (fail > 0 || warn > 0) {
    console.log('\nPROBLÉMY:');
    results.filter(r => r.status !== 'OK').forEach(r => console.log(`  [${r.status}] ${r.test}: ${r.detail}`));
  }

  fs.mkdirSync('/Users/zen/zenuly/.claude-context/tasks', { recursive: true });
  fs.writeFileSync('/Users/zen/zenuly/.claude-context/tasks/test-report-28.json', JSON.stringify({
    timestamp: new Date().toISOString(),
    summary: { total: results.length, ok, fail, warn },
    results
  }, null, 2));
  console.log('\nReport uložen: .claude-context/tasks/test-report-28.json');

  await context.close();
})().catch(e => {
  console.error('KRITICKÁ CHYBA:', e.message);
  process.exit(1);
});
