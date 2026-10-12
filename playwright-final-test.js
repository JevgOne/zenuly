// @ts-check
// Finální Chrome test — všechny stránky CRM
const { chromium } = require('@playwright/test');
const fs = require('fs');

const BASE = 'http://localhost:3098';
const EMAIL = 'zenuly3@gmail.com';
const PASS = 'zenulythebest2026!';
const OUT = '/Users/zen/zenuly/.claude-context/tasks/final';

fs.mkdirSync(OUT, { recursive: true });

const results = [];

function log(name, status, detail = '') {
  results.push({ name, status, detail });
  const icon = status === 'OK' ? '✓' : status === 'FAIL' ? '✗' : '!';
  console.log(`[${icon}] ${name}${detail ? ': ' + detail : ''}`);
}

function checkDiakritikaInText(text) {
  // Hledej \uXXXX v textu — rozbité unicode
  const badPattern = /\\u[0-9a-fA-F]{4}/;
  return badPattern.test(text);
}

(async () => {
  // Otevři viditelně v Chrome pro uživatele
  require('child_process').execSync('open -a "Google Chrome" http://localhost:3098', { stdio: 'ignore' });

  const userDataDir = '/tmp/zenuly-playwright-profile';
  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    slowMo: 250,
    viewport: { width: 1440, height: 900 }
  });
  const page = await context.newPage();

  // Zachytávej JS errory
  const consoleErrors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') consoleErrors.push(msg.text().substring(0, 120));
  });
  page.on('pageerror', err => consoleErrors.push('PAGE ERROR: ' + err.message.substring(0, 120)));

  // ===== 1. LOGIN =====
  console.log('\n=== 1. LOGIN ===');
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle', timeout: 15000 }).catch(() => {});

  if (page.url().includes('login')) {
    await page.locator('input[type="email"]').fill(EMAIL);
    await page.locator('input[type="password"]').fill(PASS);
    await page.screenshot({ path: `${OUT}/01-login-filled.png` });
    await page.locator('button[type="submit"]').click();
    await page.waitForURL(url => !url.href.includes('login'), { timeout: 10000 }).catch(() => {});
  }

  const loginUrl = page.url();
  const loginOk = !loginUrl.includes('login');
  log('Login', loginOk ? 'OK' : 'FAIL', loginUrl);
  await page.screenshot({ path: `${OUT}/01-after-login.png` });

  if (!loginOk) {
    log('BLOKOVÁNO', 'FAIL', 'Login selhal');
    await context.close();
    return;
  }

  await page.waitForTimeout(1500);

  // ===== 2. DASHBOARD =====
  console.log('\n=== 2. DASHBOARD ===');
  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded', timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(2000);
  const dashUrl = page.url();
  const dashText = await page.locator('body').textContent().catch(() => '');
  const hasDashKpi = dashText.includes('KPI') || dashText.includes('pipeline') || dashText.includes('Pipeline') ||
                     dashText.includes('Operátor') || dashText.includes('Dashboard') ||
                     await page.locator('h1, h2').count() > 0;
  const dashBrokenDia = checkDiakritikaInText(dashText);
  await page.screenshot({ path: `${OUT}/02-dashboard.png` });
  log('Dashboard URL', !dashUrl.includes('login') ? 'OK' : 'FAIL', dashUrl);
  log('Dashboard obsah', hasDashKpi ? 'OK' : 'WARN', hasDashKpi ? 'KPI/obsah nalezen' : 'prázdná stránka nebo redirect na frontu');
  log('Dashboard diakritika', !dashBrokenDia ? 'OK' : 'FAIL', dashBrokenDia ? 'NALEZENY \\uXXXX' : 'čisto');

  // ===== 3. KONTAKTY =====
  console.log('\n=== 3. KONTAKTY ===');
  await page.goto(`${BASE}/weblyx/kontakty`, { waitUntil: 'domcontentloaded', timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(2500);
  const kontaktyUrl = page.url();
  const kontaktyText = await page.locator('body').textContent().catch(() => '');
  const kontaktyBrokenDia = checkDiakritikaInText(kontaktyText);
  const has404k = kontaktyText.includes('404') || kontaktyText.includes('Not Found');
  const hasKontaktyContent = kontaktyText.includes('Kontakt') || kontaktyText.includes('trust') ||
                              await page.locator('svg circle, [class*="trust"], [class*="score"], table, [class*="card"]').count() > 0;
  await page.screenshot({ path: `${OUT}/03-kontakty.png` });
  log('Kontakty URL', !kontaktyUrl.includes('login') && !has404k ? 'OK' : 'FAIL', kontaktyUrl);
  log('Kontakty obsah', hasKontaktyContent ? 'OK' : 'WARN', hasKontaktyContent ? 'karty/tabulka nalezena' : 'prázdná nebo chybí obsah');
  log('Kontakty diakritika', !kontaktyBrokenDia ? 'OK' : 'FAIL', kontaktyBrokenDia ? 'NALEZENY \\uXXXX' : 'čisto');

  // ===== 4. FRONTA =====
  console.log('\n=== 4. FRONTA ===');
  await page.goto(`${BASE}/weblyx/fronta`, { waitUntil: 'networkidle', timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(4000); // Čekej na data
  const frontaText = await page.locator('body').textContent().catch(() => '');
  const frontaSpinning = await page.locator('.animate-spin, [class*="spinner"], [class*="loading"]').count();
  const frontaHasLeads = await page.locator('[class*="lead"], [class*="item"]').count();
  const shiftBtn = await page.locator(':text("Začít směnu"), :text("Ukončit směnu")').count();
  const frontaBrokenDia = checkDiakritikaInText(frontaText);
  await page.screenshot({ path: `${OUT}/04-fronta.png` });
  log('Fronta URL', !page.url().includes('login') ? 'OK' : 'FAIL', page.url());
  log('Fronta - data', frontaHasLeads > 0 ? 'OK' : (frontaSpinning > 0 ? 'FAIL' : 'WARN'),
    frontaSpinning > 0 ? 'STÁLE SE NAČÍTÁ (spinning)' : `${frontaHasLeads} lead elementů`);
  log('Fronta - shift bar', shiftBtn > 0 ? 'OK' : 'FAIL', shiftBtn > 0 ? 'nalezeno' : 'chybí');
  log('Fronta diakritika', !frontaBrokenDia ? 'OK' : 'FAIL', frontaBrokenDia ? 'NALEZENY \\uXXXX' : 'čisto');

  // ===== 5. REPORT =====
  console.log('\n=== 5. REPORT ===');
  await page.goto(`${BASE}/weblyx/report`, { waitUntil: 'networkidle', timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(2000);
  const reportText = await page.locator('body').textContent().catch(() => '');
  const reportBrokenDia = checkDiakritikaInText(reportText);
  // Zkontroluj konkrétní texty co byly rozbité
  const reportHasCorrectText = reportText.includes('konzultací') || reportText.includes('hovorů') ||
                                reportText.includes('Dovoláno') || reportText.includes('Doporučení');
  await page.screenshot({ path: `${OUT}/05-report.png` });
  log('Report URL', !page.url().includes('login') ? 'OK' : 'FAIL', page.url());
  log('Report diakritika', !reportBrokenDia ? 'OK' : 'FAIL',
    reportBrokenDia ? 'STÁLE ROZBITÉ \\uXXXX' : 'diakritika opravena');
  if (reportBrokenDia) {
    // Najdi příklady
    const matches = reportText.match(/\\u[0-9a-fA-F]{4}/g) || [];
    console.log('  Příklady rozbité diakritiky:', matches.slice(0, 5).join(', '));
  }

  // ===== 6. SETTINGS =====
  console.log('\n=== 6. SETTINGS ===');
  await page.goto(`${BASE}/settings`, { waitUntil: 'networkidle', timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(2000);
  const settingsText = await page.locator('body').textContent().catch(() => '');
  const settingsBrokenDia = checkDiakritikaInText(settingsText);
  const settingsHasKalendar = settingsText.includes('Propojení') || settingsText.includes('kalendáře') ||
                               settingsText.includes('Propojen');
  await page.screenshot({ path: `${OUT}/06-settings.png` });
  log('Settings URL', !page.url().includes('login') ? 'OK' : 'FAIL', page.url());
  log('Settings diakritika', !settingsBrokenDia ? 'OK' : 'FAIL',
    settingsBrokenDia ? 'STÁLE ROZBITÉ v sekci kalendáře' : 'diakritika opravena');
  log('Settings - sekce kalendáře', settingsHasKalendar ? 'OK' : 'WARN',
    settingsHasKalendar ? 'text o kalendáři přítomen' : 'sekce chybí nebo nenalezena');

  // ===== 7. PIPELINE =====
  console.log('\n=== 7. PIPELINE ===');
  await page.goto(`${BASE}/weblyx/pipeline`, { waitUntil: 'networkidle', timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(1500);
  const pipelineText = await page.locator('body').textContent().catch(() => '');
  const pipelineBrokenDia = checkDiakritikaInText(pipelineText);
  const hasStages = pipelineText.includes('Nový lead') || pipelineText.includes('Kontaktován');
  const stageCount = await page.locator('[class*="stage"], [class*="card"], [class*="row"]').count();
  await page.screenshot({ path: `${OUT}/07-pipeline.png` });
  log('Pipeline URL', !page.url().includes('login') ? 'OK' : 'FAIL', page.url());
  log('Pipeline obsah', hasStages ? 'OK' : 'WARN', hasStages ? 'stages nalezeny' : 'stages nenalezeny');
  log('Pipeline diakritika', !pipelineBrokenDia ? 'OK' : 'FAIL', pipelineBrokenDia ? 'NALEZENY \\uXXXX' : 'čisto');

  // ===== 8. ÚKOLY =====
  console.log('\n=== 8. ÚKOLY ===');
  await page.goto(`${BASE}/weblyx/ukoly`, { waitUntil: 'networkidle', timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(1500);
  const ukolyText = await page.locator('body').textContent().catch(() => '');
  const ukolyBrokenDia = checkDiakritikaInText(ukolyText);
  await page.screenshot({ path: `${OUT}/08-ukoly.png` });
  log('Úkoly URL', !page.url().includes('login') ? 'OK' : 'FAIL', page.url());
  log('Úkoly diakritika', !ukolyBrokenDia ? 'OK' : 'FAIL', ukolyBrokenDia ? 'NALEZENY \\uXXXX' : 'čisto');

  // ===== 9. IMPORT =====
  console.log('\n=== 9. IMPORT ===');
  await page.goto(`${BASE}/weblyx/import`, { waitUntil: 'networkidle', timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(1500);
  const importText = await page.locator('body').textContent().catch(() => '');
  const importBrokenDia = checkDiakritikaInText(importText);
  const hasUpload = await page.locator('input[type="file"], :text("Přetáhněte"), :text("CSV")').count();
  await page.screenshot({ path: `${OUT}/09-import.png` });
  log('Import URL', !page.url().includes('login') ? 'OK' : 'FAIL', page.url());
  log('Import obsah', hasUpload > 0 ? 'OK' : 'WARN', hasUpload > 0 ? 'upload element nalezen' : 'chybí');
  log('Import diakritika', !importBrokenDia ? 'OK' : 'FAIL', importBrokenDia ? 'NALEZENY \\uXXXX' : 'čisto');

  // ===== 10. EXPORT HODIN =====
  console.log('\n=== 10. EXPORT HODIN ===');
  await page.goto(`${BASE}/weblyx/export-hodin`, { waitUntil: 'networkidle', timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(1500);
  const exportText = await page.locator('body').textContent().catch(() => '');
  const exportBrokenDia = checkDiakritikaInText(exportText);
  const hasCsvBtn = await page.locator(':text("Stáhnout CSV"), :text("CSV")').count();
  await page.screenshot({ path: `${OUT}/10-export-hodin.png` });
  log('Export hodin URL', !page.url().includes('login') ? 'OK' : 'FAIL', page.url());
  log('Export hodin - CSV', hasCsvBtn > 0 ? 'OK' : 'WARN', hasCsvBtn > 0 ? 'tlačítko nalezeno' : 'chybí');
  log('Export hodin diakritika', !exportBrokenDia ? 'OK' : 'FAIL', exportBrokenDia ? 'NALEZENY \\uXXXX' : 'čisto');

  // ===== 11. VÝKON =====
  console.log('\n=== 11. VÝKON ===');
  await page.goto(`${BASE}/weblyx/vykon`, { waitUntil: 'networkidle', timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(1500);
  const vykonText = await page.locator('body').textContent().catch(() => '');
  const vykonBrokenDia = checkDiakritikaInText(vykonText);
  await page.screenshot({ path: `${OUT}/11-vykon.png` });
  log('Výkon URL', !page.url().includes('login') ? 'OK' : 'FAIL', page.url());
  log('Výkon diakritika', !vykonBrokenDia ? 'OK' : 'FAIL', vykonBrokenDia ? 'NALEZENY \\uXXXX' : 'čisto');

  // ===== 12. KALENDÁŘ =====
  console.log('\n=== 12. KALENDÁŘ ===');
  await page.goto(`${BASE}/weblyx/kalendar`, { waitUntil: 'networkidle', timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(1500);
  const kalendarText = await page.locator('body').textContent().catch(() => '');
  const kalendarBrokenDia = checkDiakritikaInText(kalendarText);
  await page.screenshot({ path: `${OUT}/12-kalendar.png` });
  log('Kalendář URL', !page.url().includes('login') ? 'OK' : 'FAIL', page.url());
  log('Kalendář diakritika', !kalendarBrokenDia ? 'OK' : 'FAIL', kalendarBrokenDia ? 'NALEZENY \\uXXXX' : 'čisto');

  // ===== 13. ADMINISTRACE =====
  console.log('\n=== 13. ADMINISTRACE ===');
  await page.goto(`${BASE}/admin/users`, { waitUntil: 'networkidle', timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(1500);
  const adminText = await page.locator('body').textContent().catch(() => '');
  const adminBrokenDia = checkDiakritikaInText(adminText);
  const hasUsers = adminText.includes('Admin') || adminText.includes('Uživatel') || adminText.includes('Jméno');
  await page.screenshot({ path: `${OUT}/13-admin-users.png` });
  log('Admin/users URL', !page.url().includes('login') ? 'OK' : 'FAIL', page.url());
  log('Admin/users obsah', hasUsers ? 'OK' : 'WARN', hasUsers ? 'tabulka uživatelů nalezena' : 'chybí');
  log('Admin/users diakritika', !adminBrokenDia ? 'OK' : 'FAIL', adminBrokenDia ? 'NALEZENY \\uXXXX' : 'čisto');

  // ===== 14. NAVIGACE =====
  console.log('\n=== 14. NAVIGACE ===');
  // Vrať se na dashboard pro kontrolu nav
  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded', timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(1500);
  const navTexts = await page.evaluate(() => {
    const links = document.querySelectorAll('nav a, header a, [role="navigation"] a');
    return Array.from(links).map(l => l.textContent.trim()).filter(t => t.length > 0);
  });
  console.log('Nav položky:', navTexts);

  const expectedNav = ['Dashboard', 'Fronta', 'Úkoly', 'Kalendář', 'Kontakty', 'Pipeline',
                        'Import', 'Report', 'Export hodin', 'Výkon', 'Administrace'];
  for (const item of expectedNav) {
    const found = navTexts.some(t => t.includes(item));
    log(`Nav: ${item}`, found ? 'OK' : 'FAIL', found ? 'nalezeno' : `chybí (dostupné: ${navTexts.slice(0, 5).join(', ')}...)`);
  }
  await page.screenshot({ path: `${OUT}/14-navigace.png` });

  // ===== CONSOLE ERRORS =====
  console.log('\n=== CONSOLE ERRORS ===');
  if (consoleErrors.length > 0) {
    console.log(`Nalezeno ${consoleErrors.length} JS chyb:`);
    consoleErrors.slice(0, 10).forEach(e => console.log(' -', e));
    log('JS konzole chyby', 'WARN', `${consoleErrors.length} chyb`);
  } else {
    log('JS konzole chyby', 'OK', 'žádné errory');
  }

  // ===== SOUHRN =====
  console.log('\n=== SOUHRN ===');
  const ok = results.filter(r => r.status === 'OK').length;
  const fail = results.filter(r => r.status === 'FAIL').length;
  const warn = results.filter(r => r.status === 'WARN').length;
  console.log(`Celkem: ${results.length} | OK: ${ok} | FAIL: ${fail} | WARN: ${warn}`);

  const failures = results.filter(r => r.status === 'FAIL');
  if (failures.length > 0) {
    console.log('\nPROBLÉMY:');
    failures.forEach(r => console.log(`  [FAIL] ${r.name}: ${r.detail}`));
  }
  const warns = results.filter(r => r.status === 'WARN');
  if (warns.length > 0) {
    console.log('\nVAROVÁNÍ:');
    warns.forEach(r => console.log(`  [WARN] ${r.name}: ${r.detail}`));
  }

  fs.writeFileSync(`${OUT}/final-report.json`, JSON.stringify({
    timestamp: new Date().toISOString(),
    summary: { total: results.length, ok, fail, warn },
    consoleErrors: consoleErrors.slice(0, 20),
    results
  }, null, 2));
  console.log(`\nScreenshoty a report: ${OUT}/`);

  await context.close();
})().catch(e => {
  console.error('KRITICKÁ CHYBA:', e.message);
  process.exit(1);
});
