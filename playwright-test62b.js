// @ts-check
// Task #62b — doplňkový test: kontakt detail + fronta + mobil
const { chromium } = require('@playwright/test');
const fs = require('fs');

const BASE = 'http://localhost:3098';
const EMAIL = 'zenuly3@gmail.com';
const PASS = 'zenulythebest2026!';
const OUT = '/Users/zen/zenuly/.claude-context/tasks/task-62';
fs.mkdirSync(OUT, { recursive: true });

(async () => {
  const browser = await chromium.launch({ headless: false, slowMo: 400 });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();

  const errs = [];
  page.on('console', m => { if (m.type() === 'error') errs.push(m.text().substring(0, 150)); });

  // Login (onboarding already completed from previous run)
  console.log('=== LOGIN ===');
  await page.goto(BASE + '/login', { waitUntil: 'networkidle', timeout: 20000 });
  await page.locator('input[type="email"]').fill(EMAIL);
  await page.locator('input[type="password"]').fill(PASS);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL(u => !u.href.includes('/login'), { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(2000);
  const slug = page.url().match(/localhost:\d+\/([^/]+)/)?.[1] ?? 'weblyx';
  console.log('slug:', slug);

  // ============================================================
  // KONTAKT DETAIL
  // ============================================================
  console.log('\n=== KONTAKT DETAIL ===');
  await page.goto(BASE + `/${slug}/kontakty`, { waitUntil: 'networkidle', timeout: 15000 });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: OUT + '/20-kontakty-list.png' });

  // Find first clickable card — try various selectors
  const cards = page.locator('a[href*="/kontakty/"], [data-lead-id], .cursor-pointer').first();
  const cardViaHref = page.locator('a[href*="/kontakty/"]').first();
  const hasHrefCard = await cardViaHref.isVisible().catch(() => false);
  console.log('Karty s href /kontakty/:', hasHrefCard);

  if (hasHrefCard) {
    const href = await cardViaHref.getAttribute('href').catch(() => '');
    console.log('Href první karty:', href);
    await cardViaHref.click();
    await page.waitForTimeout(3000);
    console.log('URL po kliknutí:', page.url());
    await page.screenshot({ path: OUT + '/21-kontakt-detail.png' });
  } else {
    // Try clicking any card-like element
    const anyCard = page.locator('[class*="rounded"][class*="border"][class*="cursor"]').first();
    const anyCardVisible = await anyCard.isVisible().catch(() => false);
    console.log('Karta s cursor-pointer:', anyCardVisible);
    if (anyCardVisible) {
      await anyCard.click();
      await page.waitForTimeout(3000);
      console.log('URL po kliknutí:', page.url());
      await page.screenshot({ path: OUT + '/21-kontakt-detail-alt.png' });
    } else {
      // Just click the first card by position
      const firstCard = page.locator('[class*="rounded-xl"], [class*="rounded-lg"]').filter({ hasText: /\+420/ }).first();
      const fc = await firstCard.isVisible().catch(() => false);
      console.log('Karta s +420:', fc);
      if (fc) {
        await firstCard.click();
        await page.waitForTimeout(3000);
        console.log('URL po kliknutí:', page.url());
        await page.screenshot({ path: OUT + '/21-kontakt-detail-click.png' });
      }
    }
  }

  const detailUrl = page.url();
  console.log('Výsledná URL:', detailUrl);
  const isDetailPage = detailUrl.match(/\/kontakty\/[^/]+/) || detailUrl.match(/\/lead\/[^/]+/);
  console.log('[' + (isDetailPage ? '✓' : '✗') + '] Kontakt detail URL obsahuje ID');

  const bodyText = await page.locator('body').textContent().catch(() => '');
  console.log('[' + (bodyText.includes('Trust') || bodyText.includes('trust') ? '✓' : '✗') + '] Trust score přítomen');
  console.log('[' + (bodyText.includes('hovor') || bodyText.includes('Historie') ? '✓' : '✗') + '] Historie hovorů');
  console.log('[' + (bodyText.includes('+420') ? '✓' : '✗') + '] Telefon přítomen');
  console.log('[' + (bodyText.includes('háček') || bodyText.includes('Háček') || bodyText.includes('Oslovení') || bodyText.includes('oslovení') || bodyText.includes('Otevření') ? '✓' : '✗') + '] Háček/Oslovení');

  // ============================================================
  // FRONTA
  // ============================================================
  console.log('\n=== FRONTA ===');
  await page.goto(BASE + `/${slug}/fronta`, { waitUntil: 'domcontentloaded', timeout: 20000 });
  await page.waitForTimeout(4000);
  console.log('URL:', page.url());
  await page.screenshot({ path: OUT + '/22-fronta.png' });

  const frontaText = await page.locator('body').textContent().catch(() => '');
  console.log('[' + (frontaText.includes('Fronta') || frontaText.includes('lead') || frontaText.includes('hovor') ? '✓' : '✗') + '] Fronta se načetla');

  // Try opening a lead
  const leadCard = page.locator('[class*="lead"], [class*="card"], [class*="border"]').filter({ hasText: /s\.r\.o\.|spol\.|a\.s\.|Nový lead/ }).first();
  const leadVisible = await leadCard.isVisible().catch(() => false);
  console.log('Lead karta nalezena:', leadVisible);
  if (leadVisible) {
    await leadCard.click();
    await page.waitForTimeout(2000);
    await page.screenshot({ path: OUT + '/23-fronta-lead.png' });
    const outcomeText = await page.locator('body').textContent().catch(() => '');
    console.log('[' + (outcomeText.includes('Nedovolal') || outcomeText.includes('Zájem') || outcomeText.includes('Nezájem') ? '✓' : '✗') + '] Outcome tlačítka přítomna');
  }

  // ============================================================
  // ADMIN NAV
  // ============================================================
  console.log('\n=== ADMIN NAV ===');
  await page.goto(BASE + `/${slug}/dashboard`, { waitUntil: 'networkidle', timeout: 15000 });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: OUT + '/24-admin-nav-desktop.png' });
  const navText = await page.locator('header, nav').textContent().catch(() => '');
  console.log('[' + (navText.includes('Dashboard') ? '✓' : '✗') + '] Nav: Dashboard');
  console.log('[' + (navText.includes('Pipeline') ? '✓' : '✗') + '] Nav: Pipeline');
  console.log('[' + (navText.includes('Kontakty') ? '✓' : '✗') + '] Nav: Kontakty');
  console.log('[' + (navText.includes('Administrace') ? '✓' : '✗') + '] Nav: Administrace');

  // ============================================================
  // MOBILE
  // ============================================================
  console.log('\n=== MOBILNÍ LAYOUT ===');
  await ctx.setViewportSize({ width: 390, height: 844 });

  await page.goto(BASE + `/${slug}/dashboard`, { waitUntil: 'networkidle', timeout: 15000 });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: OUT + '/25-mobile-dashboard.png' });
  const mobileOverflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 5);
  console.log('[' + (!mobileOverflow ? '✓' : '✗') + '] Mobile dashboard — žádný overflow');

  await page.goto(BASE + `/${slug}/kontakty`, { waitUntil: 'networkidle', timeout: 15000 });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: OUT + '/26-mobile-kontakty.png' });

  await page.goto(BASE + `/${slug}/fronta`, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await page.waitForTimeout(3000);
  await page.screenshot({ path: OUT + '/27-mobile-fronta.png' });
  const mobileOverflow2 = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 5);
  console.log('[' + (!mobileOverflow2 ? '✓' : '✗') + '] Mobile fronta — žádný overflow');

  console.log('\nErrors:', errs.length);
  errs.slice(0, 5).forEach(e => console.log(' -', e.substring(0, 100)));

  await browser.close();
  console.log('\nScreenshots uloženy v:', OUT);
})().catch(e => { console.error('CHYBA:', e.message); process.exit(1); });
