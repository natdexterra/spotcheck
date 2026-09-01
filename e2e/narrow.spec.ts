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
  });
}
