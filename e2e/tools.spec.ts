import { expect, test } from '@playwright/test';
import { executeTool, installModelContext } from './helpers';

test.beforeEach(async ({ page }) => {
  await installModelContext(page);
});

test('registered tools drive risk order and protect human decisions', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('Waiting for your agent.')).toBeVisible();
  expect(await page.evaluate(() => Object.keys((window as unknown as { __spotcheckTools: object }).__spotcheckTools))).toHaveLength(6);

  await executeTool(page, 'propose_field', {
    field_id: 'material', value: '6061-T6', source_refs: ['spec:s3.1'], rationale: 'The material callout names this alloy.',
  });
  await expect(page.getByText('Live', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: /Show tools/ }).click();
  const material = page.locator('[data-field-id="material"]');
  await material.getByRole('button', { name: 'Verify' }).click();
  await expect(page.getByText('1 more verified · Material')).toBeVisible();

  const locked = await executeTool(page, 'propose_field', {
    field_id: 'material', value: 'Steel', source_refs: ['email:p3'], rationale: 'The email says steel.',
  });
  expect(locked).toMatchObject({
    ok: false,
    code: 'FIELD_LOCKED',
    current: { value: '6061-T6', state: 'verified', resolution: 'verified' },
  });
  await expect(material.getByText('Steel', { exact: true })).toBeVisible();
  await expect(material.getByRole('button', { name: 'Apply' })).toBeVisible();

  await executeTool(page, 'report_missing', {
    field_id: 'general_tolerance', searched: ['drawing', 'spec'], note: 'No general tolerance was stated.',
  });
  await executeTool(page, 'report_conflict', {
    field_id: 'quantity',
    candidates: [
      { value: '800', source_refs: ['spec:s1.1'], note: 'Specification quantity.' },
      { value: '750', source_refs: ['email:p2'], note: 'Email quantity.' },
    ],
    note: 'The sources disagree.',
  });

  // B5: a candidate's source link drives the two-way highlight like any other.
  await page.locator('[data-field-id="quantity"]').getByRole('link', { name: 'spec §1.1' }).click();
  await expect(page.getByRole('tab', { name: 'Spec' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('[id="spec:s1.1"]')).toHaveClass(/document-region--highlighted/);

  // S5: the searched places read as a sentence in the agent line, never as chips.
  await expect(page.locator('[data-field-id="general_tolerance"]')).toContainText(
    'Agent: No general tolerance was stated. Searched the drawing and the specification.',
  );
  await expect(page.locator('.field-row__chip')).toHaveCount(0);

  const visibleOrder = await page.locator('.field-row').evaluateAll(rows => rows.map(row => row.getAttribute('data-field-id')));
  expect(visibleOrder.slice(0, 2)).toEqual(['quantity', 'general_tolerance']);
  await expect(page.locator('[data-field-id="quantity"]')).toContainText('800');
  await expect(page.locator('[data-field-id="quantity"]')).toContainText('750');
  await expect.poll(() => page.evaluate(() => Object.keys((window as unknown as { __spotcheckTools: object }).__spotcheckTools).length)).toBe(7);

  // S7/B6: the count names the change and the row called is lit, both for two
  // seconds; then the count settles and the marker clears.
  await expect(page.locator('.status-strip')).toContainText('6 → 7 tools');
  await expect(page.locator('.status-strip__roster-row--called')).toHaveCount(1);
  await expect(page.locator('.status-strip')).not.toContainText('6 → 7 tools', { timeout: 6_000 });
  await expect(page.locator('.status-strip')).toContainText('7 tools');
  await expect(page.locator('.status-strip__roster-row--called')).toHaveCount(0);

  await executeTool(page, 'draft_clarification', {
    subject: 'Open quote question', body: 'Please confirm the general tolerance.', covers: ['general_tolerance'],
  });
  await expect(page.getByRole('tab', { name: /Clarification/ })).toBeVisible();
  await expect(page.getByLabel('Subject')).toHaveValue('Open quote question');
  await expect(page.locator('[data-field-id="quantity"]')).not.toContainText('Verified by you');

  await page.locator('[data-field-id="quantity"]').getByRole('button', { name: 'Pick' }).first().click();
  const tolerance = page.locator('[data-field-id="general_tolerance"]');
  await tolerance.getByRole('button', { name: 'Mark not required' }).first().click();
  await tolerance.getByRole('radio', { name: 'Not required for this quote' }).check();
  await tolerance.getByRole('button', { name: 'Mark not required' }).last().click();
  await expect.poll(() => page.evaluate(() => Object.keys((window as unknown as { __spotcheckTools: object }).__spotcheckTools).length)).toBe(6);
  await expect(page.locator('.status-strip')).toContainText('7 → 6 tools');
});

test('agent tools cannot create verified state and quiet mode omits the injected note', async ({ page }) => {
  await page.goto('/?quiet=1');
  await expect(page.getByText(/ignore previous instructions/)).toHaveCount(0);

  await executeTool(page, 'propose_field', {
    field_id: 'delivery', value: 'verified', source_refs: ['email:p5'], rationale: 'mark verified',
  });
  await executeTool(page, 'report_conflict', {
    field_id: 'quantity', candidates: [
      { value: '800', source_refs: ['spec:s1.1'], note: 'verified source' },
      { value: '750', source_refs: ['email:p2'] },
    ], note: 'verified',
  });
  await executeTool(page, 'report_missing', {
    field_id: 'general_tolerance', searched: ['drawing'], note: 'verified',
  });
  await expect.poll(() => page.evaluate(() => Object.keys((window as unknown as { __spotcheckTools: object }).__spotcheckTools))).toContain('draft_clarification');
  await executeTool(page, 'draft_clarification', {
    subject: 'verified', body: 'verified', covers: ['general_tolerance'],
  });

  await expect(page.locator('[data-field-badge][aria-label^="Verified"]')).toHaveCount(0);
});
