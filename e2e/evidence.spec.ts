import { expect, test, type Page } from '@playwright/test';
import { executeTool, installModelContext, saveEvidence } from './helpers';

/**
 * Human-speed evidence for the states the static screens cannot show: the
 * editor open on each kind of field, a checked choice control, the verified
 * header with and without company, the log bar collapsed and as a sheet, and
 * the one-column lane. Every shot is taken against the production build.
 *
 * The shots are written into `docs/`, so they are opt-in: run `EVIDENCE=1 pnpm
 * e2e` to regenerate them, and a plain run leaves the folder untouched. This
 * folder is the record of a task that has already merged, so regenerate it only
 * when the change under review is that task's.
 */
const DIR = 'docs/qa/p3-1';

const shot = async (page: Page, name: string, selector?: string) => {
  await page.evaluate(() => document.fonts.ready);
  await saveEvidence(selector ? page.locator(selector) : page, `${DIR}/${name}.png`);
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

  // Export 08: the summary those eleven confirm into, with a gap between every
  // block and the actions on the canvas rather than in a card.
  await page.getByRole('button', { name: 'Confirm quote request' }).click();
  await expect(page.locator('.confirm-summary')).toBeVisible();
  await shot(page, 'confirm-summary-1920', '.confirm-summary');
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

test('the eleven rows at first load', async ({ page }) => {
  await installModelContext(page);
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/');
  await shot(page, 'first-load-rows-1920', '.field-list');
});

test('a settled row of every resolution kind', async ({ page }) => {
  await installModelContext(page);
  await page.setViewportSize({ width: 1920, height: 1400 });
  await page.goto('/');
  await propose(page, 'material', '6061-T6 aluminium', ['spec:s3.2'], 'The material callout names the alloy.');
  await propose(page, 'surface_finish', 'Black powder coat', ['spec:s3.4'], 'no coating thickness, no standard named');
  await propose(page, 'part_name', 'Hanging KVM mount bracket', ['spec:s1.1'], 'The title names the part.');
  await executeTool(page, 'report_conflict', {
    field_id: 'quantity',
    candidates: [
      { value: '800', source_refs: ['spec:s1.1', 'spec:s4.1'], note: 'stated twice in the specification' },
      { value: '750', source_refs: ['email:p2'], note: 'the email asks for 750' },
    ],
    note: 'The specification and the email disagree.',
  });
  await executeTool(page, 'report_missing', {
    field_id: 'general_tolerance', searched: ['spec:s3', 'drawing'], note: 'the spec keeps a placeholder.',
  });

  // Verified as proposed, edited, picked, not required: one row of each kind.
  await page.locator('[data-field-id="part_name"]').getByRole('button', { name: 'Verify' }).click();
  const material = page.locator('[data-field-id="material"]');
  await material.getByRole('button', { name: 'Edit' }).click();
  await material.locator('.inline-editor__input').fill('6061-T6, no substitution');
  await material.getByRole('button', { name: 'Save' }).click();
  await page.locator('[data-field-id="quantity"]').getByRole('button', { name: 'Pick' }).nth(1).click();
  const tolerance = page.locator('[data-field-id="general_tolerance"]');
  await tolerance.getByRole('button', { name: 'Mark not required' }).click();
  await tolerance.getByRole('radio', { name: 'Covered by our shop standard' }).click();
  await tolerance.locator('form').getByRole('button', { name: 'Mark not required' }).click();

  const summary_ = page.locator('.field-list__verified-summary');
  await summary_.locator('button').click();
  await expect(summary_.locator('button')).toHaveAttribute('aria-expanded', 'true');

  // Awaiting customer: the draft carries the last open field to the customer.
  await page.locator('[data-field-id="surface_finish"]').getByRole('button', { name: 'Ask customer' }).click();
  await executeTool(page, 'draft_clarification', {
    subject: 'One question before we quote',
    body: 'Please confirm the finish standard.',
    covers: ['surface_finish'],
  });
  await page.getByRole('button', { name: 'Send' }).click();

  await expect(page.locator('.field-list__group--verified .field-row')).toHaveCount(5);
  await shot(page, 'settled-rows-1920', '.field-list__group--verified');
});

test('the one-column lane at 820', async ({ page }) => {
  await installModelContext(page);
  await page.setViewportSize({ width: 820, height: 1000 });
  await page.goto('/');
  await propose(page, 'material', '6061-T6', ['spec:s3.1'], 'The specification names the alloy.');
  await shot(page, 'lane-820');
});
