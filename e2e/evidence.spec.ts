import { expect, test, type Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { executeTool, installModelContext } from './helpers';

/**
 * Human-speed evidence for the states the static screens cannot show: the
 * editor open on each kind of field, a checked choice control, the verified
 * header with and without company, the log bar collapsed and as a sheet, and
 * the one-column lane. Every shot is taken against the production build.
 */
const DIR = 'docs/qa/p3-1';

const shot = async (page: Page, name: string, selector?: string) => {
  await page.evaluate(() => document.fonts.ready);
  await mkdir(DIR, { recursive: true });
  const target = selector ? page.locator(selector) : page;
  await target.screenshot({ path: `${DIR}/${name}.png`, animations: 'disabled' });
};

const propose = (page: Page, field_id: string, value: string, source_refs: string[], rationale?: string) =>
  executeTool(page, 'propose_field', { field_id, value, source_refs, ...(rationale ? { rationale } : {}) });

const gaps = async (page: Page) => {
  for (const field_id of ['general_tolerance', 'drawing_number', 'drawing_revision', 'stock_thickness']) {
    await executeTool(page, 'report_missing', { field_id, searched: ['spec:s3', 'drawing'], note: 'Nothing is stated.' });
  }
};

test('the editor in each of its states, at the reference width and narrow', async ({ page }) => {
  await installModelContext(page);
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/');
  await propose(page, 'overall_dimensions', '20.000 × 14.500', ['drawing:width'], 'read from the drawing title block');
  await propose(page, 'material', '6061-T6', ['spec:s3.2'], 'The material callout names the alloy.');

  const dimensions = page.locator('[data-field-id="overall_dimensions"]');
  await dimensions.getByRole('button', { name: 'Add unit' }).click();
  await shot(page, 'editor-unit-1920', '[data-field-id="overall_dimensions"]');

  const material = page.locator('[data-field-id="material"]');
  await material.getByRole('button', { name: 'Edit' }).click();
  await shot(page, 'editor-proposed-1920', '[data-field-id="material"]');

  const delivery = page.locator('[data-field-id="delivery"]');
  await delivery.getByRole('button', { name: 'Enter value' }).click();
  await shot(page, 'editor-empty-1920', '[data-field-id="delivery"]');
  await delivery.getByRole('button', { name: 'Save' }).click();
  await shot(page, 'editor-validation-1920', '[data-field-id="delivery"]');

  // Tall enough that the sticky confirm footer stands below the open editor
  // instead of over it, so the shot shows the editor whole.
  await page.setViewportSize({ width: 390, height: 1400 });
  await shot(page, 'editor-unit-390', '[data-field-id="overall_dimensions"]');
});

test('the covers list with every box checked, wide and narrow', async ({ page }) => {
  await installModelContext(page);
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/');
  await gaps(page);
  await executeTool(page, 'draft_clarification', {
    subject: 'Four questions before we quote',
    body: 'Please confirm the four points below.',
    covers: ['general_tolerance', 'drawing_number', 'drawing_revision', 'stock_thickness'],
  });
  await expect(page.locator('.clarification__covers input:checked')).toHaveCount(4);
  await shot(page, 'covers-checked-1920', '.clarification');

  await page.setViewportSize({ width: 390, height: 900 });
  await page.locator('.field-pane__draft-entry').getByRole('button').click();
  await expect(page.locator('.clarification__covers input:checked')).toHaveCount(4);
  await shot(page, 'covers-checked-390', '.clarification__covers');
});

test('the verified header with other groups open and with nothing else left', async ({ page }) => {
  await installModelContext(page);
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/');
  const fields = [
    ['customer_rfq_ref', 'RFQ 26-0812'], ['part_name', 'Hanging KVM mount bracket'],
    ['quantity', '750'], ['material', '6061-T6'], ['stock_thickness', '0.125 in'],
    ['general_tolerance', '±0.010'], ['surface_finish', 'Black powder coat'],
    ['drawing_number', 'D-4471'], ['drawing_revision', 'Rev A'], ['delivery', 'Two weeks from PO'],
  ] as const;
  for (const [id, value] of fields) await propose(page, id, value, ['spec:s3.1'], 'From the specification.');
  await propose(page, 'overall_dimensions', '20.000 × 14.500', ['drawing:width'], 'From the drawing.');

  for (const [id] of fields.slice(0, 4)) {
    await page.locator(`[data-field-id="${id}"]`).getByRole('button', { name: 'Verify' }).click();
  }
  await shot(page, 'verified-header-more-1920', '.field-list__verified-summary');

  for (const [id] of fields.slice(4)) {
    await page.locator(`[data-field-id="${id}"]`).getByRole('button', { name: 'Verify' }).click();
  }
  const dimensions = page.locator('[data-field-id="overall_dimensions"]');
  await dimensions.getByRole('button', { name: 'Add unit' }).click();
  await dimensions.locator('.segmented__option', { hasText: 'in' }).click();
  await dimensions.getByRole('button', { name: 'Save' }).click();
  await expect(page.locator('.field-list__verified-count')).toHaveText('11 verified');
  await shot(page, 'verified-header-all-1920', '.field-list__verified-summary');
});

test('the log bar collapsed, the log sheet at 390, and a candidate card', async ({ page }) => {
  await installModelContext(page);
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/');
  await executeTool(page, 'report_conflict', {
    field_id: 'quantity',
    candidates: [
      { value: '800', source_refs: ['spec:s1.1', 'spec:s4.1'], note: 'stated twice in the specification' },
      { value: '750', source_refs: ['email:p2'], note: 'the email asks for 750' },
    ],
    note: 'The specification and the email disagree.',
  });
  await propose(page, 'delivery', 'All units within two weeks of PO; FOB destination to the receiving dock, with a packing list on every pallet', ['email:p5'], 'The delivery clause names the destination.');
  await shot(page, 'candidate-card-1920', '[data-field-id="quantity"] .conflict-panel');
  await shot(page, 'change-log-collapsed-1920', '.change-log');

  await page.setViewportSize({ width: 390, height: 900 });
  await page.getByRole('button', { name: /entr(y|ies)$/ }).click();
  await shot(page, 'change-log-sheet-390', '.change-log__sheet');
});

test('the one-column lane at 820', async ({ page }) => {
  await installModelContext(page);
  await page.setViewportSize({ width: 820, height: 1000 });
  await page.goto('/');
  await propose(page, 'material', '6061-T6', ['spec:s3.1'], 'The specification names the alloy.');
  await shot(page, 'lane-820');
});
