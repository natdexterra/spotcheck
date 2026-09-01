import { expect, test } from '@playwright/test';
import { executeTool, installModelContext } from './helpers';

test.use({ viewport: { width: 1920, height: 1080 } });

const seed = async (page: import('@playwright/test').Page) => {
  await executeTool(page, 'report_conflict', {
    field_id: 'quantity',
    candidates: [
      { value: '800', source_refs: ['spec:s1.1', 'spec:s4.1'], note: 'stated twice in the specification' },
      { value: '750', source_refs: ['email:p2'], note: 'the email asks for 750' },
    ],
    note: 'The specification and the email disagree.',
  });
  await executeTool(page, 'report_missing', {
    field_id: 'general_tolerance',
    searched: ['spec:s3', 'drawing'],
    note: 'the spec keeps a template placeholder — "[e.g., +/- 0.010"]".',
  });
  await executeTool(page, 'propose_field', {
    field_id: 'material', value: '6061-T6 aluminum', source_refs: ['spec:s3.1'],
    rationale: 'The material callout names this alloy.',
  });
  await executeTool(page, 'propose_field', {
    field_id: 'delivery', value: 'Two weeks from PO', source_refs: ['spec:s2.6'],
    rationale: 'The delivery clause names the destination.',
  });
  await executeTool(page, 'propose_field', {
    field_id: 'surface_finish', value: 'Black powder coat', source_refs: ['spec:s3.4'],
    rationale: 'no coating thickness, no standard named',
  });
};

test('the header sets the package reference in the sans, not in the mono of values', async ({ page }) => {
  await page.goto('/');
  const families = await page.evaluate(() => ({
    reference: getComputedStyle(document.querySelector('.header__package')!).fontFamily,
    product: getComputedStyle(document.querySelector('.header__product')!).fontFamily,
    tagline: document.querySelector('.header__tagline'),
  }));

  expect(families.reference).toBe(families.product);
  expect(families.reference).not.toMatch(/mono/i);
  // The orienting sentence lives in the strip; the header is two labels.
  expect(families.tagline).toBeNull();
});

// The strip geometry: the orienting line, then the status line, and nothing
// else. Measured against its parts so a third line cannot slip in unnoticed.
const stripParts = (page: import('@playwright/test').Page) => page.evaluate(() => {
  const strip = document.querySelector('.status-strip')!;
  const intro = document.querySelector('.status-strip__intro')!;
  const line = document.querySelector('.status-strip__line')!;
  const style = getComputedStyle(strip);
  const introStyle = getComputedStyle(intro);
  const range = document.createRange();
  range.selectNodeContents(intro);
  return {
    strip: strip.getBoundingClientRect().height,
    intro: intro.getBoundingClientRect().height,
    line: line.getBoundingClientRect().height,
    introLines: range.getClientRects().length,
    leading: Number.parseFloat(introStyle.lineHeight),
    padding: Number.parseFloat(style.paddingTop) + Number.parseFloat(style.paddingBottom),
    gap: Number.parseFloat(style.rowGap),
    rule: Number.parseFloat(style.borderBottomWidth),
  };
});

for (const width of [1920, 1366]) {
  test(`${width}px opens on the orienting line above the status line`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    await expect(page.locator('.status-strip__intro')).toContainText('a customer’s RFQ package');

    const parts = await stripParts(page);
    // Two lines, never three: one leading for the sentence, one status line.
    expect(parts.introLines).toBe(1);
    expect(parts.intro).toBe(parts.leading);
    expect(parts.strip).toBe(parts.padding + parts.intro + parts.gap + parts.line + parts.rule);

    // The dot marks the status line, never the orienting one.
    expect(await page.locator('.status-strip__line .status-strip__dot').count()).toBe(1);
    expect(await page.locator('.status-strip__intro .status-strip__dot').count()).toBe(0);
  });
}

test('390px keeps the orienting line and puts the button full width under the text', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await page.goto('/');

  const intro = (await page.locator('.status-strip__intro').boundingBox())!;
  const summary = (await page.locator('.status-strip__summary').boundingBox())!;
  const play = (await page.getByRole('button', { name: 'Play sample session' }).boundingBox())!;
  const strip = (await page.locator('.status-strip').boundingBox())!;

  expect(summary.y).toBeGreaterThanOrEqual(intro.y + intro.height);
  expect(play.y).toBeGreaterThanOrEqual(summary.y + summary.height);
  expect(play.width).toBeCloseTo(strip.width - 56, 0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});

for (const width of [390, 320]) {
  test(`${width}px keeps the prompt chip on one line`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await installModelContext(page);
    await page.goto('/');

    const chip = page.locator('.status-strip__prompt code');
    const shape = await chip.evaluate(element => {
      const range = document.createRange();
      range.selectNodeContents(element);
      return {
        lines: range.getClientRects().length,
        height: element.getBoundingClientRect().height,
        leading: Number.parseFloat(getComputedStyle(element).lineHeight),
      };
    });
    expect(shape.lines).toBe(1);
    expect(shape.height).toBeLessThan(2 * shape.leading);

    // Too wide for the lane, the chip scrolls in its wrapper; the page never does.
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  });
}

test('the orienting line leaves with the first tool call', async ({ page }) => {
  await installModelContext(page);
  await page.goto('/');
  await expect(page.locator('.status-strip__intro')).toBeVisible();
  await seed(page);
  await expect(page.locator('.status-strip')).toContainText('Live');
  await expect(page.locator('.status-strip__intro')).toHaveCount(0);
});

test('the desktop page does not scroll and each pane scrolls on its own', async ({ page }) => {
  await installModelContext(page);
  await page.goto('/');
  await seed(page);
  await expect(page.locator('[data-field-id="quantity"]')).toContainText('Two sources disagree');

  const page_ = await page.evaluate(() => ({
    scrollHeight: document.scrollingElement!.scrollHeight,
    innerHeight: window.innerHeight,
  }));
  expect(page_.scrollHeight).toBe(page_.innerHeight);

  const fieldScroller = page.locator('.field-list');
  const field = await fieldScroller.evaluate(element => ({
    scrollHeight: element.scrollHeight, clientHeight: element.clientHeight,
  }));
  expect(field.scrollHeight).toBeGreaterThan(field.clientHeight);
});

test('a provenance click scrolls the source pane and leaves the field list where it was', async ({ page }) => {
  await installModelContext(page);
  await page.goto('/');
  await seed(page);

  const sourceScroller = page.locator('.source-pane__panel:not([hidden])');
  const link = page.locator('[data-field-id="delivery"]').getByRole('link', { name: 'spec §2.6' });
  await link.scrollIntoViewIfNeeded();
  const before = await page.evaluate(() => ({
    field: document.querySelector('.field-list')!.scrollTop,
    source: document.querySelector<HTMLElement>('.source-pane__panel:not([hidden])')!.scrollTop,
  }));

  // Click through the DOM: Playwright's own actionability scroll would move the
  // field list before the handler ever ran, which is the thing under test.
  await link.evaluate(element => (element as HTMLElement).click());
  await expect(sourceScroller).toHaveCount(1);
  await expect.poll(async () => sourceScroller.evaluate(element => element.scrollTop)).toBeGreaterThan(before.source);
  expect(await page.locator('.field-list').evaluate(element => element.scrollTop)).toBe(before.field);
});

test('the confirm footer sits at the bottom edge of the field pane', async ({ page }) => {
  await installModelContext(page);
  await page.goto('/');
  await seed(page);

  const pane = await page.locator('.field-pane').boundingBox();
  const footer = await page.locator('.confirm-footer').boundingBox();
  expect(pane).not.toBeNull();
  expect(footer).not.toBeNull();
  const paneBottom = pane!.y + pane!.height;
  const footerBottom = footer!.y + footer!.height;
  expect(Math.abs(paneBottom - footerBottom)).toBeLessThanOrEqual(2);
  expect(await page.locator('.confirm-footer').evaluate(element => getComputedStyle(element).position)).toBe('static');
});

test('the change log expands in place on desktop, not as a full-screen sheet', async ({ page }) => {
  await installModelContext(page);
  await page.goto('/');
  await seed(page);

  await page.getByRole('button', { name: /Show change log/ }).click();
  const sheet = page.locator('.change-log__sheet');
  await expect(sheet).toBeVisible();
  expect(await sheet.evaluate(element => getComputedStyle(element).position)).toBe('static');
  const box = await sheet.boundingBox();
  expect(box!.height).toBeLessThan(600);
  expect(await page.evaluate(() => document.scrollingElement!.scrollHeight === window.innerHeight)).toBe(true);
});

test('control heights: the sample button is compact, Confirm is large', async ({ page }) => {
  await installModelContext(page);
  await page.goto('/');

  // Waiting state (no agent activity yet): the sample button defaults to the
  // secondary/compact treatment — 30px.
  const sample = page.getByRole('button', { name: 'Play sample session' });
  await expect(sample).toBeVisible();
  expect(Math.round((await sample.boundingBox())!.height)).toBe(30);

  await seed(page);
  const confirm = page.getByRole('button', { name: 'Confirm quote request' });
  expect(Math.round((await confirm.boundingBox())!.height)).toBe(44);
});
