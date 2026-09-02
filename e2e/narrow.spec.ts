import { expect, test } from '@playwright/test';
import { executeTool, installModelContext } from './helpers';

for (const width of [390, 820]) {
  test(`${width}px uses one column and a focus-restoring source sheet`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await installModelContext(page);
    await page.goto('/');
    await executeTool(page, 'propose_field', {
      field_id: 'material', value: '6061-T6', source_refs: ['spec:s3.1'], rationale: 'The specification names the alloy.',
    });

    await expect(page.locator('.workspace')).toHaveCSS('display', 'block');
    expect((await page.locator('.workspace').boundingBox())?.width).toBeLessThanOrEqual(Math.min(width, 680));
    const sourceLink = page.locator('[data-field-id="material"]').getByRole('link', { name: 'spec §3.1' });
    await sourceLink.click();
    const close = page.getByRole('button', { name: /Close/ });
    await expect(close).toBeVisible();
    expect((await close.boundingBox())?.height).toBeGreaterThanOrEqual(44);

    // S6/A9: the header keeps the count and the how-it-works line at every width.
    await expect(page.locator('.field-list__header')).toBeVisible();
    await expect(page.getByText('0 of 11 verified')).toBeVisible();
    await expect(page.getByText(/Your agent reads the documents/)).toBeVisible();

    // A1/S9: focus moves into the sheet and Tab cycles inside it.
    const inside = () => page.evaluate(() => {
      const sheet = document.querySelector('.source-pane--sheet');
      return sheet !== null && sheet.contains(document.activeElement);
    });
    expect(await inside()).toBe(true);
    for (let step = 0; step < 16; step += 1) {
      await page.keyboard.press('Tab');
      expect(await inside()).toBe(true);
    }
    for (let step = 0; step < 4; step += 1) {
      await page.keyboard.press('Shift+Tab');
      expect(await inside()).toBe(true);
    }
    await close.click();
    await expect(sourceLink).toBeFocused();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);

    // Every target reaches 44px: choice rows do it through their label, not
    // through a bigger box, so the row is measured instead of the input.
    const small = await page.evaluate(() => {
      const targets = [
        ...document.querySelectorAll<HTMLElement>(
          'button, a[href], input:not([type="radio"]):not([type="checkbox"]), textarea, label.choice',
        ),
      ];
      return targets
        .filter(element => element.getClientRects().length > 0)
        .map(element => ({
          name: (element.textContent || element.getAttribute('aria-label') || element.tagName).trim().slice(0, 40),
          height: Math.round(element.getBoundingClientRect().height),
        }))
        .filter(target => target.height < 44);
    });
    expect(small).toEqual([]);
  });
}

for (const width of [1024, 1366]) {
  test(`${width}px keeps the two-pane workspace`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    await expect(page.locator('.field-pane')).toBeVisible();
    await expect(page.locator('.source-pane')).toBeVisible();
    const columns = await page.locator('.workspace').evaluate(element => getComputedStyle(element).gridTemplateColumns.split(' '));
    expect(columns).toHaveLength(2);
    const margin = Number.parseFloat(await page.locator('.workspace').evaluate(element => getComputedStyle(element).paddingLeft));
    const fieldX = (await page.locator('.field-pane').boundingBox())?.x;
    expect(fieldX).toBeCloseTo(margin, 0);

    // S13: the document lane steps 48 to 32 below 1280.
    const gutter = await page.locator('.document-text').first()
      .evaluate(element => getComputedStyle(element).paddingLeft);
    expect(gutter).toBe(width < 1280 ? '32px' : '48px');
    expect(await page.locator('.source-pane__tabs')
      .evaluate(element => getComputedStyle(element).paddingLeft)).toBe(gutter);

    // Two lanes only: row content sits on the pane gutter, page margin + 24.
    const labelX = (await page.locator('.field-row__label').first().boundingBox())!.x;
    expect(Math.abs(labelX - (margin + 24))).toBeLessThanOrEqual(2);
    const titleX = (await page.getByRole('heading', { name: 'Quote request' }).boundingBox())!.x;
    expect(Math.abs(titleX - (margin + 24))).toBeLessThanOrEqual(2);
  });
}

test('390px shows the short no-api line, a full-width primary, and goes live on play', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await page.clock.install();
  await page.goto('/');

  const strip = page.locator('.status-strip');
  const line = page.locator('.status-strip__text');
  await expect(line).toHaveText('Live mode needs a WebMCP-capable desktop browser.');

  // The dot sits inline before the sentence, never alone on a line of its own.
  const dot = await page.locator('.status-strip__dot').boundingBox();
  const text = await line.boundingBox();
  expect(dot!.y + dot!.height / 2).toBeGreaterThanOrEqual(text!.y);
  expect(dot!.y + dot!.height / 2).toBeLessThanOrEqual(text!.y + text!.height);

  const play = page.getByRole('button', { name: 'Play sample session' });
  const playBox = await play.boundingBox();
  const stripBox = await strip.boundingBox();
  expect(playBox!.width).toBeCloseTo(stripBox!.width - 56, 0);

  await play.click();
  await page.clock.runFor(1_500);
  await expect(strip).toContainText('Live');
  await expect(page.getByRole('button', { name: 'Play sample session' })).toHaveCount(0);
});

for (const width of [390, 320]) {
  test(`${width}px stacks the change log bar on the gutter lane`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await installModelContext(page);
    await page.goto('/');
    await executeTool(page, 'propose_field', {
      field_id: 'material', value: '6061-T6', source_refs: ['spec:s3.1'], rationale: 'The specification names the alloy.',
    });

    const label = page.locator('.change-log__label');
    const sentence = page.locator('.change-log__entry').first();
    const button = page.getByRole('button', { name: /entr(y|ies)$/ });
    // The header's content sits on the same gutter lane the bar must match.
    const laneX = (await page.locator('.header__identity').boundingBox())!.x;

    const labelBox = (await label.boundingBox())!;
    const sentenceBox = (await sentence.boundingBox())!;
    const buttonBox = (await button.boundingBox())!;

    // Export 16 at 390: the name and the last entry share the first line, the
    // disclosure takes its own line under them, and both start on the lane.
    expect(buttonBox.height).toBeLessThanOrEqual(44);
    expect(Math.abs(labelBox.y - sentenceBox.y)).toBeLessThanOrEqual(4);
    expect(buttonBox.y).toBeGreaterThanOrEqual(sentenceBox.y + sentenceBox.height);
    expect(Math.abs(labelBox.x - laneX)).toBeLessThanOrEqual(1);
    // The label, not the pill, sits on the lane; the bar keeps 12px above the sentence.
    const buttonPad = Number.parseFloat(await button.evaluate(element => getComputedStyle(element).paddingLeft));
    expect(Math.abs(buttonBox.x + buttonPad - laneX)).toBeLessThanOrEqual(1);
    const barTop = (await page.locator('.change-log').boundingBox())!.y;
    expect(labelBox.y - barTop).toBeGreaterThanOrEqual(12);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  });
}

test('390px: the log sheet header holds the title, Close and the meta line', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await installModelContext(page);
  await page.goto('/');
  await executeTool(page, 'propose_field', {
    field_id: 'delivery',
    value: 'All units within two weeks of PO; FOB destination to the receiving dock, packing list with every pallet',
    source_refs: ['email:p5'],
  });
  await page.getByRole('button', { name: /entr(y|ies)$/ }).click();

  const header = page.locator('.change-log__header');
  await expect(header).toBeVisible();
  const title = (await header.locator('h2').boundingBox())!;
  const close = (await header.getByRole('button', { name: 'Close' }).boundingBox())!;
  const meta = (await page.locator('.change-log__meta').boundingBox())!;

  // Export 14: nothing is clipped off the top, the title and Close share the
  // first row, and the meta line sits under the title.
  expect(Math.round(Number.parseFloat(
    await header.evaluate(element => getComputedStyle(element).paddingTop),
  ))).toBe(16);
  expect(title.y).toBeGreaterThanOrEqual((await page.locator('.change-log__sheet').boundingBox())!.y + 15);
  expect(Math.abs((title.y + title.height / 2) - (close.y + close.height / 2))).toBeLessThanOrEqual(6);
  expect(meta.y).toBeGreaterThanOrEqual(title.y + title.height - 2);
  expect(meta.x).toBeCloseTo(title.x, 0);

  // A long entry keeps its time column: the sentence wraps beside the clock.
  const entry = page.locator('.change-log__entries .change-log__entry').first();
  const time = (await entry.locator('.change-log__time').boundingBox())!;
  const sentence = (await entry.locator('.change-log__sentence').boundingBox())!;
  expect(sentence.height).toBeGreaterThan(time.height);
  expect(sentence.x).toBeGreaterThan(time.x + time.width - 1);
});

test('820px puts the header, the strip and the log bar on the centred column', async ({ page }) => {
  await page.setViewportSize({ width: 820, height: 900 });
  await installModelContext(page);
  await page.goto('/');
  await executeTool(page, 'propose_field', {
    field_id: 'material', value: '6061-T6', source_refs: ['spec:s3.1'], rationale: 'The specification names the alloy.',
  });

  const left = async (selector: string) => (await page.locator(selector).boundingBox())!.x;
  const column = await left('.field-pane');
  // Export 04: on one column the lane is the column's own left edge, so the
  // chrome above and below it does not stand 42px further out.
  for (const selector of ['.header__identity', '.status-strip__summary', '.change-log__label']) {
    expect(Math.abs(await left(selector) - column)).toBeLessThanOrEqual(1);
  }
  expect(column).toBeGreaterThan(40);
});
