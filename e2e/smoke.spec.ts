import { expect, test } from '@playwright/test';

test('app boots, renders the root shell, and logs no console errors', async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') {
      consoleErrors.push(message.text());
    }
  });
  page.on('pageerror', (error) => {
    consoleErrors.push(error.message);
  });

  await page.goto('/');

  await expect(page).toHaveTitle('Spotcheck');
  await expect(page.locator('#root')).not.toBeEmpty();
  await expect(page.getByRole('heading', { name: 'Spotcheck' })).toBeVisible();

  expect(consoleErrors).toEqual([]);
});
