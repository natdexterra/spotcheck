import { expect, test } from '@playwright/test';
import { executeTool, installModelContext } from './helpers';

test('reduced motion, announcements, keyboard map, and same-origin boundary hold', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await installModelContext(page);
  const foreignRequests: string[] = [];
  page.on('request', request => {
    if (new URL(request.url()).origin !== 'http://localhost:4173') foreignRequests.push(request.url());
  });
  await page.goto('/');
  await page.evaluate(() => {
    const announcements: string[] = [];
    Object.assign(window, { __spotcheckAnnouncements: announcements });
    new MutationObserver(() => {
      const message = document.querySelector('.live-region')?.textContent;
      if (message) announcements.push(message);
    }).observe(document.querySelector('.live-region')!, { childList: true, subtree: true });
  });

  await executeTool(page, 'propose_field', {
    field_id: 'material', value: '6061-T6', source_refs: ['spec:s3.1'], rationale: 'Source value.',
  });
  await executeTool(page, 'propose_field', {
    field_id: 'delivery', value: 'Two weeks', source_refs: ['email:p5'], rationale: 'Requested delivery.',
  });
  await executeTool(page, 'report_missing', {
    field_id: 'general_tolerance', searched: ['drawing'], note: 'Not stated.',
  });
  await expect.poll(() => page.evaluate(() => (
    window as unknown as { __spotcheckAnnouncements: string[] }
  ).__spotcheckAnnouncements)).toContain('general tolerance: reported missing');

  await page.keyboard.press('j');
  await expect(page.locator('[data-field-id="general_tolerance"]')).toBeFocused();
  await page.keyboard.press('e');
  await expect(page.locator('[data-field-id="general_tolerance"] input').first()).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-field-id="general_tolerance"]').getByRole('button', { name: 'Enter value' })).toBeFocused();

  const animation = await page.locator('[data-field-id="material"]').evaluate(element => getComputedStyle(element).animationName);
  expect(animation).toBe('none');
  expect(foreignRequests).toEqual([]);
});

const ACCENT = 'rgb(31, 111, 235)';
const INK = 'rgb(14, 17, 22)';

test('choice controls are drawn by the app and take the focus ring on the drawn box', async ({ page }) => {
  await installModelContext(page);
  await page.goto('/');
  await executeTool(page, 'report_missing', {
    field_id: 'general_tolerance', searched: ['spec:s3', 'drawing'], note: 'No tolerance is stated.',
  });
  await executeTool(page, 'report_missing', {
    field_id: 'drawing_number', searched: ['spec:s3', 'drawing'], note: 'The sheet carries no number.',
  });
  await executeTool(page, 'propose_field', {
    field_id: 'overall_dimensions', value: '20 × 14.5', source_refs: ['drawing:width'],
    rationale: 'The drawing names no unit.',
  });
  await executeTool(page, 'draft_clarification', {
    subject: 'Two questions', body: 'Please confirm.', covers: ['general_tolerance', 'drawing_number'],
  });

  const box = (locator: import('@playwright/test').Locator) => locator.evaluate(element => {
    const style = getComputedStyle(element);
    return {
      appearance: style.appearance,
      width: style.width,
      height: style.height,
      borderColor: style.borderTopColor,
      background: style.backgroundColor,
    };
  });

  // Checkbox: 16px, appearance none, ink fill when checked.
  const cover = page.getByRole('checkbox', { name: 'General tolerance' });
  const coverBox = await box(cover);
  expect(coverBox.appearance).toBe('none');
  expect(coverBox.width).toBe('16px');
  expect(coverBox.height).toBe('16px');
  expect(await cover.isChecked()).toBe(true);
  expect(coverBox.background).toBe(INK);

  // Radio: 16px, appearance none, accent ring and dot when chosen.
  const tolerance = page.locator('[data-field-id="general_tolerance"]');
  await tolerance.getByRole('button', { name: 'Mark not required' }).click();
  await expect(tolerance.getByText('Why is this not required?')).toBeVisible();
  const radio = tolerance.getByRole('radio', { name: 'Covered by our shop standard' });
  const radioBox = await box(radio);
  expect(radioBox.appearance).toBe('none');
  expect(radioBox.width).toBe('16px');
  expect(radioBox.height).toBe('16px');

  await radio.check();
  expect((await box(radio)).borderColor).toBe(ACCENT);
  const dot = tolerance.locator('.choice--radio .choice__input:checked ~ .choice__mark .choice__dot');
  await expect(dot).toBeVisible();
  expect(await dot.evaluate(element => getComputedStyle(element).backgroundColor)).toBe(ACCENT);

  // The picker still dispatches dismiss with the chosen reason.
  await tolerance.getByRole('button', { name: 'Mark not required' }).last().click();
  await expect(page.locator('.field-list__verified-summary')).toContainText('General tolerance');

  // Segmented unit control: the ring paints on the visible segment, not the clipped input.
  const dimensions = page.locator('[data-field-id="overall_dimensions"]');
  await dimensions.getByRole('button', { name: 'Add unit' }).click();
  await dimensions.getByRole('textbox', { name: 'Overall dimensions' }).click();
  await page.keyboard.press('Tab');
  const segment = dimensions.locator('.inline-editor__segment').first();
  await expect(segment.locator('input')).toBeFocused();
  const ring = await segment.evaluate(element => {
    const style = getComputedStyle(element);
    return { color: style.outlineColor, style: style.outlineStyle, width: style.outlineWidth };
  });
  expect(ring).toEqual({ color: ACCENT, style: 'solid', width: '2px' });
});

test('the editor opened from a conflict row returns focus to Enter another value', async ({ page }) => {
  await installModelContext(page);
  await page.goto('/');
  await executeTool(page, 'report_conflict', {
    field_id: 'quantity',
    candidates: [
      { value: '800', source_refs: ['spec:s1.1'] },
      { value: '750', source_refs: ['email:p2'] },
    ],
    note: 'The sources disagree.',
  });

  const row = page.locator('[data-field-id="quantity"]');
  const trigger = row.getByRole('button', { name: 'Enter another value' });

  await trigger.click();
  await expect(row.getByRole('textbox', { name: 'Quantity' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(trigger).toBeFocused();

  // The `e` binding on the row reaches the same editor and the same return.
  await row.focus();
  await page.keyboard.press('e');
  await expect(row.getByRole('textbox', { name: 'Quantity' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(trigger).toBeFocused();
});
