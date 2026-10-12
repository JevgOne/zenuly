// @ts-check
// Task #41b — onboarding wizard detailed walkthrough
const { chromium } = require('@playwright/test');
const fs = require('fs');

const BASE = 'http://localhost:3098';
const EMAIL = 'zenuly3@gmail.com';
const PASS = 'zenulythebest2026!';
const OUT = '/Users/zen/zenuly/.claude-context/tasks/test41b';
fs.mkdirSync(OUT, { recursive: true });

(async () => {
  const browser = await chromium.launch({ headless: false, slowMo: 600 });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();

  const errs = [];
  page.on('console', m => { if (m.type() === 'error') errs.push(m.text().substring(0, 120)); });

  // Login
  console.log('=== LOGIN ===');
  await page.goto(BASE + '/login', { waitUntil: 'networkidle', timeout: 20000 });
  await page.locator('input[type="email"]').fill(EMAIL);
  await page.locator('input[type="password"]').fill(PASS);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL(u => !u.href.includes('/login'), { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(2500);
  console.log('URL po loginu:', page.url());
  await page.screenshot({ path: OUT + '/01-after-login.png' });

  // Check wizard
  const wizardCard = page.locator('.fixed.inset-0.z-50');
  const wizardVisible = await wizardCard.isVisible().catch(() => false);
  console.log('Wizard visible:', wizardVisible);

  if (!wizardVisible) {
    console.log('Wizard se nezobrazil — konec testu');
    await page.screenshot({ path: OUT + '/02-no-wizard.png' });
    await browser.close();
    return;
  }

  // Read initial state
  const stepCounter = await page.locator('.fixed.inset-0.z-50 span').first().textContent().catch(() => '?');
  console.log('Step counter:', stepCounter);

  // Walk through each step manually, reading state carefully
  let stepNum = 0;
  while (true) {
    stepNum++;
    await page.waitForTimeout(700);

    const currentUrl = page.url();
    const isWizardPresent = await page.locator('.fixed.inset-0.z-50').isVisible().catch(() => false);

    if (!isWizardPresent) {
      console.log(`\nKrok ${stepNum}: Wizard zmizel (dokončen nebo navigace ho zrušila)`);
      await page.screenshot({ path: OUT + `/step${String(stepNum).padStart(2,'0')}-wizard-gone.png` });
      break;
    }

    // Read wizard content
    const wizardContent = await page.locator('.fixed.inset-0.z-50').textContent().catch(() => '');
    const counter = wizardContent.match(/(\d+ \/ \d+)/)?.[1] ?? '?';
    const title = await page.locator('.fixed.inset-0.z-50 h2').textContent().catch(() => '?');

    console.log(`\n--- Krok ${stepNum} ---`);
    console.log('Counter:', counter);
    console.log('Title:', title);
    console.log('URL:', currentUrl);

    // Check buttons
    const pojdmeBtn = await page.locator('button:has-text("Pojďme na to")').isVisible().catch(() => false);
    const dalsiBtn = await page.locator('button:has-text("Další")').isVisible().catch(() => false);
    const zacitBtn = await page.locator('button:has-text("Začít pracovat")').isVisible().catch(() => false);
    const zpetBtn = await page.locator('button:has-text("Zpět")').isVisible().catch(() => false);

    console.log('Buttons: pojdme=', pojdmeBtn, '| dalsi=', dalsiBtn, '| zacit=', zacitBtn, '| zpet=', zpetBtn);

    await page.screenshot({ path: OUT + `/step${String(stepNum).padStart(2,'0')}-${title.replace(/[^a-zA-Z0-9]/g, '_').substring(0,20)}.png` });

    // Click next button
    if (zacitBtn) {
      console.log('Clicking "Začít pracovat"');
      await page.locator('button:has-text("Začít pracovat")').click();
      await page.waitForTimeout(2000);
      break;
    } else if (pojdmeBtn) {
      console.log('Clicking "Pojďme na to"');
      await page.locator('button:has-text("Pojďme na to")').click();
    } else if (dalsiBtn) {
      console.log('Clicking "Další"');
      await page.locator('button:has-text("Další")').click();
    } else {
      console.log('Žádné tlačítko nalezeno — přerušuji');
      break;
    }

    if (stepNum > 15) {
      console.log('Max steps reached — breaking');
      break;
    }
  }

  // Post-wizard state
  console.log('\n=== PO DOKONČENÍ ===');
  await page.waitForTimeout(1500);
  const wizardAfter = await page.locator('.fixed.inset-0.z-50').isVisible().catch(() => false);
  console.log('Wizard stále viditelný:', wizardAfter ? 'ANO — BUG' : 'NE — OK');
  console.log('URL:', page.url());
  await page.screenshot({ path: OUT + '/final-after-wizard.png' });

  // Refresh check
  await page.reload({ waitUntil: 'networkidle', timeout: 15000 });
  await page.waitForTimeout(2000);
  const wizardAfterRefresh = await page.locator('.fixed.inset-0.z-50').isVisible().catch(() => false);
  console.log('Wizard po refreshi:', wizardAfterRefresh ? 'ANO — BUG' : 'NE — OK');
  await page.screenshot({ path: OUT + '/final-after-refresh.png' });

  console.log('\nErrors:', errs.length);
  errs.slice(0, 5).forEach(e => console.log(' -', e));

  await browser.close();
})().catch(e => { console.error('CHYBA:', e.message); process.exit(1); });
