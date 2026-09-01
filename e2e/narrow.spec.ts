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
