import { expect, test } from '@playwright/test';

test('sample replay exposes review decisions and reaches the confirmation summary', async ({ page }) => {
  test.setTimeout(60_000);
  const browserProblems: string[] = [];
  page.on('console', message => {
    if (message.type() === 'error' || message.type() === 'warning') browserProblems.push(message.text());
  });
  page.on('pageerror', error => browserProblems.push(error.message));
  await page.clock.install();
  await page.goto('/');
  await page.getByRole('button', { name: 'Play sample session' }).click();

  await page.clock.runFor(3_000);
  const first = page.locator('[data-field-id="customer_rfq_ref"]');
  await expect(first).toContainText('Needs review');
  await expect(first.getByRole('link')).toBeVisible();
  await first.getByRole('link').click();
  await expect(page.locator('.document-region--highlighted')).toBeVisible();
  await first.getByRole('button', { name: 'Verify' }).click();
  await expect(page.getByText(/1 more verified · Customer RFQ ref/)).toBeVisible();

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
  await page.getByRole('button', { name: 'Send' }).click();
  await expect(page.getByText(/Sent · 3 fields asked/)).toBeVisible();

  await page.clock.runFor(3_500);
  await expect(page.getByRole('heading', { name: /Confirmed/ })).toBeVisible();
  await expect(page.getByText(/Reviewed in/)).toBeVisible();
  expect(browserProblems).toEqual([]);
});
