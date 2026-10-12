// @ts-check
const { chromium } = require('@playwright/test');
const fs = require('fs');

const BASE = 'http://localhost:3098';
const EMAIL = 'zenuly3@gmail.com';
const PASS = 'zenulythebest2026!';
const OUT = '/Users/zen/zenuly/.claude-context/tasks/final2';

fs.mkdirSync(OUT, { recursive: true });

const results = [];
function log(name, status, detail = '') {
  results.push({ name, status, detail });
  const icon = status === 'OK' ? '✓' : status === 'FAIL' ? '✗' : '!';
  console.log(`[${icon}] ${name}${detail ? ': ' + detail : ''}`);
}
function hasBrokenDia(text) {
  return /\\u[0-9a-fA-F]{4}/.test(text);
}

(async () => {
  require('child_process').execSync('open -a "Google Chrome" http://localhost:3098', { stdio: 'ignore' });

  const ctx = await chromium.launchPersistentContext('/tmp/zenuly-pw2', {
    headless: false, slowMo: 250, viewport: { width: 1440, height: 900 }
  });
  const page = await ctx.newPage();

  const jsErrors = [];
  page.on('console', m => { if (m.type() === 'error') jsErrors.push(m.text().substring(0, 100)); });
  page.on('pageerror', e => jsErrors.push('PAGE: ' + e.message.substring(0, 100)));

  // 1. LOGIN + LANDING PAGE
  console.log('\n=== 1. LOGIN + LANDING ===');
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle', timeout: 15000 }).catch(() => {});
  if (page.url().includes('login')) {
    await page.locator('input[type="email"]').fill(EMAIL);
    await page.locator('input[type="password"]').fill(PASS);
    await page.locator('button[type="submit"]').click();
    await page.waitForURL(u => !u.href.includes('login'), { timeout: 12000 }).catch(() => {});
  }
  await page.waitForTimeout(2000);
  const landingUrl = page.url();
  log('Login', !landingUrl.includes('login') ? 'OK' : 'FAIL', landingUrl);
  log('Admin landing na dashboard', landingUrl.includes('/dashboard') ? 'OK' : 'FAIL',
    landingUrl.includes('/dashboard') ? 'správně /weblyx/dashboard' : `landuje na: ${landingUrl}`);
  await page.screenshot({ path: `${OUT}/01-landing.png` });

  // 2. DASHBOARD — detailní kontrola
  console.log('\n=== 2. DASHBOARD ===');
  await page.goto(`${BASE}/weblyx/dashboard`, { waitUntil: 'networkidle', timeout: 12000 }).catch(() => {});
  await page.waitForTimeout(3000);
  const dashText = await page.locator('body').textContent().catch(() => '');
  await page.screenshot({ path: `${OUT}/02-dashboard.png` });

  log('Dashboard načtení', !page.url().includes('login') ? 'OK' : 'FAIL', page.url());
  log('Dashboard - KPI dlaždice',
    (dashText.includes('Hovory') || dashText.includes('Konzultace') || dashText.includes('Dovoláno')) ? 'OK' : 'FAIL',
    dashText.includes('Hovory') ? 'KPI nalezeny' : 'KPI chybí');
  log('Dashboard - pipeline/operátoři',
    (dashText.includes('Pipeline') || dashText.includes('Operátor') || dashText.includes('operátor')) ? 'OK' : 'WARN',
    dashText.includes('Pipeline') ? 'pipeline sekce nalezena' : 'pipeline/operátoři nenalezeni');
  log('Dashboard diakritika', !hasBrokenDia(dashText) ? 'OK' : 'FAIL',
    hasBrokenDia(dashText) ? 'ROZBITÉ \\uXXXX' : 'čisto');
  // Zkontroluj error hlášku
  if (dashText.includes('Nepodařilo se načíst')) {
    log('Dashboard data', 'FAIL', 'Chybová zpráva: Nepodařilo se načíst data dashboardu');
  } else {
    log('Dashboard data', 'OK', 'data se zobrazují');
  }

  // 3. KONTAKTY — detailní kontrola
  console.log('\n=== 3. KONTAKTY ===');
  await page.goto(`${BASE}/weblyx/kontakty`, { waitUntil: 'networkidle', timeout: 12000 }).catch(() => {});
  await page.waitForTimeout(2500);
  const kontText = await page.locator('body').textContent().catch(() => '');
  await page.screenshot({ path: `${OUT}/03-kontakty.png` });

  log('Kontakty načtení', !page.url().includes('login') ? 'OK' : 'FAIL', page.url());
  log('Kontakty - filtrování', (kontText.includes('fáze') || kontText.includes('Fáze') || kontText.includes('Všechny')) ? 'OK' : 'WARN',
    'filter dropdown');
  log('Kontakty - Trust score řazení', (kontText.includes('Trust') || kontText.includes('trust')) ? 'OK' : 'WARN',
    'sort dropdown');
  // SVG trust score kruh
  const svgCircles = await page.locator('svg circle').count();
  log('Kontakty - SVG trust score kruhy', svgCircles > 0 ? 'OK' : 'WARN',
    svgCircles > 0 ? `${svgCircles} SVG kruhů nalezeno` : 'žádné SVG kruhy (možná prázdná DB)');
  // Progress bar
  const progressBars = await page.locator('[role="progressbar"], progress, [class*="progress"]').count();
  log('Kontakty - progress bary', progressBars > 0 ? 'OK' : 'WARN',
    progressBars > 0 ? `${progressBars} progress barů` : 'žádné progress bary (možná prázdná DB)');
  log('Kontakty diakritika', !hasBrokenDia(kontText) ? 'OK' : 'FAIL',
    hasBrokenDia(kontText) ? 'ROZBITÉ' : 'čisto');

  // 4. FRONTA — leady nebo prázdný stav
  console.log('\n=== 4. FRONTA ===');
  await page.goto(`${BASE}/weblyx/fronta`, { waitUntil: 'networkidle', timeout: 12000 }).catch(() => {});
  await page.waitForTimeout(3000);
  const frontaText = await page.locator('body').textContent().catch(() => '');
  const spinning = await page.locator('.animate-spin').count();
  const shiftBtn = await page.locator(':text("Začít směnu"), :text("Ukončit")').count();
  await page.screenshot({ path: `${OUT}/04-fronta.png` });

  log('Fronta načtení', !page.url().includes('login') ? 'OK' : 'FAIL', page.url());
  log('Fronta - žádný spinning', spinning === 0 ? 'OK' : 'FAIL',
    spinning > 0 ? 'STÁLE SE TOČÍ' : 'loading dokončen');
  log('Fronta - shift bar', shiftBtn > 0 ? 'OK' : 'FAIL', shiftBtn > 0 ? 'nalezeno' : 'chybí');
  log('Fronta diakritika', !hasBrokenDia(frontaText) ? 'OK' : 'FAIL',
    hasBrokenDia(frontaText) ? 'ROZBITÉ' : 'čisto');

  // 5. REPORT — diakritika
  console.log('\n=== 5. REPORT ===');
  await page.goto(`${BASE}/weblyx/report`, { waitUntil: 'networkidle', timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(2000);
  const reportText = await page.locator('body').textContent().catch(() => '');
  await page.screenshot({ path: `${OUT}/05-report.png` });

  const reportBroken = hasBrokenDia(reportText);
  log('Report diakritika', !reportBroken ? 'OK' : 'FAIL',
    reportBroken ? 'STÁLE ROZBITÉ — příklady: ' + (reportText.match(/\\u[0-9a-fA-F]{4}/g) || []).slice(0, 3).join(', ')
                 : 'opraveno, diakritika OK');
  // Zkontroluj správné znaky
  const hasCorrectCzech = reportText.includes('konzultací') || reportText.includes('hovorů') ||
                           reportText.includes('Dovoláno') || reportText.includes('Doporučení');
  log('Report - správná čeština', hasCorrectCzech ? 'OK' : 'WARN',
    hasCorrectCzech ? 'české texty nalezeny' : 'české texty nenalezeny');

  // 6. SETTINGS — diakritika
  console.log('\n=== 6. SETTINGS ===');
  await page.goto(`${BASE}/settings`, { waitUntil: 'networkidle', timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(2000);
  const settText = await page.locator('body').textContent().catch(() => '');
  await page.screenshot({ path: `${OUT}/06-settings.png` });

  const settBroken = hasBrokenDia(settText);
  log('Settings diakritika', !settBroken ? 'OK' : 'FAIL',
    settBroken ? 'STÁLE ROZBITÉ' : 'opraveno');
  log('Settings - sekce kalendáře', settText.includes('kalendáře') || settText.includes('Propojení') ? 'OK' : 'WARN',
    settText.includes('kalendáře') ? 'text správně česky' : 'text nenalezen');

  // 7-13. OSTATNÍ STRÁNKY
  const otherPages = [
    { path: '/weblyx/pipeline', name: 'Pipeline', check: (t) => t.includes('Nový lead') || t.includes('Kontaktován') },
    { path: '/weblyx/ukoly', name: 'Úkoly', check: (t) => t.includes('úkol') || t.includes('Žádné') },
    { path: '/weblyx/import', name: 'Import', check: (t) => t.includes('CSV') || t.includes('soubor') },
    { path: '/weblyx/export-hodin', name: 'Export hodin', check: (t) => t.includes('CSV') || t.includes('hodin') },
    { path: '/weblyx/vykon', name: 'Výkon', check: (t) => t.includes('Hovory') || t.includes('HOVORY') },
    { path: '/weblyx/kalendar', name: 'Kalendář', check: (t) => t.includes('Kalendář') },
    { path: '/admin/users', name: 'Admin/users', check: (t) => t.includes('Jméno') || t.includes('Admin') },
  ];

  for (const p of otherPages) {
    console.log(`\n=== ${p.name} ===`);
    await page.goto(BASE + p.path, { waitUntil: 'domcontentloaded', timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(1500);
    const txt = await page.locator('body').textContent().catch(() => '');
    const broken = hasBrokenDia(txt);
    log(`${p.name} načtení`, !page.url().includes('login') ? 'OK' : 'FAIL', page.url());
    log(`${p.name} obsah`, p.check(txt) ? 'OK' : 'WARN', p.check(txt) ? 'OK' : 'obsah nenalezen');
    log(`${p.name} diakritika`, !broken ? 'OK' : 'FAIL', broken ? 'ROZBITÉ' : 'čisto');
    await page.screenshot({ path: `${OUT}/page-${p.name.replace('/', '-')}.png` });
  }

  // NAVIGACE
  console.log('\n=== NAVIGACE ===');
  await page.goto(`${BASE}/weblyx/dashboard`, { waitUntil: 'domcontentloaded', timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(1000);
  const navLinks = await page.evaluate(() =>
    Array.from(document.querySelectorAll('nav a, header a')).map(l => l.textContent.trim()).filter(Boolean)
  );
  console.log('Nav:', navLinks);
  const expected = ['Dashboard','Fronta','Úkoly','Kalendář','Kontakty','Pipeline','Import','Report','Export hodin','Výkon','Administrace'];
  for (const item of expected) {
    log(`Nav: ${item}`, navLinks.some(t => t.includes(item)) ? 'OK' : 'FAIL',
      navLinks.some(t => t.includes(item)) ? '' : 'chybí');
  }
  await page.screenshot({ path: `${OUT}/nav.png` });

  // ONBOARDING
  console.log('\n=== ONBOARDING ===');
  await page.goto(`${BASE}/weblyx/dashboard`, { waitUntil: 'networkidle', timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(1500);
  const hasOnboarding = await page.locator('[class*="onboard"], [class*="walkthrough"], [class*="overlay"], [class*="highlight"]').count();
  const onboardingText = await page.locator('body').textContent().catch(() => '');
  const hasOnboardingText = onboardingText.includes('krok') || onboardingText.includes('Krok') ||
                             onboardingText.includes('průvodce') || onboardingText.includes('Další');
  log('Onboarding přítomen', (hasOnboarding > 0 || hasOnboardingText) ? 'OK' : 'WARN',
    hasOnboarding > 0 ? `${hasOnboarding} overlay elementů` : 'onboarding elementy nenalezeny');

  // SOUHRN
  console.log('\n=== SOUHRN ===');
  const ok = results.filter(r => r.status === 'OK').length;
  const fail = results.filter(r => r.status === 'FAIL').length;
  const warn = results.filter(r => r.status === 'WARN').length;
  console.log(`Celkem: ${results.length} | OK: ${ok} | FAIL: ${fail} | WARN: ${warn}`);

  results.filter(r => r.status === 'FAIL').forEach(r => console.log(`  [FAIL] ${r.name}: ${r.detail}`));
  results.filter(r => r.status === 'WARN').forEach(r => console.log(`  [WARN] ${r.name}: ${r.detail}`));

  const top10Errors = jsErrors.filter(e => !e.includes('Date.now')).slice(0, 5);
  if (top10Errors.length > 0) {
    console.log('\nKritické JS chyby:', top10Errors);
  }

  fs.writeFileSync(`${OUT}/report.json`, JSON.stringify({
    timestamp: new Date().toISOString(),
    summary: { ok, fail, warn },
    results,
    jsErrors: jsErrors.slice(0, 15)
  }, null, 2));
  console.log(`\nScreenshoty: ${OUT}/`);
  await ctx.close();
})().catch(e => { console.error('CHYBA:', e.message); process.exit(1); });
