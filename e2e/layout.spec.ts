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
    // Measure with the real face, not the fallback: the line fits 1366 by ~4%.
    await page.evaluate(() => document.fonts.ready);

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
  test(`${width}px keeps the prompt chip whole inside the lane`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await installModelContext(page);
    await page.goto('/');

    const chip = page.locator('.status-strip__summary code');
    const box = (await chip.boundingBox())!;
    const lane = (await page.locator('.status-strip__summary').boundingBox())!;

    // The prompt is quoted content, not a label: it breaks across lines rather
    // than run past the lane, and nothing is clipped or scrolled away.
    expect(box.x).toBeGreaterThanOrEqual(lane.x - 1);
    expect(box.x + box.width).toBeLessThanOrEqual(lane.x + lane.width + 1);
    expect(await chip.evaluate(element => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  });
}

test('the orienting line leaves with the first tool call', async ({ page }) => {
  await installModelContext(page);
  await page.goto('/');
  await expect(page.locator('.status-strip__intro')).toBeVisible();
  await seed(page);
  expect(await page.locator('.field-row__value').first().evaluate(element => getComputedStyle(element).fontSize)).toBe('16.464px');
  expect(await page.locator('.drawing-sheet__caption').evaluate(element => ({ size: getComputedStyle(element).fontSize, family: getComputedStyle(element).fontFamily }))).toEqual({ size: '14.976px', family: 'Geist, "Geist Fallback", system-ui' });
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

  await page.getByRole('button', { name: /entr(y|ies)$/ }).click();
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

test('control heights: the sample button stays compact when it is the primary (no-api)', async ({ page }) => {
  await page.goto('/');
  const sample = page.getByRole('button', { name: 'Play sample session' });
  await expect(sample).toHaveClass(/button--primary/);
  expect(Math.round((await sample.boundingBox())!.height)).toBe(30);
});

test('the md meta group keeps its size: blocker line, header reference, log sentence', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => document.fonts.ready);
  const md = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--text-md').trim());
  for (const sel of ['.confirm-footer__status', '.header__package', '.status-strip__intro', '.field-list__header p']) {
    const size = await page.locator(sel).first().evaluate((el, token) => {
      const probe = document.createElement('span'); probe.style.fontSize = token; el.appendChild(probe);
      const px = getComputedStyle(probe).fontSize; probe.remove(); return [getComputedStyle(el).fontSize, px];
    }, md);
    expect(size[0]).toBe(size[1]);
  }
});

test('a provenance link is sm mono in every context it appears in', async ({ page }) => {
  await installModelContext(page);
  await page.goto('/');
  await seed(page);
  await page.evaluate(() => document.fonts.ready);

  const sm = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--text-sm').trim());
  const expected = await page.evaluate(token => {
    const probe = document.createElement('span');
    probe.style.fontSize = token;
    document.body.append(probe);
    const size = getComputedStyle(probe).fontSize;
    probe.remove();
    return size;
  }, sm);

  // The row, the conflict card and the open editor's context line: one size.
  await page.locator('[data-field-id="material"]').getByRole('button', { name: 'Edit' }).click();
  const contexts = ['.field-row__sources', '.candidate-option__sources', '.inline-editor__context'];
  for (const parent of contexts) {
    const link = page.locator(`${parent} .inline-link--provenance`).first();
    await expect(link).toBeVisible();
    const style = await link.evaluate(element => {
      const computed = getComputedStyle(element);
      return { size: computed.fontSize, family: computed.fontFamily };
    });
    expect(style.size).toBe(expected);
    expect(style.family).toMatch(/mono/i);
  }
});

test('the document column stops at its measure and the tabs stand on its edge', async ({ page }) => {
  await installModelContext(page);
  await page.goto('/');
  await seed(page);

  const pane = (await page.locator('.source-pane').boundingBox())!;
  const open = '.source-pane__panel:not([hidden]) ';
  const column = (await page.locator(`${open}.document-text`).boundingBox())!;
  const tabs = (await page.locator('.source-pane__tabs').boundingBox())!;
  const region = (await page.locator(`${open}.document-region`).first().boundingBox())!;

  // The pane is far wider than the measure; the text does not follow it out.
  expect(pane.width).toBeGreaterThan(900);
  expect(column.width).toBeLessThanOrEqual(776);
  // The region box carries the highlight's 4px inset on each side, so the
  // text inside it still measures the 680 column.
  const inset = await page.locator(`${open}.document-region`).first()
    .evaluate(element => Number.parseFloat(getComputedStyle(element).paddingLeft));
  expect(inset).toBe(4);
  expect(region.width - 2 * inset).toBeLessThanOrEqual(680);
  // Tabs and text share one left edge and one right edge (exports 02, 07).
  expect(tabs.x).toBeCloseTo(column.x, 0);
  expect(tabs.width).toBeCloseTo(column.width, 0);
});

test('the Ask customer on-state is an icon and ink, never a pill', async ({ page }) => {
  await installModelContext(page);
  await page.goto('/');
  await seed(page);

  const row = page.locator('[data-field-id="surface_finish"]');
  const toggle = row.getByRole('button', { name: 'Ask customer' });
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');

  // Move the pointer off it and let the hover fill finish leaving: the pill
  // belongs to hover, not to the state.
  await page.mouse.move(0, 0);
  await expect
    .poll(() => toggle.evaluate(element => {
      const style = getComputedStyle(element);
      return `${style.backgroundColor} ${style.color}`;
    }))
    .toBe('rgba(0, 0, 0, 0) rgb(14, 17, 22)');
  expect(await toggle.evaluate(element => element.querySelectorAll('svg').length)).toBe(1);
  await expect(row).toContainText('Marked for the clarification email. This field still counts as open.');
});

test('a candidate is a raised card and Pick keeps the compact button height', async ({ page }) => {
  await installModelContext(page);
  await page.goto('/');
  await seed(page);

  const candidate = page.locator('[data-field-id="quantity"] .candidate-option').first();
  const card = await candidate.evaluate(element => {
    const style = getComputedStyle(element);
    return { background: style.backgroundColor, border: `${style.borderTopWidth} ${style.borderTopColor}` };
  });
  expect(card).toEqual({ background: 'rgb(255, 255, 255)', border: '1px rgb(227, 232, 238)' });

  const pick = candidate.getByRole('button', { name: 'Pick' });
  const box = (await pick.boundingBox())!;
  expect(Math.round(box.height)).toBe(30);
  // It sits beside the value, not stretched down the side of the card.
  expect(box.height).toBeLessThan((await candidate.boundingBox())!.height);
});

test('first load fits eleven one-line rows, and the line arrives with the agent', async ({ page }) => {
  await installModelContext(page);
  await page.goto('/');

  const rows = page.locator('.field-row');
  await expect(rows).toHaveCount(11);
  const heights = await rows.evaluateAll(list => list.map(row => Math.round(row.getBoundingClientRect().height)));
  expect(Math.max(...heights)).toBeLessThanOrEqual(48);
  // All eleven stand inside the pane: nothing is scrolled out of sight.
  const list = await page.locator('.field-list').evaluate(element => ({
    scrollHeight: element.scrollHeight, clientHeight: element.clientHeight,
  }));
  expect(list.scrollHeight).toBeLessThanOrEqual(list.clientHeight);

  await seed(page);
  const empty = page.locator('[data-field-id="drawing_number"]');
  await expect(empty).toContainText('The agent has proposed nothing here');
  await expect(empty.getByRole('button', { name: 'Enter value' })).toBeVisible();
});

test('the provenance highlight is inset from the text it marks', async ({ page }) => {
  await installModelContext(page);
  await page.goto('/');
  await seed(page);

  const region = page.locator('.source-pane__panel:not([hidden]) .document-region').first();
  const before = (await region.boundingBox())!;
  const text = await region.evaluate(element => {
    const range = document.createRange();
    range.selectNodeContents(element);
    return range.getBoundingClientRect().x;
  });
  // Export 02: the tint runs 4px past the text on each side, and it is always
  // reserved, so lighting a region up moves nothing.
  expect(text - before.x).toBeCloseTo(4, 0);

  await page.locator('[data-field-id="delivery"]').getByRole('link', { name: 'spec §2.6' }).click();
  await expect(page.locator('.document-region--highlighted')).toBeVisible();
  const after = (await region.boundingBox())!;
  expect(after.x).toBeCloseTo(before.x, 0);
});
