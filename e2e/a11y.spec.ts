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

  const tolerance = page.locator('[data-field-id="general_tolerance"]');
  await page.keyboard.press('j');
  await expect(tolerance).toBeFocused();
  await page.keyboard.press('j');
  await expect(page.locator('[data-field-id="material"]')).toBeFocused();
  await page.keyboard.press('k');
  await expect(tolerance).toBeFocused();

  // Enter runs the row's primary action; e opens the editor; Esc returns focus.
  await page.keyboard.press('Enter');
  await expect(tolerance.locator('input').first()).toBeFocused();
  await page.keyboard.press('Escape');
  const enterValue = tolerance.getByRole('button', { name: 'Enter value' });
  await expect(enterValue).toBeFocused();

  // The focused control wears the global ring.
  const ring = await enterValue.evaluate(element => {
    const style = getComputedStyle(element);
    return { color: style.outlineColor, style: style.outlineStyle, width: style.outlineWidth };
  });
  expect(ring).toEqual({ color: 'rgb(31, 111, 235)', style: 'solid', width: '2px' });

  const animation = await page.locator('[data-field-id="material"]').evaluate(element => getComputedStyle(element).animationName);
  expect(animation).toBe('none');

  // The provenance flash becomes a static outline, never a fading tint.
  await page.locator('[data-field-id="material"]').getByRole('link', { name: 'spec §3.1' }).click();
  const flash = await page.locator('[id="spec:s3.1"]').evaluate(element => {
    const style = getComputedStyle(element);
    return {
      background: style.backgroundColor,
      outline: `${style.outlineStyle} ${style.outlineWidth} ${style.outlineColor}`,
      transition: style.transitionDuration,
    };
  });
  expect(flash.background).toBe('rgb(255, 255, 255)');
  expect(flash.outline).toBe('solid 2px rgb(31, 111, 235)');
  expect(flash.transition).toBe('0s');
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
  expect(await radio.evaluate(element => getComputedStyle(element).backgroundImage)).toContain(ACCENT);

  // The picker still dispatches dismiss with the chosen reason.
  await tolerance.getByRole('button', { name: 'Mark not required' }).last().click();
  await expect(page.locator('.field-list__verified-summary')).toContainText('General tolerance');

  // Segmented unit control: the ring paints on the visible segment, not the clipped input.
  const dimensions = page.locator('[data-field-id="overall_dimensions"]');
  await dimensions.getByRole('button', { name: 'Add unit' }).click();
  await dimensions.getByRole('textbox', { name: 'Overall dimensions value' }).click();
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
  await expect(row.getByRole('textbox', { name: 'Quantity value' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(trigger).toBeFocused();

  // The `e` binding on the row reaches the same editor and the same return.
  await row.focus();
  await page.keyboard.press('e');
  await expect(row.getByRole('textbox', { name: 'Quantity value' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(trigger).toBeFocused();
});

test('the source tablist has a roving tabindex and arrow-key navigation', async ({ page }) => {
  await installModelContext(page);
  await page.goto('/');

  const tabs = page.getByRole('tab');
  await expect(tabs).toHaveCount(3);
  expect(await tabs.evaluateAll(list => list.map(tab => tab.getAttribute('tabindex'))))
    .toEqual(['0', '-1', '-1']);

  await page.getByRole('tab', { name: 'Email' }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('tab', { name: 'Spec' })).toBeFocused();
  await expect(page.getByRole('tab', { name: 'Spec' })).toHaveAttribute('aria-selected', 'true');

  await page.keyboard.press('End');
  await expect(page.getByRole('tab', { name: 'Drawing' })).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('tab', { name: 'Email' })).toBeFocused();
  await page.keyboard.press('Home');
  await expect(page.getByRole('tab', { name: 'Email' })).toBeFocused();

  // A12: overlay boxes name their region in words, not by id.
  await page.getByRole('tab', { name: 'Drawing' }).click();
  await expect(page.getByRole('button', { name: 'Width, 20.000' })).toBeVisible();

  // A13: the Ask customer toggle switches to ink at weight 500 when pressed.
  await executeTool(page, 'propose_field', {
    field_id: 'material', value: '6061-T6', source_refs: ['spec:s3.1'], rationale: 'Named in the callout.',
  });
  const toggle = page.locator('[data-field-id="material"]').getByRole('button', { name: 'Ask customer' });
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  await page.mouse.move(0, 0);
  await expect.poll(() => toggle.evaluate(element => {
    const style = getComputedStyle(element);
    return `${style.color} ${style.fontWeight}`;
  })).toBe('rgb(14, 17, 22) 500');
});
