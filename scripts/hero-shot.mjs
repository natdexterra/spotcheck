// One-off: capture the triage screen from the live site during the sample replay.
import { chromium } from '@playwright/test';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
await page.goto('https://spotcheck-rfq.vercel.app/?quiet=1');
await page.getByRole('button', { name: 'Play sample session' }).click();
await page.waitForTimeout(16000);
const conflict = page.locator('[data-field-id="quantity"]');
await conflict.getByRole('link').first().click({ timeout: 3000 }).catch(() => {});
await page.waitForTimeout(800);
await page.screenshot({ path: 'docs/readme-hero.png' });
console.log(await page.locator('.status-strip').innerText());
await browser.close();
