import { expect, test } from '@playwright/test';
import { removeModelContext } from './helpers';

test('sample replay exposes review decisions and reaches the confirmation summary', async ({ page }) => {
  test.setTimeout(60_000);
  const browserProblems: string[] = [];
  page.on('console', message => {
    if (message.type() === 'error' || message.type() === 'warning') browserProblems.push(message.text());
  });
  page.on('pageerror', error => browserProblems.push(error.message));
  await page.clock.install({ time: new Date('2026-09-02T10:00:00Z') });
  await page.clock.pauseAt(new Date('2026-09-02T10:00:00Z'));
  // B1: the fallback path, declared, not inherited from the runner.
  await removeModelContext(page);
  await page.goto('/');
  await page.getByRole('button', { name: 'Play sample session' }).click();

  await page.clock.runFor(3_000);
  const first = page.locator('[data-field-id="customer_rfq_ref"]');
  await expect(first).toContainText('Needs review');
  await expect(first.getByRole('link')).toBeVisible();
  await first.getByRole('link').click();
  await expect(page.locator('.document-region--highlighted')).toBeVisible();
  await first.getByRole('button', { name: 'Verify' }).click();
  await expect(page.locator('.field-list__verified-summary')).toContainText('1 more verified');
  await expect(page.locator('.field-list__verified-names')).toHaveText('Customer RFQ ref');
  // B3: log stamps are wall-clock, so the badge reads a real elapsed time.
  await page.locator('.field-list__verified-summary').getByRole('button', { name: 'Show' }).click();
  await expect(first).toContainText(/Verified by you · 0:\d\d ago/);
  await page.locator('.field-list__verified-summary').getByRole('button', { name: 'Hide' }).click();

  await page.clock.runFor(14_500);
  const material = page.locator('[data-field-id="material"]');
  await expect(material.getByRole('button', { name: /Apply/ })).toBeVisible();
  await material.getByRole('button', { name: /Apply/ }).click();

  await page.clock.runFor(2_200);
  const quantity = page.locator('[data-field-id="quantity"]');
  await expect(quantity).toContainText('Two sources disagree');
  await expect(quantity).toContainText('800');
  await expect(quantity).toContainText('750');
  await quantity.getByRole('button', { name: 'Pick' }).first().click();

  await page.clock.runFor(2_500);
  const dimensions = page.locator('[data-field-id="overall_dimensions"]');
  await expect(dimensions.getByRole('button', { name: 'Add unit' })).toBeVisible();
  await page.clock.runFor(1_500);
  await expect(page.locator('.field-list__verified-summary')).toContainText('Overall dimensions');

  await page.clock.runFor(3_700);
  await expect(page.getByRole('tab', { name: /Clarification/ })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('heading', { name: 'Clarification email' })).toBeVisible();
  // The whole draft is readable in place: the textarea grows, it never scrolls inside.
  const draftBody = await page.getByRole('textbox', { name: 'Body' })
    .evaluate(element => ({ scroll: element.scrollHeight, client: element.clientHeight }));
  expect(draftBody.scroll).toBeLessThanOrEqual(draftBody.client + 1);
  await page.getByRole('button', { name: 'Send' }).click();
  await expect(page.getByText(/Sent · 3 fields asked/)).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Clarification email' })).toBeVisible();

  // The value slot never carries the badge's wording: an asked field with no
  // value reads as a dash, and one that had a value keeps it (export 11).
  const reveal = page.locator('.field-list__verified-summary').getByRole('button', { name: 'Show' });
  if (await reveal.count()) await reveal.click();
  for (const id of ['general_tolerance', 'drawing_number', 'drawing_revision']) {
    const row = page.locator(`[data-field-id="${id}"]`);
    await expect(row.locator('.field-row__badge')).toContainText('Awaiting customer');
    const value = await row.locator('.field-row__value').innerText();
    expect(value).not.toContain('Awaiting customer');
    expect(value === '—' || value.length > 0).toBe(true);
  }

  // Every field settled: the verified header drops the word "more".
  await expect(page.locator('.field-list__verified-count')).toHaveText('11 verified');

  await page.clock.runFor(3_500);
  await expect(page.getByRole('heading', { name: /Confirmed/ })).toBeVisible();
  await expect(page.getByText(/Recorded review/)).toBeVisible();

  // The summary lists are plain rows — no bullets, no ordinals — and the count
  // chips are sans, because mono is reserved for values.
  const summary = await page.evaluate(() => {
    const lists = [...document.querySelectorAll('.confirm-summary ul, .confirm-summary ol')];
    return {
      lists: lists.length,
      markers: [...new Set(lists.map(list => getComputedStyle(list).listStyleType))],
      chip: getComputedStyle(document.querySelector('.confirm-summary__count')!).fontFamily,
      sans: getComputedStyle(document.body).fontFamily,
    };
  });
  expect(summary.lists).toBeGreaterThan(0);
  expect(summary.markers).toEqual(['none']);
  expect(summary.chip).toBe(summary.sans);
  expect(browserProblems).toEqual([]);
});
