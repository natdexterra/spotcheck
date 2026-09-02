// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { samplePackage, setPackage, type DocumentData } from '../data/package';
import { buildPackage } from '../data/user-package';
import { createInitialState, type ReviewSession } from '../state/session';
import { replaceState } from '../state/store';
import { DrawingSheet } from './DrawingSheet';
import { EmailDoc } from './EmailDoc';
import { SourcePane } from './SourcePane';

const readingSession = (): ReviewSession => ({
  ...createInitialState(),
  log: [{
    actor: 'agent',
    at: 10,
    event: {
      actor: 'agent',
      action: {
        type: 'read',
        operation: 'section',
        input: { doc_id: 'spec', section_id: 's3' },
        at: 10,
      },
    },
  }],
});

afterEach(() => {
  cleanup();
  act(() => replaceState(createInitialState()));
  act(() => setPackage(samplePackage));
  vi.useRealTimers();
});

describe('source documents', () => {
  test('renders hostile document strings literally as text nodes', () => {
    const document: DocumentData = {
      id: 'email',
      type: 'email',
      sections: [{
        id: 'body',
        regions: [{ id: 'email:hostile', text: '<img src=x onerror="alert(1)">' }],
      }],
    };
    const { container } = render(
      <EmailDoc document={document} onActivateRegion={vi.fn()} />,
    );

    expect(screen.getByText('<img src=x onerror="alert(1)">')).toBeInTheDocument();
    expect(container.querySelector('img')).toBeNull();
  });

  test('switches to and highlights a provenance target, then focuses its field in reverse', () => {
    const onFocusField = vi.fn();
    render(
      <SourcePane
        onFocusField={onFocusField}
        target={{ ref: 'spec:s3.1', fieldId: 'material' }}
      />,
    );

    expect(screen.getByRole('tab', { name: 'Spec' })).toHaveAttribute('aria-selected', 'true');
    const region = screen.getByRole('button', { name: 'Focus field sourced from spec:s3.1' });
    expect(region).toHaveClass('document-region--highlighted');
    fireEvent.click(region);
    expect(onFocusField).toHaveBeenCalledWith('material');
  });

  test('a region that sources a field stays operable once the highlight has cleared', () => {
    const onFocusField = vi.fn();
    const initial = createInitialState();
    act(() => replaceState({
      ...initial,
      fields: initial.fields.map(field => field.id === 'material'
        ? {
          ...field,
          state: 'needs_review' as const,
          value: '6061-T6',
          proposal: { value: '6061-T6', source_refs: ['spec:s3.1'] },
        }
        : field),
    }));
    render(<SourcePane onFocusField={onFocusField} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Spec' }));

    const region = screen.getByRole('button', { name: 'Focus field sourced from spec:s3.1' });
    expect(region).not.toHaveClass('document-region--highlighted');
    expect(region).toHaveAttribute('tabindex', '0');
    fireEvent.click(region);
    expect(onFocusField).toHaveBeenCalledWith('material');
  });

  test('shows the reading marker and highlights the section from the latest read log', () => {
    act(() => replaceState(readingSession()));
    render(<SourcePane onFocusField={vi.fn()} />);

    // The label stays "Spec"; the reading marker is a separate dot with its own name.
    const tab = screen.getByRole('tab', { name: /^Spec/ });
    expect(tab).toHaveAttribute('aria-selected', 'true');
    expect(within(tab).getByRole('img', { name: 'reading' })).toBeInTheDocument();
    expect(tab).toHaveTextContent('Spec');
    expect(document.getElementById('spec:s3')).toHaveAttribute('data-reading', 'true');
  });

  test('clears the reading marker after two seconds and never relights it for a read that is over', () => {
    vi.useFakeTimers();
    const session = readingSession();
    act(() => replaceState(session));
    render(<SourcePane onFocusField={vi.fn()} />);
    expect(screen.getByRole('img', { name: 'reading' })).toBeInTheDocument();

    act(() => { vi.advanceTimersByTime(2_000); });
    expect(screen.queryByRole('img', { name: 'reading' })).toBeNull();
    expect(document.getElementById('spec:s3')).not.toHaveAttribute('data-reading', 'true');

    // A later unrelated update — the clarification tab arriving — must not
    // relight a marker for a read the agent finished long ago.
    const drafted: ReviewSession = {
      ...session,
      fields: session.fields.map(field => field.id === 'general_tolerance'
        ? { ...field, state: 'missing' as const, searched: { searched: ['drawing'] } }
        : field),
      draft: { subject: 'Open questions', body: 'Please confirm.', covers: ['general_tolerance'] },
    };
    act(() => replaceState(drafted));

    expect(screen.getByRole('tab', { name: 'Clarification' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.queryByRole('img', { name: 'reading' })).toBeNull();
  });

  test('quiet mode omits the injected email note', () => {
    render(<SourcePane onFocusField={vi.fn()} quiet />);
    expect(screen.queryByText(/ignore previous instructions/)).not.toBeInTheDocument();
    expect(document.getElementById('email:note')).toBeNull();
  });

  test('a panel with a display of its own still disappears when it is hidden', () => {
    render(<SourcePane onFocusField={vi.fn()} />);

    // The pane opens on the letter; every other panel is out of the flow, so
    // the sheet's toolbar never renders under the document on show.
    const drawing = document.getElementById('source-panel-drawing')!;
    expect(drawing).toHaveAttribute('hidden');
    expect(drawing).not.toBeVisible();
    expect(screen.queryByText('Zoom')).not.toBeVisible();
    expect(within(document.getElementById('source-panel-email')!).queryByText('Zoom')).toBeNull();

    // jsdom loads no stylesheet, and the browser's own [hidden] rule loses to
    // any author rule that gives the panel a display — so the guard is that the
    // stylesheet carries a [hidden] rule of its own.
    expect(readFileSync('src/styles/base.css', 'utf8'))
      .toMatch(/\[hidden\]\s*\{[^}]*display:\s*none\s*!important/);
  });

  test('the Drawing tab panel is a column, not a scroll container with a tab stop', () => {
    render(<SourcePane onFocusField={vi.fn()} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Drawing' }));

    // The sheet's own region is the scroll container and the only tab stop
    // around the drawing; a second one on the panel would trap the keyboard in
    // a box that never scrolls.
    const panel = document.getElementById('source-panel-drawing')!;
    expect(panel).not.toHaveAttribute('tabindex');
    expect(panel.querySelector('.drawing-sheet__scroll')).toHaveAttribute('tabindex', '0');
  });

  test('positions normalized drawing boxes as percentages and activates them', () => {
    const onActivateRegion = vi.fn();
    render(<DrawingSheet onActivateRegion={onActivateRegion} highlightedRef="drawing:width" />);

    const widthBox = screen.getByRole('button', { name: 'Width, 20.000' });
    expect(widthBox).toHaveStyle({
      left: '38%',
      top: '11.8%',
      width: '4.5%',
      height: '3.2%',
    });
    expect(widthBox).toHaveClass('drawing-overlay--active');
    fireEvent.click(widthBox);
    expect(onActivateRegion).toHaveBeenCalledWith('drawing:width');
    expect(screen.getByText('a revision letter would live here; there is none')).toBeInTheDocument();
    // The caption keeps the note; nothing in the sheet counts sheets.
    expect(screen.getByText('regions are clickable')).toBeInTheDocument();
    expect(screen.queryByText(/Sheet \d/)).toBeNull();
  });
});

test('the unsent marker stands before the tab name, not after it', () => {
  const initial = createInitialState();
  const drafted: ReviewSession = {
    ...initial,
    fields: initial.fields.map(item => item.id === 'general_tolerance'
      ? { ...item, state: 'missing' as const, searched: { searched: ['drawing'] } }
      : item),
    draft: { subject: 'Two questions', body: 'Please confirm.', covers: ['general_tolerance'] },
  };
  act(() => replaceState(drafted));
  render(<SourcePane onFocusField={vi.fn()} />);

  const tab = screen.getByRole('tab', { name: /Clarification/ });
  const dot = tab.querySelector('.source-pane__draft-dot')!;
  // Exports 07 and 13: the dot leads the name.
  expect(dot.compareDocumentPosition(tab.lastChild!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(dot.previousSibling).toBeNull();
});

describe('P5: the tab set comes from the package', () => {
  const tabNames = () => screen.getAllByRole('tab').map(tab => tab.textContent);

  test('the bundled sample shows all three documents', () => {
    render(<SourcePane onFocusField={vi.fn()} />);
    expect(tabNames()).toEqual(['Email', 'Spec', 'Drawing']);
  });

  test('a package with an email and a drawing has no Spec tab, and no Spec panel', () => {
    act(() => setPackage(buildPackage({
      reference: 'RFQ 91-2201', email: 'Subject\n\nBody.', drawing: 'data:image/webp;base64,AAAA',
    })));
    const { container } = render(<SourcePane onFocusField={vi.fn()} />);

    expect(tabNames()).toEqual(['Email', 'Drawing']);
    expect(container.querySelector('#source-panel-spec')).toBeNull();
  });

  test('a package with an email and a specification has no Drawing tab', () => {
    act(() => setPackage(buildPackage({
      reference: 'RFQ 91-2201', email: 'Subject\n\nBody.', spec: '1. Purpose\n\nMake it.',
    })));
    const { container } = render(<SourcePane onFocusField={vi.fn()} />);

    expect(tabNames()).toEqual(['Email', 'Spec']);
    expect(container.querySelector('#source-panel-drawing')).toBeNull();
  });

  test('a provenance link into a document the package does not hold moves nothing', () => {
    act(() => setPackage(buildPackage({ reference: 'RFQ 91-2201', email: 'Subject\n\nBody.' })));
    render(<SourcePane onFocusField={vi.fn()} target={{ ref: 'drawing:sheet', fieldId: 'overall_dimensions' }} />);

    expect(tabNames()).toEqual(['Email']);
    expect(screen.getByRole('tab', { name: 'Email' })).toHaveAttribute('aria-selected', 'true');
  });
});
