import { expect, test, type Page } from '@playwright/test';
import { executeTool, installModelContext } from './helpers';

/** Every test declares the agent API state it runs under before it navigates,
    so the strip, the replay controls and the screenshots are never left to the
    browser the run happens to use. */

/** Every test in this file also asserts the console stayed clean. */
const watchConsole = (page: Page): string[] => {
  const problems: string[] = [];
  page.on('console', message => {
    if (message.type() === 'error' || message.type() === 'warning') problems.push(message.text());
  });
  page.on('pageerror', error => problems.push(error.message));
  return problems;
};

const zoomTo = (page: Page, level: '1×' | '2×') =>
  page.locator('.segmented__option', { hasText: level }).click();

const geometry = (page: Page) => page.evaluate(() => {
  const panel = document.querySelector<HTMLElement>('.source-pane__panel--drawing')!;
  const scroller = document.querySelector<HTMLElement>('.drawing-sheet__scroll')!;
  const wrap = document.querySelector<HTMLElement>('.drawing-sheet__image-wrap')!;
  const panelStyle = getComputedStyle(panel);
  return {
    panelOverflowX: panelStyle.overflowX,
    panelOverflowY: panelStyle.overflowY,
    panelClientWidth: panel.clientWidth,
    panelScrollWidth: panel.scrollWidth,
    panelScrollHeight: panel.scrollHeight,
    panelClientHeight: panel.clientHeight,
    scrollerClientWidth: scroller.clientWidth,
    scrollerOffsetWidth: scroller.offsetWidth,
    scrollerScrollWidth: scroller.scrollWidth,
    scrollerClientHeight: scroller.clientHeight,
    scrollerScrollHeight: scroller.scrollHeight,
    wrapScrollWidth: wrap.scrollWidth,
    pageScrollWidth: document.documentElement.scrollWidth,
    pageClientWidth: document.documentElement.clientWidth,
  };
});

/** The rows that must never pan with the sheet. */
const rowRects = (page: Page) => page.evaluate(() => {
  const rect = (selector: string) => {
    const { x, y, width, height } = document.querySelector(selector)!.getBoundingClientRect();
    return { x: Math.round(x), y: Math.round(y), width: Math.round(width), height: Math.round(height) };
  };
  return { toolbar: rect('.drawing-sheet__toolbar'), caption: rect('.drawing-sheet__caption') };
});

const scrollBy = (page: Page, left: number, top: number) => page.evaluate(
  ({ left: x, top: y }) => {
    const scroller = document.querySelector<HTMLElement>('.drawing-sheet__scroll')!;
    scroller.scrollLeft = x;
    scroller.scrollTop = y;
  },
  { left, top },
);

/** Every panel in the source pane: what it says it is, and what room it takes. */
const panelBoxes = (page: Page) => page.evaluate(() => {
  const pane = document.querySelector<HTMLElement>('.source-pane')!;
  const rows = [...pane.children] as HTMLElement[];
  const panels = rows.filter(row => row.classList.contains('source-pane__panel'));
  return {
    panels: panels.map(panel => ({
      id: panel.id,
      hidden: panel.hasAttribute('hidden'),
      display: getComputedStyle(panel).display,
      height: Math.round(panel.getBoundingClientRect().height),
      scrollHeight: panel.scrollHeight,
    })),
    // The rows around the panels: tabs, and on the sheet a header and a footer.
    aroundHeight: Math.round(rows
      .filter(row => !row.classList.contains('source-pane__panel'))
      .reduce((total, row) => total + row.getBoundingClientRect().height, 0)),
    paneHeight: Math.round(pane.getBoundingClientRect().height),
  };
});

/** The one panel on show fills the column the other rows leave; no other panel
    takes a pixel, and every hidden one is display: none. */
const expectOnlyPanelShowing = (
  boxes: Awaited<ReturnType<typeof panelBoxes>>, id: string,
): void => {
  const showing = boxes.panels.filter(panel => panel.height > 0);
  expect(showing.map(panel => panel.id)).toEqual([id]);
  expect(boxes.panels.filter(panel => panel.hidden).map(panel => panel.display))
    .toEqual(boxes.panels.filter(panel => panel.hidden).map(() => 'none'));
  // Within the hairlines that close the rows around it.
  expect(Math.abs(showing[0]!.height - (boxes.paneHeight - boxes.aroundHeight)))
    .toBeLessThanOrEqual(2);
};

const seedDimensions = (page: Page) => executeTool(page, 'propose_field', {
  field_id: 'overall_dimensions',
  value: '20 × 14.5',
  source_refs: ['drawing:width', 'drawing:height', 'spec:s3.2'],
  rationale: 'The drawing states the dimensions and neither source names a unit.',
});

test.describe('drawing zoom', () => {
  test.use({ viewport: { width: 1920, height: 1080 } });

  test('2× doubles the sheet inside its own scroll region and never widens the page', async ({ page }) => {
    const problems = watchConsole(page);
    await installModelContext(page);
    await page.goto('/');
    await page.getByRole('tab', { name: 'Drawing' }).click();

    const one = await geometry(page);
    // 1×: the sheet fits the region, so nothing scrolls sideways.
    expect(one.scrollerScrollWidth).toBe(one.scrollerClientWidth);
    // The panel is a column, never a scroll container, at either zoom.
    expect(['auto', 'scroll']).not.toContain(one.panelOverflowX);
    expect(['auto', 'scroll']).not.toContain(one.panelOverflowY);
    expect(one.panelScrollWidth).toBe(one.panelClientWidth);
    await page.screenshot({ path: 'docs/qa/p4/drawing-zoom-1x-1920.png' });

    const atRest = await rowRects(page);
    await zoomTo(page, '2×');
    const two = await geometry(page);
    // At 2× the region runs to the panel edges, so 200% of its content width is
    // two panel widths less the room its own scrollbar takes.
    expect(two.scrollerOffsetWidth).toBe(two.panelClientWidth);
    expect(Math.abs(two.wrapScrollWidth - 2 * two.scrollerClientWidth)).toBeLessThanOrEqual(2);
    // The region is the scroll container — in both axes. The panel is not, and
    // neither is the page.
    expect(two.scrollerScrollWidth).toBeGreaterThan(two.scrollerClientWidth);
    expect(two.scrollerScrollHeight).toBeGreaterThan(two.scrollerClientHeight);
    expect(two.panelScrollWidth).toBe(two.panelClientWidth);
    expect(two.panelScrollHeight).toBe(two.panelClientHeight);
    expect(['auto', 'scroll']).not.toContain(two.panelOverflowX);
    expect(['auto', 'scroll']).not.toContain(two.panelOverflowY);
    expect(two.pageScrollWidth).toBe(two.pageClientWidth);

    // The toolbar and the caption keep the lane while the sheet pans under them.
    await scrollBy(page, 200, 200);
    expect(await rowRects(page)).toEqual(atRest);
    await scrollBy(page, 0, 0);

    // The boxes are percentages of the wrap, so they grow with it and the
    // dashed edge stays a 1px border rather than a scaled stroke.
    const box = await page.evaluate(() => {
      const overlay = document.querySelector<HTMLElement>('.drawing-overlay')!;
      const wrap = document.querySelector<HTMLElement>('.drawing-sheet__image-wrap')!;
      return {
        left: overlay.style.left,
        width: overlay.style.width,
        border: getComputedStyle(overlay).borderTopWidth,
        ratio: overlay.getBoundingClientRect().width / wrap.getBoundingClientRect().width,
        // No transition on the wrap: the zoom is a step, not a movement.
        transition: getComputedStyle(wrap).transitionDuration,
      };
    });
    expect(box.left).toBe('38%');
    expect(box.width).toBe('4.5%');
    expect(box.border).toBe('1px');
    expect(box.ratio).toBeCloseTo(0.045, 3);
    expect(box.transition).toBe('0s');

    await zoomTo(page, '1×');
    expect((await geometry(page)).scrollerScrollWidth).toBe(one.scrollerClientWidth);
    expect(problems).toEqual([]);
  });

  test('a provenance link brings its box into the scroll region at 2×', async ({ page }) => {
    test.setTimeout(60_000);
    const problems = watchConsole(page);
    await installModelContext(page);
    await page.clock.install();
    await page.goto('/');
    await page.getByRole('button', { name: 'Play sample session' }).click();
    await page.clock.runFor(22_500);

    const dimensions = page.locator('[data-field-id="overall_dimensions"]');
    await expect(dimensions).toContainText('20 × 14.5');
    await page.getByRole('tab', { name: 'Drawing' }).click();
    await zoomTo(page, '2×');

    const link = dimensions.getByRole('link', { name: 'drawing width' });
    await link.click();
    await expect(page.locator('.drawing-overlay--active')).toBeVisible();

    const inView = await page.evaluate(() => {
      const scroller = document.querySelector('.drawing-sheet__scroll')!;
      const region = scroller.getBoundingClientRect();
      const active = document.querySelector('.drawing-overlay--active')!.getBoundingClientRect();
      return {
        left: active.left >= region.left - 1,
        right: active.right <= region.right + 1,
        top: active.top >= region.top - 1,
        bottom: active.bottom <= region.bottom + 1,
        scrolled: scroller.scrollLeft,
      };
    });
    expect(inView.left && inView.right && inView.top && inView.bottom).toBe(true);
    expect(inView.scrolled).toBeGreaterThan(0);

    await page.screenshot({ path: 'docs/qa/p4/drawing-zoom-2x-1920.png' });
    expect(problems).toEqual([]);
  });

  test('the control is the only way to zoom: ctrl + wheel is left to the browser', async ({ page }) => {
    const problems = watchConsole(page);
    await installModelContext(page);
    await page.goto('/');
    await page.getByRole('tab', { name: 'Drawing' }).click();

    await page.locator('.drawing-sheet__image').dispatchEvent('wheel', {
      ctrlKey: true, deltaY: -240, bubbles: true, cancelable: true,
    });
    await page.locator('.drawing-sheet__image').dispatchEvent('wheel', { deltaY: 240, bubbles: true });

    await expect(page.getByRole('radio', { name: 'Zoom 1x' })).toBeChecked();
    await expect(page.getByRole('radio', { name: 'Zoom 2x' })).not.toBeChecked();
    const still = await geometry(page);
    expect(still.scrollerScrollWidth).toBe(still.scrollerClientWidth);
    expect(problems).toEqual([]);
  });

  test('arrow keys move between the segments and the scroll region scrolls from the keyboard', async ({ page }) => {
    const problems = watchConsole(page);
    await installModelContext(page);
    await page.goto('/');
    await page.getByRole('tab', { name: 'Drawing' }).click();

    await page.getByRole('radio', { name: 'Zoom 1x' }).focus();
    await page.keyboard.press('ArrowRight');
    await expect(page.getByRole('radio', { name: 'Zoom 2x' })).toBeChecked();
    await expect(page.getByRole('radio', { name: 'Zoom 2x' })).toBeFocused();

    // The scroll region follows the toolbar in the document, so it is the next
    // tab stop after the radio group — and it answers the arrows.
    await page.keyboard.press('Tab');
    const scroller = page.locator('.drawing-sheet__scroll');
    await expect(scroller).toBeFocused();

    await page.keyboard.press('ArrowDown');
    await expect.poll(() => scroller.evaluate(element => element.scrollTop)).toBeGreaterThan(0);

    // Back on the group, the arrows move the choice again.
    await page.getByRole('radio', { name: 'Zoom 2x' }).focus();
    await page.keyboard.press('ArrowLeft');
    await expect(page.getByRole('radio', { name: 'Zoom 1x' })).toBeChecked();
    expect(problems).toEqual([]);
  });

  test('the Drawing panel takes no room while another tab is on show', async ({ page }) => {
    const problems = watchConsole(page);
    await installModelContext(page);
    await page.goto('/');

    // Email is the tab the pane opens on: the sheet's rows must not render
    // under the letter, and the letter must keep the whole column.
    await expect(page.locator('.drawing-sheet__toolbar')).toBeHidden();
    await expect(page.locator('.drawing-sheet__scroll')).toBeHidden();
    // Out of the flow means out of the tab order and out of the tree with it.
    await expect(page.getByRole('radio', { name: 'Zoom 1x' })).toBeHidden();
    const onEmail = await panelBoxes(page);
    expectOnlyPanelShowing(onEmail, 'source-panel-email');
    const emailScrollHeight = onEmail.panels.find(panel => panel.id === 'source-panel-email')!.scrollHeight;

    await page.getByRole('tab', { name: 'Spec' }).click();
    await expect(page.locator('.drawing-sheet__toolbar')).toBeHidden();
    expectOnlyPanelShowing(await panelBoxes(page), 'source-panel-spec');

    await page.getByRole('tab', { name: 'Drawing' }).click();
    await expect(page.locator('.drawing-sheet__toolbar')).toBeVisible();
    await expect(page.locator('.drawing-sheet__scroll')).toBeVisible();
    expectOnlyPanelShowing(await panelBoxes(page), 'source-panel-drawing');

    // Back on the letter, nothing about it changed.
    await page.getByRole('tab', { name: 'Email' }).click();
    const back = await panelBoxes(page);
    expectOnlyPanelShowing(back, 'source-panel-email');
    expect(back.panels.find(panel => panel.id === 'source-panel-email')!.scrollHeight)
      .toBe(emailScrollHeight);
    expect(problems).toEqual([]);
  });

  test('reduced motion changes nothing: the zoom is instant either way', async ({ page }) => {
    const problems = watchConsole(page);
    await installModelContext(page);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    await page.getByRole('tab', { name: 'Drawing' }).click();
    await zoomTo(page, '2×');

    const motion = await page.evaluate(() => {
      const wrap = document.querySelector<HTMLElement>('.drawing-sheet__image-wrap')!;
      const style = getComputedStyle(wrap);
      return {
        running: wrap.getAnimations().length,
        transition: style.transitionDuration,
        animation: style.animationName,
        behavior: getComputedStyle(
          document.querySelector<HTMLElement>('.drawing-sheet__scroll')!,
        ).scrollBehavior,
      };
    });
    expect(motion.running).toBe(0);
    expect(motion.transition).toBe('0s');
    expect(motion.animation).toBe('none');
    expect(motion.behavior).toBe('auto');
    expect(problems).toEqual([]);
  });
});

test.describe('drawing zoom on the narrow sheet', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('the Drawing panel takes no room on the narrow sheet either', async ({ page }) => {
    const problems = watchConsole(page);
    await installModelContext(page);
    await page.goto('/');
    await seedDimensions(page);

    await page.locator('[data-field-id="overall_dimensions"]')
      .getByRole('link', { name: 'drawing width' }).click();
    await expect(page.locator('.source-pane--sheet')).toBeVisible();
    expectOnlyPanelShowing(await panelBoxes(page), 'source-panel-drawing');

    await page.getByRole('tab', { name: 'Email' }).click();
    await expect(page.locator('.drawing-sheet__toolbar')).toBeHidden();
    await expect(page.locator('.drawing-sheet__scroll')).toBeHidden();
    expectOnlyPanelShowing(await panelBoxes(page), 'source-panel-email');
    expect(problems).toEqual([]);
  });

  test('390px scrolls the sheet inside its own region and keeps 44px targets', async ({ page }) => {
    const problems = watchConsole(page);
    await installModelContext(page);
    await page.goto('/');
    await seedDimensions(page);

    await page.locator('[data-field-id="overall_dimensions"]')
      .getByRole('link', { name: 'drawing width' }).click();
    await expect(page.locator('.source-pane--sheet')).toBeVisible();

    // Narrow, every row of the sheet stands on the sheet's own 16px lane: the
    // sheet name and the caption line up with the tabs above them (export 17).
    const lane = await page.evaluate(() => {
      const left = (selector: string) =>
        Math.round(document.querySelector(selector)!.getBoundingClientRect().left);
      return {
        name: left('.drawing-sheet__name'),
        caption: left('.drawing-sheet__caption span'),
        tab: left('.source-pane__tab'),
      };
    });
    expect(lane.name).toBe(lane.tab);
    expect(lane.caption).toBe(lane.tab);

    await page.screenshot({ path: 'docs/qa/p4/drawing-zoom-1x-390.png' });
    await zoomTo(page, '2×');

    const metrics = await geometry(page);
    expect(metrics.scrollerOffsetWidth).toBe(metrics.panelClientWidth);
    expect(Math.abs(metrics.wrapScrollWidth - 2 * metrics.scrollerClientWidth)).toBeLessThanOrEqual(2);
    expect(metrics.scrollerScrollWidth).toBeGreaterThan(metrics.scrollerClientWidth);
    expect(metrics.panelScrollWidth).toBe(metrics.panelClientWidth);
    expect(metrics.pageScrollWidth).toBe(metrics.pageClientWidth);

    const segments = await page.locator('.segmented__option').evaluateAll(
      options => options.map(option => Math.round(option.getBoundingClientRect().height)),
    );
    expect(segments).toHaveLength(2);
    expect(Math.min(...segments)).toBeGreaterThanOrEqual(44);

    await expect(page.locator('.drawing-overlay--active')).toBeVisible();
    await page.screenshot({ path: 'docs/qa/p4/drawing-zoom-2x-390.png' });
    expect(problems).toEqual([]);
  });
});

test.describe('the focus ring where a container clips the box', () => {
  test.use({ viewport: { width: 1920, height: 1080 } });

  const ringStyle = (locator: ReturnType<Page['locator']>) => locator.evaluate(element => {
    const style = getComputedStyle(element);
    return {
      color: style.outlineColor,
      style: style.outlineStyle,
      width: style.outlineWidth,
      offset: style.outlineOffset,
    };
  });

  test('a keyboard focus on a segment paints a ring the eye can see', async ({ page }) => {
    const problems = watchConsole(page);
    await installModelContext(page);
    await page.goto('/');
    await page.getByRole('tab', { name: 'Drawing' }).click();

    // The zoom control: the checked segment is the group's tab stop, and the
    // ring has to paint on it, not outside the clipped group box.
    const zoom = page.locator('.drawing-sheet__zoom');
    const zoomAtRest = await zoom.screenshot();
    await page.getByRole('tab', { name: 'Drawing' }).focus();
    await page.keyboard.press('Tab');
    const first = page.getByRole('radio', { name: 'Zoom 1x' });
    await expect(first).toBeFocused();
    expect((await zoom.screenshot()).equals(zoomAtRest)).toBe(false);

    const segment = page.locator('.segmented__option').first();
    const zoomRing = await ringStyle(segment);
    expect(zoomRing.color).toBe('rgb(31, 111, 235)');
    expect(zoomRing.style).toBe('solid');
    expect(zoomRing.width).toBe('2px');
    // The ring is drawn inside the segment, so the group's box never clips it.
    const zoomPaint = await segment.evaluate(element => {
      const offset = parseFloat(getComputedStyle(element).outlineOffset);
      const width = parseFloat(getComputedStyle(element).outlineWidth);
      const group = element.parentElement!.getBoundingClientRect();
      const box = element.getBoundingClientRect();
      return {
        left: box.left + offset >= group.left - 1,
        right: box.right - offset <= group.right + 1,
        top: box.top + offset >= group.top - 1,
        bottom: box.bottom - offset <= group.bottom + 1,
        width,
      };
    });
    expect(zoomPaint).toEqual({ left: true, right: true, top: true, bottom: true, width: 2 });

    // The unit control in an open editor is the same drawing and takes the same ring.
    await seedDimensions(page);
    const dimensions = page.locator('[data-field-id="overall_dimensions"]');
    await dimensions.getByRole('button', { name: 'Add unit' }).click();
    const segments = dimensions.locator('.inline-editor__segments');
    const unitAtRest = await segments.screenshot();
    await dimensions.getByRole('textbox', { name: 'Overall dimensions' }).click();
    await page.keyboard.press('Tab');
    await expect(dimensions.locator('.inline-editor__segment input').first()).toBeFocused();
    expect((await segments.screenshot()).equals(unitAtRest)).toBe(false);
    expect(await ringStyle(dimensions.locator('.inline-editor__segment').first())).toEqual(zoomRing);

    expect(problems).toEqual([]);
  });

  test('the focused scroll region shows a ring on all four edges', async ({ page }) => {
    const problems = watchConsole(page);
    await installModelContext(page);
    await page.goto('/');
    await page.getByRole('tab', { name: 'Drawing' }).click();

    const scroller = page.locator('.drawing-sheet__scroll');
    const edge = await scroller.evaluate(element => {
      const { x, y, height } = element.getBoundingClientRect();
      // A three-pixel column on the region's left edge: the stroke the panel's
      // overflow used to cut away.
      return { x, y: y + height / 2 - 6, width: 3, height: 12 };
    });
    const regionAtRest = await scroller.screenshot();
    const leftAtRest = await page.screenshot({ clip: edge });

    await page.getByRole('radio', { name: 'Zoom 1x' }).focus();
    await page.keyboard.press('Tab');
    await expect(scroller).toBeFocused();

    expect((await scroller.screenshot()).equals(regionAtRest)).toBe(false);
    expect((await page.screenshot({ clip: edge })).equals(leftAtRest)).toBe(false);

    const ring = await ringStyle(scroller);
    expect(ring.color).toBe('rgb(31, 111, 235)');
    expect(ring.style).toBe('solid');
    expect(ring.width).toBe('2px');
    // Drawn inside the region's own rect, where nothing clips it.
    expect(parseFloat(ring.offset)).toBeLessThanOrEqual(0);
    expect(parseFloat(ring.offset)).toBeGreaterThanOrEqual(-parseFloat(ring.width));

    expect(problems).toEqual([]);
  });
});
