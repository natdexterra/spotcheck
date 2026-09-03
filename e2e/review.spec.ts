import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import type { Fixture } from '../src/replay/replay';
import { removeModelContext, waitForProposal, waitForStep } from './helpers';

const fixture: Fixture = JSON.parse(readFileSync('data/sample-session.json', 'utf8'));

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

  let elapsed = 0;
  const advanceTo = async (target: number) => { await page.clock.runFor(Math.max(0, target - elapsed)); elapsed = Math.max(elapsed, target); };

  await advanceTo(waitForProposal(fixture, 'customer_rfq_ref'));
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

  // The recording's own clarification goes out before its own fix to
  // Material (idx30-31 precede idx35): a live viewer sees the send first.
  await advanceTo(waitForStep(fixture, step => step.actor === 'agent' && step.call.tool === 'draft_clarification'));
  await expect(page.getByRole('tab', { name: /Clarification/ })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('heading', { name: 'Clarification email' })).toBeVisible();
  // The whole draft is readable in place: the textarea grows, it never scrolls inside.
  const draftBody = await page.getByRole('textbox', { name: 'Body' })
    .evaluate(element => ({ scroll: element.scrollHeight, client: element.clientHeight }));
  expect(draftBody.scroll).toBeLessThanOrEqual(draftBody.client + 1);
  // The count the row sends with is the fixture's own recorded send, not a
  // literal: nothing has resolved any of its covered fields yet.
  const sentStep = fixture.steps.find(step => step.actor === 'estimator' && step.action.type === 'send');
  const askedCount = sentStep?.actor === 'estimator' && sentStep.action.type === 'send' ? sentStep.action.covers?.length ?? 0 : 0;
  await page.getByRole('button', { name: 'Send' }).click();
  await expect(page.getByText(new RegExp(`Sent · ${askedCount} fields? asked`))).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Clarification email' })).toBeVisible();

  // The value slot never carries the badge's wording: an asked field with no
  // value reads as a dash, and one that had a value keeps it (export 11).
  const reveal = page.locator('.field-list__verified-summary').getByRole('button', { name: 'Show' });
  if (await reveal.count()) await reveal.click();
  for (const id of ['general_tolerance', 'drawing_number', 'drawing_revision']) {
    const row = page.locator(`[data-field-id="${id}"]`);
    await expect(row.locator('.field-row__badge')).toContainText('Awaiting customer');
    // All three went to the customer with no value of their own, so all three
    // read as the dash. A row that had one keeps it: FieldList covers that.
    await expect(row.locator('.field-row__value')).toHaveText('—');
  }

  // Quantity went out with the same clarification; a viewer reopens it to
  // pick a candidate instead of waiting on the customer's answer.
  const quantity = page.locator('[data-field-id="quantity"]');
  await expect(quantity.locator('.field-row__badge')).toContainText('Awaiting customer');
  await quantity.getByRole('button', { name: 'Reopen' }).click();
  await expect(quantity).toContainText('Two sources disagree');
  await expect(quantity).toContainText('800');
  await expect(quantity).toContainText('750');
  await quantity.getByRole('button', { name: 'Pick' }).first().click();

  const materialLockedAt = fixture.steps.findIndex(step => step.actor === 'estimator' && 'field_id' in step.action && step.action.field_id === 'material');
  await advanceTo(waitForStep(fixture, (step, index) => index > materialLockedAt && step.actor === 'agent' && step.call.tool === 'propose_field' && (step.call.input as { field_id?: string })?.field_id === 'material'));
  const material = page.locator('[data-field-id="material"]');
  await expect(material.getByRole('button', { name: /Apply/ })).toBeVisible();
  await material.getByRole('button', { name: /Apply/ }).click();

  await advanceTo(waitForProposal(fixture, 'overall_dimensions'));
  const dimensions = page.locator('[data-field-id="overall_dimensions"]');
  await expect(dimensions.getByRole('button', { name: 'Add unit' })).toBeVisible();
  await advanceTo(waitForStep(fixture, step => step.actor === 'estimator' && 'field_id' in step.action && step.action.field_id === 'overall_dimensions' && step.action.type === 'edit'));
  await expect(page.locator('.field-list__verified-summary')).toContainText('Overall dimensions');

  // The fixture's own remaining verifies resolve the rest without a live
  // hand: wait for its last one so every field is settled before the count.
  await advanceTo(waitForStep(fixture, step => step.actor === 'estimator' && step.action.type === 'verify' && step.action.field_id === 'delivery'));

  // Every field settled: the verified header drops the word "more".
  await expect(page.locator('.field-list__verified-count')).toHaveText('11 verified');

  await advanceTo(waitForStep(fixture, step => step.actor === 'estimator' && step.action.type === 'confirm'));
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

  // Export 08: the details and the log are cards on the canvas; the actions
  // under them are not, and every block keeps its own gap so that no two
  // hairlines ever meet.
  const blocks = await page.evaluate(() => {
    const box = (selector: string) => document.querySelector(selector)!.getBoundingClientRect();
    const actions = document.querySelector('.confirm-summary__actions')!;
    const style = getComputedStyle(actions);
    return {
      detailsToLog: box('.confirm-summary__log').top - box('.confirm-summary__details').bottom,
      logToActions: actions.getBoundingClientRect().top - box('.confirm-summary__log').bottom,
      border: style.borderTopWidth,
      background: style.backgroundColor,
    };
  });
  expect(blocks.detailsToLog).toBeGreaterThan(0);
  expect(blocks.logToActions).toBeGreaterThan(0);
  expect(blocks.border).toBe('0px');
  expect(blocks.background).toBe('rgba(0, 0, 0, 0)');

  expect(browserProblems).toEqual([]);
});
