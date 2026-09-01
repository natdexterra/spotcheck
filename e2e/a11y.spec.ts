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
