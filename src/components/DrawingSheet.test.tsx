// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { DrawingSheet } from './DrawingSheet';

const scrollIntoView = vi.fn();

beforeEach(() => {
  scrollIntoView.mockClear();
  Element.prototype.scrollIntoView = scrollIntoView;
});

afterEach(cleanup);

const figure = (container: HTMLElement) => container.querySelector('.drawing-sheet')!;
const boxGeometry = (container: HTMLElement) =>
  [...container.querySelectorAll<HTMLElement>('.drawing-overlay')]
    .map(box => [box.style.left, box.style.top, box.style.width, box.style.height].join(' '));

describe('the drawing zoom control', () => {
  test('the toolbar carries the sheet name and a Zoom radio group that opens on 1×', () => {
    render(<DrawingSheet onActivateRegion={vi.fn()} />);

    expect(screen.getByText('Sheet 1 of 4')).toBeInTheDocument();
    const group = screen.getByRole('radiogroup', { name: 'Zoom' });
    expect(group).toBeInTheDocument();
    // Speech gets "Zoom 1x"; the eye gets the real multiplication sign.
    const one = screen.getByRole('radio', { name: 'Zoom 1x' });
    const two = screen.getByRole('radio', { name: 'Zoom 2x' });
    expect(one).toBeChecked();
    expect(two).not.toBeChecked();
    expect(group).toHaveTextContent('1×');
    expect(group).toHaveTextContent('2×');
  });

  test('the sheet carries its own scroll region between the toolbar and the caption', () => {
    const { container } = render(<DrawingSheet onActivateRegion={vi.fn()} />);
    // The scroll region is a tab stop with a role and a name of its own, so the
    // keyboard can pan the sheet and speech can announce what it panned; a name
    // on a role-less element is not exposed at all. The tab panel carries none.
    const scroll = screen.getByRole('group', { name: 'Drawing sheet, scrollable' });

    expect(scroll).toHaveClass('drawing-sheet__scroll');
    expect(scroll).toHaveAttribute('tabindex', '0');
    expect(scroll.querySelector('.drawing-sheet__image-wrap')).toBeInTheDocument();
    // The toolbar and the caption sit outside it, so they never pan with the sheet.
    expect([...figure(container).children].map(child => child.className)).toEqual([
      'drawing-sheet__toolbar',
      'drawing-sheet__scroll',
      'drawing-sheet__caption',
    ]);
  });

  test('choosing 2× puts the zoom modifier on the figure and 1× takes it off again', () => {
    const { container } = render(<DrawingSheet onActivateRegion={vi.fn()} />);
    expect(figure(container)).not.toHaveClass('drawing-sheet--zoom-2');

    fireEvent.click(screen.getByRole('radio', { name: 'Zoom 2x' }));
    expect(figure(container)).toHaveClass('drawing-sheet--zoom-2');

    fireEvent.click(screen.getByRole('radio', { name: 'Zoom 1x' }));
    expect(figure(container)).not.toHaveClass('drawing-sheet--zoom-2');
  });

  test('the boxes stay in percentages of the wrap, so zoom never rewrites their geometry', () => {
    const { container } = render(<DrawingSheet onActivateRegion={vi.fn()} />);
    const before = boxGeometry(container);
    expect(before.length).toBeGreaterThan(0);
    expect(before.every(box => box.split(' ').every(value => value.endsWith('%')))).toBe(true);

    fireEvent.click(screen.getByRole('radio', { name: 'Zoom 2x' }));
    expect(boxGeometry(container)).toEqual(before);
  });

  test('a zoom change and a new highlight both bring the active box into view, centered', () => {
    const { rerender } = render(
      <DrawingSheet highlightedRef="drawing:width" onActivateRegion={vi.fn()} />,
    );
    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: 'auto', block: 'center', inline: 'center' });

    scrollIntoView.mockClear();
    fireEvent.click(screen.getByRole('radio', { name: 'Zoom 2x' }));
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    expect(scrollIntoView.mock.contexts[0] as Element).toHaveClass('drawing-overlay--active');
    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: 'auto', block: 'center', inline: 'center' });

    scrollIntoView.mockClear();
    rerender(<DrawingSheet highlightedRef="drawing:height" onActivateRegion={vi.fn()} />);
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    expect((scrollIntoView.mock.contexts[0] as Element).getAttribute('aria-label')).toContain('Height');
  });

  test('nothing scrolls while no box is highlighted', () => {
    render(<DrawingSheet onActivateRegion={vi.fn()} />);
    fireEvent.click(screen.getByRole('radio', { name: 'Zoom 2x' }));
    expect(scrollIntoView).not.toHaveBeenCalled();
  });

  test('the caption keeps the title-area line and the clickable-regions note, and drops the sheet number', () => {
    const { container } = render(<DrawingSheet onActivateRegion={vi.fn()} />);
    const caption = container.querySelector('.drawing-sheet__caption')!;

    expect(caption).toHaveTextContent('a revision letter would live here; there is none');
    expect(caption).toHaveTextContent('regions are clickable');
    expect(caption.textContent).not.toContain('Sheet 1 of 4');
  });
});

describe('the toolbar type scale', () => {
  const componentsCss = readFileSync('src/styles/components.css', 'utf8');

  /** Every font-size token the stylesheet gives a selector, in source order. */
  const sizeTokens = (selector: string): string[] => componentsCss.split('}').flatMap(rule => {
    const parts = rule.split('{');
    if (parts.length < 2) return [];
    const heads = parts[parts.length - 2]!.split(',').map(head => head.trim());
    if (!heads.includes(selector)) return [];
    const size = parts[parts.length - 1]!.match(/font-size:\s*var\((--text-[a-z-]+)\)/);
    return size ? [size[1]!] : [];
  });

  test('the Zoom micro-label is sm, the step export 17 measures', () => {
    expect(sizeTokens('.drawing-sheet__zoom-label')).toEqual(['--text-sm']);
  });
});
