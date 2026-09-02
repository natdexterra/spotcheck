import { expect, test, type Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { executeTool, installModelContext, removeModelContext } from './helpers';

/**
 * A package a person brings, reviewed with the same seven tools, the same states
 * and the same rules as the bundled sample. Every test declares which world it
 * runs in: `installModelContext` for a browser with an agent, `removeModelContext`
 * for one without. Nothing here relies on what the runner happens to expose.
 */

const EMAIL = 'Bay cover quote\n\nPlease quote 240 bay covers to the attached sheet.\n\nDelivery is four weeks from order.';
const SPEC = '1. Purpose\n\nFabricate and deliver 240 bay covers.\n\n2. Material\n\nAluminium 5052-H32, 2 mm.\n\n3. Finish\n\nClear anodised.';
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAYAAADED76LAAAAhUlEQVR4nBXKMREAQQjAwFOCEpSghDIqUIISDOXnt973HsbDfFgP++E83If38L3ACMzACuzACdzAiz8kRmImVmInTuImXv6hMAqzsAq7cAq38OoPjdGYjdXYjdO4jdd/GIzBHKzBHpzBHbz5w2Is5mIt9uIs7uLtHw7jMA/rsA/ncA/v8AOKIpRBFTqJEgAAAABJRU5ErkJggg==',
  'base64',
);

const problems = (page: Page) => (page as Page & { p5Problems: string[] }).p5Problems;

/* The browser's own notice that a preloaded font was not used within a few
   seconds of load. It is timing, not a defect, and only the longer tests here
   run long enough to see it. */
const PRELOAD_NOTICE = /was preloaded using link preload but not used/;

test.beforeEach(async ({ page }) => {
  const found: string[] = [];
  page.on('console', message => {
    if (['error', 'warning'].includes(message.type()) && !PRELOAD_NOTICE.test(message.text())) found.push(message.text());
  });
  page.on('pageerror', error => found.push(error.message));
  Object.assign(page, { p5Problems: found });
});

test.afterEach(async ({ page }) => { expect(problems(page)).toEqual([]); });

const dialog = (page: Page) => page.locator('dialog.dialog:not(.dialog--confirm)');
/** Every field is asked for inside the dialog: the page has its own Drawing. */
const field = (page: Page, name: string) => dialog(page).getByLabel(name, { exact: true });

interface Fields { reference?: string; customer?: string; email?: string; spec?: string; drawing?: boolean }

async function openPackage(page: Page, fields: Fields = {}): Promise<void> {
  // Once a session is under way the way in moves from the strip to the log.
  const opener = page.getByRole('button', { name: /Open (your own|another) package/ });
  if (await opener.count() === 0) await page.getByRole('button', { name: /entr(y|ies)$/ }).click();
  await opener.click();
  await expect(dialog(page)).toBeVisible();
  if (fields.reference !== undefined) await field(page, 'Reference').fill(fields.reference);
  if (fields.customer !== undefined) await field(page, 'Customer').fill(fields.customer);
  if (fields.email !== undefined) await field(page, 'Customer email').fill(fields.email);
  if (fields.spec !== undefined) await field(page, 'Specification').fill(fields.spec);
  if (fields.drawing) {
    await field(page, 'Drawing').setInputFiles({ name: 'sheet.png', mimeType: 'image/png', buffer: PNG });
    await expect(dialog(page).locator('.dialog__file-name')).toHaveText('sheet.png');
  }
  await page.getByRole('button', { name: 'Open package' }).click();
  await expect(dialog(page)).toBeHidden();
}

const tabNames = async (page: Page) => page.locator('.source-pane [role="tab"]').allTextContents();

test('a package a person pastes opens into the same review', async ({ page }) => {
  await installModelContext(page);
  await page.goto('/');
  await openPackage(page, { reference: 'RFQ 91-2201', customer: 'Ridgeway Panels', email: EMAIL, spec: SPEC, drawing: true });

  await expect(page.locator('.header__package')).toHaveText('RFQ 91-2201 · Ridgeway Panels');
  await expect(page.locator('.status-strip__intro'))
    .toContainText('This page holds your package RFQ 91-2201: email, spec and drawing.');
  await expect(page.locator('.field-row')).toHaveCount(11);
  await expect(page.locator('.field-row__badge').filter({ hasText: 'Not extracted' })).toHaveCount(11);
  await expect(page.locator('#source-panel-email')).toContainText('Please quote 240 bay covers to the attached sheet.');
  await expect(page.locator('#source-panel-email')).toContainText('Delivery is four weeks from order.');
  // The roster is the package's business, not the tool layer's.
  expect(await page.evaluate(() => Object.keys((window as unknown as { __spotcheckTools: object }).__spotcheckTools).length)).toBe(6);
});

test('the tools read the package a person opened, section by section', async ({ page }) => {
  await installModelContext(page);
  await page.goto('/');
  await openPackage(page, { reference: 'RFQ 91-2201', email: EMAIL, spec: SPEC, drawing: true });

  const index = await executeTool(page, 'list_rfq_documents', {}) as { documents: { id: string }[] };
  expect(index.documents.map(document => document.id)).toEqual(['email', 'spec', 'drawing']);
  expect(JSON.stringify(index).length).toBeLessThan(1500);

  expect(await executeTool(page, 'read_document', { doc_id: 'spec', section_id: 's2' })).toMatchObject({
    regions: [{ id: 'spec:s2.0', text: '2. Material' }, { id: 'spec:s2.1', text: 'Aluminium 5052-H32, 2 mm.' }],
  });
  expect(await executeTool(page, 'propose_field', {
    field_id: 'part_name', value: 'Bay cover', source_refs: ['spec:s1.1'], rationale: 'The purpose section names the part.',
  })).toMatchObject({ ok: true, state: 'needs_review' });
  expect(await executeTool(page, 'report_missing', {
    field_id: 'drawing_number', searched: ['drawing:overall'],
  })).toMatchObject({ ok: true, state: 'missing' });

  // The provenance link lands on the region it names.
  await page.locator('[data-field-id="part_name"]').getByRole('link', { name: 'spec §1.1' }).click();
  await expect(page.locator('#spec\\:s1\\.1')).toHaveClass(/document-region--highlighted/);
});

test('a package with no specification is read from its drawing, and cited to the whole sheet', async ({ page }) => {
  await installModelContext(page);
  await page.goto('/');
  await openPackage(page, { reference: 'RFQ 91-2201', email: EMAIL, drawing: true });

  const index = await executeTool(page, 'list_rfq_documents', {}) as { documents: { id: string }[] };
  expect(index.documents.map(document => document.id)).toEqual(['email', 'drawing']);
  expect(await executeTool(page, 'read_document', { doc_id: 'drawing', section_id: 'overall' })).toMatchObject({
    regions: [{ id: 'drawing:sheet' }], sheet: '1 of 1',
  });
  expect(await executeTool(page, 'propose_field', {
    field_id: 'overall_dimensions', value: '240 × 120', unit: 'mm', source_refs: ['drawing:sheet'],
  })).toMatchObject({ ok: true, state: 'needs_review' });

  await page.locator('[data-field-id="overall_dimensions"]').getByRole('link', { name: 'drawing sheet' }).click();
  const box = page.locator('.drawing-overlay--active');
  await expect(box).toBeVisible();
  expect(await box.evaluate(element => [element.style.left, element.style.top, element.style.width, element.style.height]))
    .toEqual(['0%', '0%', '100%', '100%']);
  await expect(page.locator('.drawing-sheet__caption')).toHaveText('Image only · no text is read from this sheet');
});

test('the tab set holds only the documents the package carries', async ({ page }) => {
  await installModelContext(page);
  await page.goto('/');
  expect(await tabNames(page)).toEqual(['Email', 'Spec', 'Drawing']);

  await openPackage(page, { reference: 'RFQ 91-2201', email: EMAIL, drawing: true });
  expect(await tabNames(page)).toEqual(['Email', 'Drawing']);
  await expect(page.locator('#source-panel-spec')).toHaveCount(0);

  await openPackage(page, { reference: 'RFQ 91-2202', email: EMAIL, spec: SPEC });
  expect(await tabNames(page)).toEqual(['Email', 'Spec']);
  await expect(page.locator('#source-panel-drawing')).toHaveCount(0);
  // The Email and Spec tabs stand alone: no drawing panel renders under them.
  await expect(page.locator('.drawing-sheet')).toHaveCount(0);
  await page.getByRole('tab', { name: 'Spec' }).click();
  await expect(page.locator('.drawing-sheet')).toHaveCount(0);
});

test('the drawing keeps P4’s zoom, scrolling inside its own region', async ({ page }) => {
  await installModelContext(page);
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/');
  await openPackage(page, { reference: 'RFQ 91-2201', email: EMAIL, drawing: true });
  await page.getByRole('tab', { name: 'Drawing' }).click();
  await page.locator('.segmented__option', { hasText: '2×' }).click();

  const scroll = page.locator('.drawing-sheet__scroll');
  expect(await scroll.evaluate(element => element.scrollWidth > element.clientWidth)).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});

test('a big image is re-encoded small enough to keep, and a file of another type is refused', async ({ page }) => {
  await installModelContext(page);
  await page.goto('/');
  await page.getByRole('button', { name: 'Open your own package' }).click();
  await field(page, 'Reference').fill('RFQ 91-2201');
  await field(page, 'Customer email').fill(EMAIL);

  await field(page, 'Drawing').setInputFiles({ name: 'page.heic', mimeType: 'image/heic', buffer: PNG });
  await expect(dialog(page).getByText('Choose a PNG, JPEG or WebP. A screenshot of the PDF page works')).toBeVisible();

  // A photograph of a drawing: a 5,000 x 3,500 sheet with a band of noise that
  // PNG cannot compress away, sized to land between the 8 MB the review asks
  // for and the 10 MB the dialog refuses.
  const big = await page.evaluate(async () => {
    const canvas = document.createElement('canvas');
    canvas.width = 5_000;
    canvas.height = 3_500;
    const context = canvas.getContext('2d')!;
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    const noise = context.createImageData(1_700, 1_400);
    for (let index = 0; index < noise.data.length; index += 4) {
      noise.data[index] = Math.random() * 255;
      noise.data[index + 1] = Math.random() * 255;
      noise.data[index + 2] = Math.random() * 255;
      noise.data[index + 3] = 255;
    }
    context.putImageData(noise, 0, 0);
    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png'));
    const file = new File([blob!], 'photo.png', { type: 'image/png' });
    const transfer = new DataTransfer();
    transfer.items.add(file);
    const input = document.querySelector<HTMLInputElement>('dialog.dialog input[type="file"]')!;
    input.files = transfer.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
    return blob!.size;
  });
  expect(big).toBeGreaterThan(8 * 1024 * 1024);
  expect(big).toBeLessThan(10 * 1024 * 1024);

  await expect(dialog(page).locator('.dialog__file-name')).toHaveText('photo.png');
  await page.getByRole('button', { name: 'Open package' }).click();
  await expect(dialog(page)).toBeHidden();

  const stored = await page.evaluate(() => localStorage.getItem('spotcheck.package.v1'));
  expect(stored).not.toBeNull();
  expect(stored!.length).toBeLessThan(2 * 1024 * 1024);
});

test('a browser with no room keeps the package for the visit and says so', async ({ page }) => {
  await installModelContext(page);
  await page.addInitScript(() => {
    const setItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function patched(key: string, value: string) {
      if (key.startsWith('spotcheck.package')) throw new Error('QuotaExceededError');
      return setItem.call(this, key, value);
    };
  });
  await page.goto('/');
  await openPackage(page, { reference: 'RFQ 91-2201', email: EMAIL, spec: SPEC });

  await expect(page.locator('.live-region')).toContainText('Package opened for this visit only');
  await expect(page.locator('.status-strip__notice')).toContainText('the browser has no room to keep it');
  await expect(page.locator('.header__package')).toHaveText('RFQ 91-2201');
});

test('the dialog names every reason it will not open, and gives the first one the focus', async ({ page }) => {
  await installModelContext(page);
  await page.goto('/');
  await page.getByRole('button', { name: 'Open your own package' }).click();
  await field(page, 'Customer email').fill(EMAIL);
  await field(page, 'Drawing').setInputFiles({
    name: 'huge.png', mimeType: 'image/png', buffer: Buffer.alloc(12 * 1024 * 1024),
  });
  await expect(dialog(page).getByText('Choose an image under 10 MB')).toBeVisible();
  await page.getByRole('button', { name: 'Open package' }).click();

  // The scrim is the element's own backdrop, and the one alpha the palette allows.
  await page.waitForTimeout(400);
  expect(await dialog(page).evaluate(element => getComputedStyle(element, '::backdrop').backgroundColor))
    .toMatch(/0\.32\)$/);

  await expect(dialog(page).getByText('Enter a reference')).toBeVisible();
  await expect(field(page, 'Reference')).toBeFocused();
  await expect(dialog(page)).toBeVisible();

  await field(page, 'Reference').fill('RFQ 91-2201');
  await field(page, 'Drawing').setInputFiles([]);
  await page.getByRole('button', { name: 'Open package' }).click();
  await expect(dialog(page).getByText('Add the specification or a drawing')).toBeVisible();
  await expect(field(page, 'Specification')).toBeFocused();

  // Esc is the element's own: the dialog closes and the button that opened it
  // takes the focus back.
  await page.keyboard.press('Escape');
  await expect(dialog(page)).toBeHidden();
  await expect(page.getByRole('button', { name: 'Open your own package' })).toBeFocused();
});

test('pasted markup reaches the screen as text, never as HTML', async ({ page }) => {
  await installModelContext(page);
  await page.goto('/');
  await openPackage(page, {
    reference: 'RFQ 91-2201',
    email: 'Bay cover quote\n\n<img onerror=alert(1) src=x> and <b>bold</b>',
    spec: SPEC,
  });

  await expect(page.locator('#source-panel-email')).toContainText('<img onerror=alert(1) src=x> and <b>bold</b>');
  await expect(page.locator('#source-panel-email b')).toHaveCount(0);
  await expect(page.locator('#source-panel-email img')).toHaveCount(0);
});

test('the package and its review come back after a reload, and the sample can take the page back', async ({ page }) => {
  await installModelContext(page);
  await page.goto('/');
  await openPackage(page, { reference: 'RFQ 91-2201', email: EMAIL, spec: SPEC });
  await executeTool(page, 'propose_field', { field_id: 'part_name', value: 'Bay cover', source_refs: ['spec:s1.1'] });
  await executeTool(page, 'propose_field', { field_id: 'material', value: 'Aluminium 5052-H32', source_refs: ['spec:s2.1'] });

  await page.reload();
  await expect(page.locator('.header__package')).toHaveText('RFQ 91-2201');
  await expect(page.locator('[data-field-id="part_name"]')).toContainText('Bay cover');
  await expect(page.locator('[data-field-id="material"]')).toContainText('Aluminium 5052-H32');

  await page.getByRole('button', { name: /entr(y|ies)$/ }).click();
  await page.getByRole('button', { name: /Open (your own|another) package/ }).click();
  await expect(dialog(page)).toBeVisible();
  await page.getByRole('button', { name: 'Use the sample package' }).click();
  await expect(page.locator('.header__package')).toHaveText('RFQ 26-0812 · Tarrowline Console Systems');
  await expect(page.locator('.field-row__badge').filter({ hasText: 'Not extracted' })).toHaveCount(11);
  expect(await page.evaluate(() => localStorage.getItem('spotcheck.package.v1'))).toBeNull();
});

test('the sample recording runs over its own package and gives the person’s back', async ({ page }) => {
  // The recording plays at its own pace; this one watches it through.
  test.setTimeout(120_000);
  await installModelContext(page);
  await page.goto('/');
  await openPackage(page, { reference: 'RFQ 91-2201', email: EMAIL, spec: SPEC });
  await executeTool(page, 'propose_field', { field_id: 'part_name', value: 'Bay cover', source_refs: ['spec:s1.1'] });
  await executeTool(page, 'propose_field', { field_id: 'material', value: 'Aluminium 5052-H32', source_refs: ['spec:s2.1'] });

  await page.getByRole('button', { name: /entr(y|ies)$/ }).click();
  await page.getByRole('button', { name: 'Play sample session', exact: true }).click();
  await expect(page.locator('.header__package')).toHaveText('RFQ 26-0812 · Tarrowline Console Systems');
  await expect(page.getByRole('group', { name: 'Replay controls' })).toContainText('finished', { timeout: 90_000 });
  // The recording cites the sample's own regions, so none of them is unknown.
  // (The one rejection the recording does carry is its scripted FIELD_LOCKED.)
  const log = await page.locator('.confirm-summary__log').innerText();
  expect(log).not.toMatch(/INVALID_SOURCE_REF|UNKNOWN_DOCUMENT|UNKNOWN_SECTION/);

  await page.getByRole('button', { name: 'Start over' }).click();
  await expect(page.locator('.header__package')).toHaveText('RFQ 91-2201');
  await expect(page.locator('[data-field-id="part_name"]')).toContainText('Bay cover');
  await expect(page.locator('[data-field-id="material"]')).toContainText('Aluminium 5052-H32');
});

for (const width of [1920, 390]) {
  test(`${width}px: leaving the sample gives back the page it started from`, async ({ page }) => {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1080 });
    await removeModelContext(page);
    await page.goto('/');
    await page.getByRole('button', { name: 'Play sample session', exact: true }).click();
    const row = page.getByRole('group', { name: 'Replay controls' });
    await row.getByRole('button', { name: 'Pause' }).click();
    await expect(row.getByRole('button', { name: 'Restart' })).toHaveCount(0);
    await row.getByRole('button', { name: 'Leave sample' }).click();

    await expect(row).toHaveCount(0);
    await expect(page.locator('.status-strip')).toHaveClass(/status-strip--no-api/);
    await expect(page.locator('.field-row')).toHaveCount(11);
    await expect(page.locator('.field-list__group-heading')).toHaveCount(0);
    await expect(page.locator('.change-log')).toContainText('No activity yet');
    await expect(page.getByRole('button', { name: 'Play sample session', exact: true })).toBeFocused();
    await expect(page.locator('.live-region')).toContainText('Sample session closed');

    await page.reload();
    await expect(page.getByRole('group', { name: 'Replay controls' })).toHaveCount(0);
    await expect(page.locator('.change-log')).toContainText('No activity yet');
  });
}

test('Start over during a live session asks first, and clears the page on the second word', async ({ page }) => {
  await installModelContext(page);
  await page.goto('/');
  for (const [id, value, ref] of [
    ['part_name', 'KVM mount bracket', 'spec:s1.1'],
    ['material', '6061-T6', 'spec:s3.1'],
    ['quantity', '800', 'spec:s1.1'],
  ] as const) {
    await executeTool(page, 'propose_field', { field_id: id, value, source_refs: [ref] });
  }
  await page.getByRole('button', { name: /entr(y|ies)$/ }).click();
  const startOver = page.locator('.change-log__header').getByRole('button', { name: 'Start over' });
  await startOver.click();
  const confirm = page.locator('dialog.dialog--confirm');
  await expect(confirm).toContainText('This discards 3 entries and every value on the page.');

  await confirm.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.locator('[data-field-id="part_name"]')).toContainText('KVM mount bracket');

  await startOver.click();
  await confirm.getByRole('button', { name: 'Start over' }).click();
  await expect(page.locator('.field-row__badge').filter({ hasText: 'Not extracted' })).toHaveCount(11);
  await expect(page.locator('.change-log')).toContainText('No activity yet');
  await expect(page.locator('.live-region')).toContainText('Review cleared');
});

test('the first load carries no group heading, and the first proposal brings two', async ({ page }) => {
  await installModelContext(page);
  await page.goto('/');
  await expect(page.locator('.field-list__group-heading')).toHaveCount(0);

  await executeTool(page, 'propose_field', { field_id: 'part_name', value: 'KVM mount bracket', source_refs: ['spec:s1.1'] });
  await expect(page.locator('.field-list__group-heading')).toHaveCount(2);
});

test('390px: no agent, no own-package button in the strip; the log sheet carries it', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await removeModelContext(page);
  await page.goto('/');

  await expect(page.locator('.status-strip').getByRole('button', { name: /package/ })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Play sample session', exact: true })).toBeVisible();

  await page.getByRole('button', { name: /entr(y|ies)$/ }).click();
  const open = page.locator('.change-log__sheet').getByRole('button', { name: 'Open your own package' });
  await expect(open).toBeVisible();
  expect((await open.boundingBox())!.height).toBeGreaterThanOrEqual(44);
});

test('390px: with an agent the strip carries the button full width, and the dialog is a sheet', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await installModelContext(page);
  await page.goto('/');

  const strip = (await page.locator('.status-strip').boundingBox())!;
  const button = page.locator('.status-strip__actions').getByRole('button', { name: 'Open your own package' });
  const box = (await button.boundingBox())!;
  expect(box.height).toBeGreaterThanOrEqual(44);
  expect(box.width).toBeCloseTo(strip.width - 56, 0);

  await button.click();
  const sheet = (await dialog(page).boundingBox())!;
  expect(sheet.height).toBeCloseTo(844, 0);
  expect(sheet.width).toBeCloseTo(390, 0);
  for (const control of await dialog(page).locator('.button').all()) {
    expect((await control.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});

// Human-speed evidence: every state the review asks for, at both widths, and the
// states where a component the change touched must be absent.
for (const width of [1920, 390]) {
  test(`${width}px evidence`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1080 });
    await installModelContext(page);
    await page.goto('/');
    await mkdir('docs/qa/p5', { recursive: true });
    const shot = async (name: string) => {
      await page.evaluate(() => document.fonts.ready);
      const path = `docs/qa/p5/${name}-${width}.png`;
      await page.screenshot({ path, animations: 'disabled' });
      await testInfo.attach(`${name}-${width}`, { path, contentType: 'image/png' });
    };

    await shot('first-load-no-heading');
    await page.getByRole('button', { name: 'Open your own package' }).click();
    await shot('dialog-empty');
    await page.getByRole('button', { name: 'Open package' }).click();
    await shot('dialog-validation');
    await field(page, 'Reference').fill('RFQ 91-2201');
    await field(page, 'Customer').fill('Ridgeway Panels');
    await field(page, 'Customer email').fill(EMAIL);
    await field(page, 'Specification').fill(SPEC);
    await field(page, 'Drawing').setInputFiles({ name: 'sheet.png', mimeType: 'image/png', buffer: PNG });
    // Filling scrolled the form to the field last touched; the shot is of the
    // whole form, so it goes back to the top first.
    await dialog(page).locator('.dialog__form').evaluate(form => { form.scrollTop = 0; });
    await shot('dialog-filled');
    await page.getByRole('button', { name: 'Open package' }).click();
    await expect(dialog(page)).toBeHidden();
    await shot('package-open-all-three');

    if (width === 1920) {
      await page.getByRole('tab', { name: 'Drawing' }).click();
      await shot('drawing-whole-sheet');
      await page.getByRole('tab', { name: 'Email' }).click();
    }

    await openPackage(page, { reference: 'RFQ 91-2202', email: EMAIL, spec: SPEC });
    await shot('no-drawing-tab');
    await openPackage(page, { reference: 'RFQ 91-2203', email: EMAIL, drawing: true });
    await shot('no-spec-tab');

    if (width === 390) {
      // On one column the source opens as a sheet, and a provenance link is the
      // way in: the whole-sheet box and its caption, at the narrow width.
      await executeTool(page, 'propose_field', {
        field_id: 'overall_dimensions', value: '240 × 120', unit: 'mm', source_refs: ['drawing:sheet'],
      });
      await page.locator('[data-field-id="overall_dimensions"]').getByRole('link', { name: 'drawing sheet' }).click();
      await expect(page.locator('.drawing-sheet')).toBeVisible();
      await shot('drawing-whole-sheet');
      await page.locator('.source-pane--sheet').getByRole('button', { name: 'Close' }).click();
    }

    await executeTool(page, 'propose_field', { field_id: 'part_name', value: 'Bay cover', source_refs: ['email:p1'] });
    await page.getByRole('button', { name: /entr(y|ies)$/ }).click();
    await page.locator('.change-log__header').getByRole('button', { name: 'Start over' }).click();
    await shot('start-over-dialog');
    await page.locator('dialog.dialog--confirm').getByRole('button', { name: 'Cancel' }).click();
  });
}
