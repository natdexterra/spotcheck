import { expect, test, type Page } from '@playwright/test';
import { mkdir, readFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import type { Fixture } from '../src/replay/replay';
import { executeTool, installModelContext } from './helpers';

const fixture: Fixture = JSON.parse(readFileSync('data/sample-session.json', 'utf8'));
const total = fixture.steps.length;
const replay = (page: Page) => page.getByRole('group', { name: 'Replay controls' });
const counter = (page: Page) => replay(page).locator('.numeric').last();
const start = async (page: Page) => {
  await page.evaluate(() => document.fonts.ready);
  await page.getByRole('button', { name: 'Play sample session', exact: true }).click();
  await expect(counter(page)).toHaveText(`0 / ${total}`);
};
const finish = async (page: Page) => {
  await page.evaluate(() => document.fonts.ready);
  if (await replay(page).getByRole('button', { name: 'Play', exact: true }).count()) await replay(page).getByRole('button', { name: 'Play', exact: true }).click();
  await page.clock.runFor(total * 1500 + 1000);
  await expect(replay(page)).toContainText('finished');
};
const download = async (page: Page, area: string) => {
  const pending = page.waitForEvent('download');
  const button = page.locator(area).getByRole('button', { name: 'Export session' });
  await button.click();
  const file = await pending;
  expect(file.suggestedFilename()).toMatch(/^spotcheck-session-\d{4}-\d{2}-\d{2}T\d{4}\.json$/);
  expect(await button.evaluate(element => document.activeElement === element)).toBe(true);
  const text = await readFile((await file.path())!, 'utf8');
  expect(text).toContain('\n  "recorded_at":');
  const data = JSON.parse(text);
  expect(data.recorded_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  return { text, data };
};
const importText = async (page: Page, text: string) => {
  await page.evaluate(() => document.fonts.ready);
  await page.getByRole('button', { name: 'Show change log' }).click();
  await page.getByLabel('Import session', { exact: true }).setInputFiles({ name: 'session.json', mimeType: 'application/json', buffer: Buffer.from(text) });
};

test.beforeEach(async ({ page }) => {
  const problems: string[] = [];
  page.on('console', message => { if (['error', 'warning'].includes(message.type())) problems.push(message.text()); });
  page.on('pageerror', error => problems.push(error.message));
  Object.assign(page, { replayProblems: problems });
  await page.clock.install({ time: new Date('2026-09-02T10:00:00Z') });
  await page.clock.pauseAt(new Date('2026-09-02T10:00:00Z'));
});
test.afterEach(async ({ page }) => {
  expect((page as Page & { replayProblems: string[] }).replayProblems).toEqual([]);
});

test('B1 controls advance, pause, step, restart and confirm; live strip exports', async ({ page }) => {
  await page.goto('/'); await start(page);
  await page.clock.runFor(3000);
  const advanced = await counter(page).textContent();
  expect(advanced).not.toBe(`0 / ${total}`);
  await replay(page).getByRole('button', { name: 'Pause' }).click();
  await page.clock.runFor(5000);
  await expect(counter(page)).toHaveText(advanced!);
  await replay(page).getByRole('button', { name: 'Next call' }).click();
  await expect(counter(page)).toHaveText(`${Number(advanced!.split(' / ')[0]) + 1} / ${total}`);
  const exported = await download(page, '.status-strip');
  expect(exported.data.steps.length).toBeGreaterThan(0);
  await replay(page).getByRole('button', { name: 'Restart' }).click();
  await expect(counter(page)).toHaveText(`0 / ${total}`);
  await expect(page.locator('.field-row__badge')).toHaveCount(11);
  await expect(page.locator('.field-row__badge').filter({ hasText: 'Not extracted' })).toHaveCount(11);
  await expect(replay(page).getByRole('button', { name: 'Play', exact: true })).toBeFocused();
  await finish(page);
  await expect(counter(page)).toHaveText(`${total} / ${total}`);
  await expect(replay(page).getByRole('button')).toHaveCount(1);
  await expect(page.locator('.status-strip__summary')).toContainText('Confirmed');
  await expect(page.locator('.status-strip').getByRole('button', { name: 'Export session' })).toHaveCount(0);
  await expect(page.locator('.confirm-summary__timer')).toContainText('Recorded review');
});

test('B8 summary export imports to the same field decisions and complete log', async ({ page }) => {
  await page.goto('/'); await start(page); await finish(page);
  const decisions = await page.locator('.confirm-summary__details').innerText();
  const counts = await page.locator('.confirm-summary__counts').innerText();
  const entries = await page.locator('.confirm-summary__log-entries > li').count();
  const exported = await download(page, '.confirm-summary');
  expect(exported.data.steps).toHaveLength(entries);
  await page.reload(); await importText(page, exported.text);
  await expect(replay(page)).toContainText('Imported session');
  await page.clock.runFor(20);
  await expect(replay(page).getByRole('button', { name: 'Pause' })).toBeFocused();
  await finish(page);
  expect(await page.locator('.confirm-summary__details').innerText()).toBe(decisions);
  expect(await page.locator('.confirm-summary__counts').innerText()).toBe(counts);
  await expect(page.locator('.confirm-summary__log-entries > li')).toHaveCount(entries);
});

test('take-over logs the skipped estimator step and viewer confirmation shows both durations', async ({ page }) => {
  await page.goto('/'); await start(page);
  await page.clock.runFor(3000);
  await replay(page).getByRole('button', { name: 'Pause' }).click();
  await page.locator('[data-field-id="customer_rfq_ref"]').getByRole('button', { name: 'Verify', exact: true }).click();
  const confirmIndex = fixture.steps.findIndex(step => step.actor === 'estimator' && step.action?.type === 'confirm');
  while (Number((await counter(page).innerText()).split(' / ')[0]) < confirmIndex) await replay(page).getByRole('button', { name: 'Next call' }).click();
  await page.clock.runFor(120_000);
  await page.getByRole('button', { name: 'Confirm quote request' }).click();
  await expect(page.locator('.confirm-summary__timer')).toContainText(/Recorded review .* · this run 2:/);
  await expect(page.locator('.confirm-summary__log')).toContainText('You skipped viewer handled customer_rfq_ref');
});

test('import failure leaves the session intact and announces the error', async ({ page }) => {
  await page.goto('/');
  await importText(page, 'not JSON');
  await expect(page.locator('.change-log__error')).toContainText('Could not import:');
  await expect(page.locator('.live-region')).toContainText('Could not import:');
  await expect(page.locator('.field-row')).toHaveCount(11);
  await expect(replay(page)).toHaveCount(0);
});

test('saved live proposals survive sample reload and Start over restores them with persistence resumed', async ({ page }) => {
  await installModelContext(page); await page.goto('/');
  await executeTool(page, 'propose_field', { field_id: 'material', value: 'Live alloy', source_refs: ['spec:s1.1'] });
  await executeTool(page, 'propose_field', { field_id: 'quantity', value: '27', source_refs: ['email:p2'] });
  const saved = await page.evaluate(() => localStorage.getItem('spotcheck.session.v1'));
  const startFromLive = async () => {
    await page.getByRole('button', { name: 'Show change log' }).click();
    await start(page);
  };
  await startFromLive(); await page.clock.runFor(3000); await page.reload();
  await expect(page.locator('[data-field-id="material"]')).toContainText('Live alloy');
  await expect(page.locator('[data-field-id="quantity"]')).toContainText('27');
  expect(await page.evaluate(() => localStorage.getItem('spotcheck.session.v1'))).toBe(saved);
  await startFromLive(); await finish(page);
  await page.getByRole('button', { name: 'Start over' }).click();
  await expect(replay(page)).toHaveCount(0);
  await expect(page.locator('.status-strip__summary')).toContainText('2 calls');
  await expect(page.locator('[data-field-id="material"]')).toContainText('Live alloy');
  await executeTool(page, 'propose_field', { field_id: 'part_name', value: 'Live part', source_refs: ['spec:s1.1'] });
  await page.reload();
  await expect(page.locator('[data-field-id="part_name"]')).toContainText('Live part');
});

for (const width of [1920, 1366, 390]) {
  test(`${width}px replay states, controls, ellipsis and screenshots`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1080 });
    await installModelContext(page);
    await page.goto('/');
    const capture = async (state: string) => {
      await page.evaluate(() => document.fonts.ready);
      const path = `docs/qa/p3/replay-${state}-${width}.png`;
      await mkdir('docs/qa/p3', { recursive: true });
      await page.screenshot({ path, animations: 'disabled' });
      await testInfo.attach(`${state}-${width}`, { path, contentType: 'image/png' });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      expect(await counter(page).evaluate(element => element.getBoundingClientRect().height)).toBeLessThanOrEqual(20);
      for (const button of await replay(page).getByRole('button').all()) {
        const box = (await button.boundingBox())!;
        expect(box.height).toBeGreaterThanOrEqual(width < 1024 ? 44 : 24);
      }
    };
    await start(page); await page.clock.runFor(3000); await capture('playing');
    await replay(page).getByRole('button', { name: 'Pause' }).click(); await capture('paused');
    if (width < 1024) {
      const text = (await page.locator('.replay-controls__text').boundingBox())!;
      const actions = (await page.locator('.replay-controls__actions').boundingBox())!;
      expect(actions.y).toBeGreaterThanOrEqual(text.y + text.height);
    }
    await finish(page); await capture('ended');
    await page.reload();
    await executeTool(page, 'propose_field', { field_id: 'delivery', value: 'A long delivery request for the complete powder-coated bracket assembly with all mounting hardware and packing documentation', source_refs: ['email:p5'] });
    const line = page.locator('.change-log__entry--collapsed .change-log__sentence');
    await page.evaluate(() => document.fonts.ready);
    expect(await line.evaluate(element => ({ height: element.scrollHeight, leading: parseFloat(getComputedStyle(element).lineHeight) }))).toEqual({ height: 16, leading: 16 });
    await page.evaluate(() => { document.modelContext!.registerTool = () => { throw new Error('Tool unavailable'); }; });
    await importText(page, JSON.stringify({ recorded_at: '2026-09-01', steps: [{ actor: 'agent', at: 0, call: { tool: 'report_missing', input: { field_id: 'drawing_number', searched: ['drawing'] } } }] }));
    await page.clock.runFor(1000);
    await expect(replay(page)).toContainText('stopped at step 1: Tool unavailable');
    await capture('error');
  });
}
