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
    tagline: getComputedStyle(document.querySelector('.header__tagline')!).fontFamily,
  }));

  expect(families.reference).toBe(families.tagline);
  expect(families.reference).not.toMatch(/mono/i);
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
