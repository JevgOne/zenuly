// @ts-check
// Task #61 — onboarding wizard browser test after fix
const { chromium } = require('@playwright/test');
const fs = require('fs');

const BASE = 'http://localhost:3098';
const EMAIL = 'zenuly3@gmail.com';
const PASS = 'zenulythebest2026!';
const OUT = '/Users/zen/zenuly/.claude-context/tasks/task-061';
fs.mkdirSync(OUT, { recursive: true });

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok, detail });
  console.log(`  [${ok ? '✓' : '✗'}] ${name}${detail ? ' — ' + detail : ''}`);
}

(async () => {
  const browser = await chromium.launch({ headless: false, slowMo: 500 });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();

  const errs = [];
  page.on('console', m => { if (m.type() === 'error') errs.push(m.text().substring(0, 120)); });

  // 1. Login
  console.log('\n=== 1. LOGIN ===');
  await page.goto(BASE + '/login', { waitUntil: 'networkidle', timeout: 20000 });
  await page.locator('input[type="email"]').fill(EMAIL);
  await page.locator('input[type="password"]').fill(PASS);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL(u => !u.href.includes('/login'), { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(2500);

  const afterLoginUrl = page.url();
  console.log('URL po loginu:', afterLoginUrl);
  const slug = afterLoginUrl.match(/localhost:\d+\/([^/]+)/)?.[1] ?? 'weblyx';
  console.log('Detected slug:', slug);
  await page.screenshot({ path: OUT + '/01-after-login.png' });

  // 2. Navigate to /fronta to trigger wizard
  console.log('\n=== 2. NAVIGATE TO FRONTA ===');
  await page.goto(BASE + `/${slug}/fronta`, { waitUntil: 'networkidle', timeout: 15000 });
  await page.waitForTimeout(2000);
  console.log('URL:', page.url());
  await page.screenshot({ path: OUT + '/02-fronta.png' });

  // Check wizard appears
  const wizardVisible = await page.locator('.fixed.inset-0.z-50').isVisible().catch(() => false);
  check('Wizard se zobrazil', wizardVisible);
  if (!wizardVisible) {
    console.log('Wizard se nezobrazil — konec testu');
    await browser.close();
    return;
  }

  // 3. Walk through all 8 steps
  console.log('\n=== 3. PRŮCHOD KROKY ===');

  const expectedSteps = [
    { title: 'Vítejte v Zenuly CRM', path: null, btn: 'Pojďme na to' },
    { title: 'Dashboard', path: `/${slug}/dashboard`, btn: 'Další' },
    { title: 'Kontakty', path: `/${slug}/kontakty`, btn: 'Další' },
    { title: 'Pipeline', path: `/${slug}/pipeline`, btn: 'Další' },
    { title: 'Fronta', path: `/${slug}/fronta`, btn: 'Další' },
    { title: 'Report', path: `/${slug}/report`, btn: 'Další' },
    { title: 'Nastavení', path: `/settings`, btn: 'Další' },
    { title: 'Jste připraveni!', path: null, btn: 'Začít pracovat' },
  ];

  for (let i = 0; i < expectedSteps.length; i++) {
    const expected = expectedSteps[i];
    await page.waitForTimeout(800);

    const isWizardPresent = await page.locator('.fixed.inset-0.z-50').isVisible().catch(() => false);
    if (!isWizardPresent) {
      check(`Krok ${i+1}/${expectedSteps.length} — ${expected.title}`, false, 'wizard zmizel předčasně');
      continue;
    }

    const title = await page.locator('.fixed.inset-0.z-50 h2').textContent().catch(() => '');
    const currentUrl = page.url();
    const counter = await page.locator('.fixed.inset-0.z-50 span').first().textContent().catch(() => '');

    console.log(`\nKrok ${i+1}/8: "${title.trim()}" | URL: ${currentUrl} | Counter: ${counter}`);

    // Check title
    const titleOk = title.trim().includes(expected.title);
    check(`Krok ${i+1} — nadpis "${expected.title}"`, titleOk, titleOk ? '' : `got: "${title.trim()}"`);

    // Check URL (only for page steps)
    if (expected.path !== null) {
      const urlOk = currentUrl.includes(expected.path) && !currentUrl.includes('/undefined/');
      check(`Krok ${i+1} — URL správná (${expected.path})`, urlOk, currentUrl);

      // Check no 404
      const is404 = await page.locator('text=This page could not be found').isVisible().catch(() => false);
      check(`Krok ${i+1} — není 404`, !is404);
    }

    await page.screenshot({ path: OUT + `/step${String(i+1).padStart(2,'0')}-${expected.title.replace(/[^a-zA-Z0-9]/g, '_').substring(0,20)}.png` });

    // Click next button
    const btn = page.locator(`button:has-text("${expected.btn}")`);
    const btnVisible = await btn.isVisible().catch(() => false);
    check(`Krok ${i+1} — tlačítko "${expected.btn}"`, btnVisible);
    if (btnVisible) {
      await btn.click();
      await page.waitForTimeout(1200);
    }
  }

  // 4. After wizard
  console.log('\n=== 4. PO DOKONČENÍ ===');
  await page.waitForTimeout(1500);
  const wizardGone = !(await page.locator('.fixed.inset-0.z-50').isVisible().catch(() => false));
  check('Wizard zmizel po "Začít pracovat"', wizardGone);
  console.log('URL po dokončení:', page.url());
  await page.screenshot({ path: OUT + '/final-after-wizard.png' });

  // 5. Refresh check
  console.log('\n=== 5. REFRESH TEST ===');
  await page.reload({ waitUntil: 'networkidle', timeout: 15000 });
  await page.waitForTimeout(2000);
  const wizardAfterRefresh = await page.locator('.fixed.inset-0.z-50').isVisible().catch(() => false);
  check('Wizard se nezobrazí po refreshi', !wizardAfterRefresh);
  await page.screenshot({ path: OUT + '/final-after-refresh.png' });

  // Summary
  console.log('\n=== SOUHRN ===');
  const passed = results.filter(r => r.ok).length;
  const total = results.length;
  results.forEach(r => console.log(`  [${r.ok ? '✓' : '✗'}] ${r.name}${r.detail ? ' — ' + r.detail : ''}`));
  console.log(`\nVýsledek: ${passed}/${total} ${passed === total ? '— VŠE OK' : '— ZBÝVAJÍ BUGY'}`);
  if (errs.length > 0) {
    console.log('Console errors:');
    errs.slice(0, 5).forEach(e => console.log('  -', e));
  }

  // Write report
  const reportLines = [
    `# Task #61 — Browser test: Onboarding wizard`,
    ``,
    `**Datum:** ${new Date().toISOString()}`,
    `**Slug:** ${slug}`,
    `**Výsledek: ${passed}/${total}**`,
    ``,
    `## Výsledky`,
    ...results.map(r => `- [${r.ok ? '✓' : '✗'}] ${r.name}${r.detail ? ' — ' + r.detail : ''}`),
    ``,
    `## Console errors`,
    errs.length === 0 ? '- Žádné' : errs.map(e => `- ${e}`).join('\n'),
    ``,
    `## Screenshots`,
    `Uloženy v: /Users/zen/zenuly/.claude-context/tasks/task-061/`,
  ];
  fs.writeFileSync('/Users/zen/zenuly/.claude-context/tasks/task-061-browser-test.md', reportLines.join('\n'));
  console.log('\nReport uložen: .claude-context/tasks/task-061-browser-test.md');

  await browser.close();
})().catch(e => { console.error('CHYBA:', e.message); process.exit(1); });
