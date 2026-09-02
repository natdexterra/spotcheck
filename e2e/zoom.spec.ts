import { expect, test, type Page } from '@playwright/test';
import { executeTool, installModelContext } from './helpers';

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
  return {
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
    await page.goto('/');
    await page.getByRole('tab', { name: 'Drawing' }).click();

    const one = await geometry(page);
    // 1×: the sheet fits the region, so nothing scrolls sideways.
    expect(one.scrollerScrollWidth).toBe(one.scrollerClientWidth);
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

  test('reduced motion changes nothing: the zoom is instant either way', async ({ page }) => {
    const problems = watchConsole(page);
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

  test('390px scrolls the sheet inside its own region and keeps 44px targets', async ({ page }) => {
    const problems = watchConsole(page);
    await installModelContext(page);
    await page.goto('/');
    await seedDimensions(page);

    await page.locator('[data-field-id="overall_dimensions"]')
      .getByRole('link', { name: 'drawing width' }).click();
    await expect(page.locator('.source-pane--sheet')).toBeVisible();
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
