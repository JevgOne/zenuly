// @ts-check
// Task #62 — finální browser test: onboarding, kontakt detail, fronta, role, responzivita
const { chromium } = require('@playwright/test');
const fs = require('fs');

const BASE = 'http://localhost:3098';
const EMAIL = 'zenuly3@gmail.com';
const PASS = 'zenulythebest2026!';
const OUT = '/Users/zen/zenuly/.claude-context/tasks/task-62';
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
  page.on('console', m => { if (m.type() === 'error') errs.push(m.text().substring(0, 150)); });

  // ============================================================
  // 1. LOGIN + ONBOARDING
  // ============================================================
  console.log('\n=== 1. LOGIN + ONBOARDING ===');
  await page.goto(BASE + '/login', { waitUntil: 'networkidle', timeout: 20000 });
  await page.locator('input[type="email"]').fill(EMAIL);
  await page.locator('input[type="password"]').fill(PASS);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL(u => !u.href.includes('/login'), { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(2500);

  const afterLoginUrl = page.url();
  const slug = afterLoginUrl.match(/localhost:\d+\/([^/]+)/)?.[1] ?? 'weblyx';
  console.log('URL po loginu:', afterLoginUrl, '| slug:', slug);
  check('Admin landuje na /dashboard', afterLoginUrl.includes('/dashboard'));
  await page.screenshot({ path: OUT + '/01-after-login.png' });

  // Check wizard
  const wizardVisible = await page.locator('.fixed.inset-0.z-50').isVisible().catch(() => false);
  check('Onboarding wizard se zobrazil', wizardVisible);
  await page.screenshot({ path: OUT + '/02-wizard-welcome.png' });

  if (wizardVisible) {
    // Walk through all 8 steps
    const stepExpected = [
      { title: 'Vítejte v Zenuly CRM', expectedPath: null, btn: 'Pojďme na to' },
      { title: 'Dashboard', expectedPath: `/${slug}/dashboard`, btn: 'Další' },
      { title: 'Kontakty', expectedPath: `/${slug}/kontakty`, btn: 'Další' },
      { title: 'Pipeline', expectedPath: `/${slug}/pipeline`, btn: 'Další' },
      { title: 'Fronta', expectedPath: `/${slug}/fronta`, btn: 'Další' },
      { title: 'Report', expectedPath: `/${slug}/report`, btn: 'Další' },
      { title: 'Nastavení', expectedPath: null, btn: 'Další' }, // path=null per fix #63
      { title: 'Jste připraveni!', expectedPath: null, btn: 'Začít pracovat' },
    ];

    for (let i = 0; i < stepExpected.length; i++) {
      const exp = stepExpected[i];
      await page.waitForTimeout(900);

      const present = await page.locator('.fixed.inset-0.z-50').isVisible().catch(() => false);
      if (!present) {
        check(`Wizard krok ${i+1}/8 — ${exp.title}`, false, 'wizard zmizel předčasně');
        continue;
      }

      const title = await page.locator('.fixed.inset-0.z-50 h2').textContent().catch(() => '');
      const url = page.url();
      const counter = await page.locator('.fixed.inset-0.z-50 span').first().textContent().catch(() => '');

      console.log(`\n  Krok ${i+1}/8: "${title.trim()}" | ${counter} | URL: ${url}`);
      check(`Krok ${i+1}/8 — nadpis "${exp.title}"`, title.trim().includes(exp.title));

      if (exp.expectedPath !== null) {
        const urlOk = url.includes(exp.expectedPath) && !url.includes('/undefined/');
        check(`Krok ${i+1}/8 — URL (${exp.expectedPath})`, urlOk, url);
        const is404 = await page.locator('text=This page could not be found').isVisible().catch(() => false);
        check(`Krok ${i+1}/8 — není 404`, !is404);
      } else {
        // path=null — check URL doesn't have /undefined/
        const noUndef = !url.includes('/undefined/');
        check(`Krok ${i+1}/8 — žádné /undefined/ v URL`, noUndef, url);
      }

      await page.screenshot({ path: OUT + `/wizard-step${String(i+1).padStart(2,'0')}-${exp.title.replace(/[^a-zA-Z0-9]/g,'_').substring(0,15)}.png` });

      const btn = page.locator(`button:has-text("${exp.btn}")`);
      const btnOk = await btn.isVisible().catch(() => false);
      check(`Krok ${i+1}/8 — tlačítko "${exp.btn}"`, btnOk);
      if (btnOk) await btn.click();
    }

    await page.waitForTimeout(2000);
    const wizardGone = !(await page.locator('.fixed.inset-0.z-50').isVisible().catch(() => false));
    check('Wizard zmizel po "Začít pracovat"', wizardGone);
    await page.screenshot({ path: OUT + '/03-after-onboarding.png' });
  }

  // ============================================================
  // 2. KONTAKT DETAIL
  // ============================================================
  console.log('\n=== 2. KONTAKT DETAIL ===');
  await page.goto(BASE + `/${slug}/kontakty`, { waitUntil: 'networkidle', timeout: 15000 });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: OUT + '/04-kontakty.png' });

  const contactCards = page.locator('[class*="rounded"][class*="border"]').filter({ hasText: /\+420/ });
  const cardCount = await contactCards.count();
  check('Kontakty mají kontaktní karty', cardCount > 0, `${cardCount} karet`);

  if (cardCount > 0) {
    // Click first card
    await contactCards.first().click();
    await page.waitForTimeout(2500);
    const detailUrl = page.url();
    console.log('  URL po kliknutí na kartu:', detailUrl);
    check('Klik na kartu → detail URL (ne fronta)', detailUrl.includes('/kontakty/') || detailUrl.includes('/lead/'), detailUrl);
    await page.screenshot({ path: OUT + '/05-kontakt-detail.png' });

    // Check CRM card elements
    const bodyText = await page.locator('body').textContent().catch(() => '');
    const hasTrustScore = bodyText.includes('Trust') || bodyText.includes('trust') || await page.locator('[class*="circle"], [class*="score"], [class*="ring"]').count() > 0;
    const hasTimeline = bodyText.includes('hovor') || bodyText.includes('Hovory') || bodyText.includes('Historie') || bodyText.includes('timeline');
    const hasPhone = bodyText.includes('+420');
    const hasHook = bodyText.includes('háček') || bodyText.includes('Háček') || bodyText.includes('Oslovení') || bodyText.includes('oslovení');

    check('Kontakt detail — Trust score/kruh', hasTrustScore);
    check('Kontakt detail — Timeline/Historie hovorů', hasTimeline);
    check('Kontakt detail — Telefonní číslo', hasPhone);
    check('Kontakt detail — Háček/Oslovení', hasHook);
  }

  // ============================================================
  // 3. FRONTA — outcome tlačítka
  // ============================================================
  console.log('\n=== 3. FRONTA — OUTCOME TLAČÍTKA ===');
  await page.goto(BASE + `/${slug}/fronta`, { waitUntil: 'networkidle', timeout: 15000 });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: OUT + '/06-fronta.png' });

  const frontaText = await page.locator('body').textContent().catch(() => '');
  const hasFronta = frontaText.includes('lead') || frontaText.includes('Lead') || frontaText.includes('Fronta') || frontaText.includes('hovor');
  check('Fronta se načetla', hasFronta);

  // Try to open a lead to see outcome buttons
  const leadItem = page.locator('[class*="cursor-pointer"], [class*="lead-card"], button').filter({ hasText: /\+420|s\.r\.o\.|spol\.|a\.s\./ }).first();
  const hasLead = await leadItem.isVisible().catch(() => false);
  if (hasLead) {
    await leadItem.click();
    await page.waitForTimeout(1500);
    await page.screenshot({ path: OUT + '/07-fronta-lead-open.png' });

    // Check outcome buttons for overlapping numbers
    const outcomeSection = page.locator('[class*="outcome"], [class*="result"], [class*="Výsledek"]');
    const hasOutcomes = await outcomeSection.count() > 0;
    check('Outcome sekce přítomna', hasOutcomes);
  } else {
    check('Fronta má lead k otevření', false, 'žádný lead nenalezen');
  }

  // ============================================================
  // 4. ROLE — admin přístup
  // ============================================================
  console.log('\n=== 4. ROLE — ADMIN PŘÍSTUP ===');

  const adminPages = [
    { name: 'Dashboard', url: `/${slug}/dashboard` },
    { name: 'Kontakty', url: `/${slug}/kontakty` },
    { name: 'Pipeline', url: `/${slug}/pipeline` },
    { name: 'Report', url: `/${slug}/report` },
  ];

  for (const p of adminPages) {
    await page.goto(BASE + p.url, { waitUntil: 'networkidle', timeout: 12000 });
    await page.waitForTimeout(1000);
    const currentUrl = page.url();
    const redirectedToFronta = currentUrl.includes('/fronta') && !p.url.includes('/fronta');
    const is404 = await page.locator('text=This page could not be found').isVisible().catch(() => false);
    check(`Admin přístup na ${p.name}`, !redirectedToFronta && !is404, currentUrl);
  }
  await page.screenshot({ path: OUT + '/08-admin-report.png' });

  // Check bottom nav
  await page.goto(BASE + `/${slug}/dashboard`, { waitUntil: 'networkidle', timeout: 12000 });
  await page.waitForTimeout(1000);
  const navText = await page.locator('nav, [class*="nav"], [class*="bottom"]').textContent().catch(() => '');
  const hasAdminNav = navText.includes('Dashboard') || navText.includes('Pipeline') || navText.includes('Kontakty');
  check('Admin nav obsahuje admin položky', hasAdminNav);
  await page.screenshot({ path: OUT + '/09-admin-nav.png' });

  // ============================================================
  // 5. RESPONZIVITA
  // ============================================================
  console.log('\n=== 5. RESPONZIVITA ===');
  await ctx.setViewportSize({ width: 390, height: 844 });
  await page.goto(BASE + `/${slug}/dashboard`, { waitUntil: 'networkidle', timeout: 12000 });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: OUT + '/10-mobile-dashboard.png' });

  const mobileBody = await page.locator('body').textContent().catch(() => '');
  const mobileDashOk = mobileBody.includes('Dashboard') || mobileBody.includes('dashboard') || mobileBody.includes('leadů');
  check('Mobilní dashboard se načetl', mobileDashOk);

  await page.goto(BASE + `/${slug}/kontakty`, { waitUntil: 'networkidle', timeout: 12000 });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: OUT + '/11-mobile-kontakty.png' });

  // Check no horizontal overflow
  const hasOverflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  check('Mobilní layout — žádný horizontální overflow', !hasOverflow);

  await page.goto(BASE + `/${slug}/fronta`, { waitUntil: 'networkidle', timeout: 12000 });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: OUT + '/12-mobile-fronta.png' });

  // ============================================================
  // SOUHRN
  // ============================================================
  const passed = results.filter(r => r.ok).length;
  const total = results.length;

  console.log('\n=== SOUHRN ===');
  results.forEach(r => console.log(`  [${r.ok ? '✓' : '✗'}] ${r.name}${r.detail ? ' — ' + r.detail : ''}`));
  console.log(`\nVýsledek: ${passed}/${total} ${passed === total ? '— VŠE OK' : '— ZBÝVAJÍ BUGY'}`);

  if (errs.length > 0) {
    console.log('\nConsole errors:');
    [...new Set(errs)].slice(0, 8).forEach(e => console.log('  -', e.substring(0, 100)));
  }

  // Write report
  const reportContent = `# Task #62 — Finální browser test

**Datum:** 2026-10-12
**Tester:** test-chrome
**Výsledek: ${passed}/${total}**

## Výsledky

${results.map(r => `- [${r.ok ? '✓' : '✗'}] ${r.name}${r.detail ? ' — ' + r.detail : ''}`).join('\n')}

## Console errors

${errs.length === 0 ? '- Žádné' : [...new Set(errs)].map(e => `- ${e}`).join('\n')}

## Screenshots

Uloženy v: /Users/zen/zenuly/.claude-context/tasks/task-62/
`;
  fs.mkdirSync('/Users/zen/zenuly/.claude-context/tasks', { recursive: true });
  fs.writeFileSync('/Users/zen/zenuly/.claude-context/tasks/task-62-browser-test.md', reportContent);
  console.log('\nReport uložen.');

  await browser.close();
})().catch(e => { console.error('CHYBA:', e.message); process.exit(1); });
