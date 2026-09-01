// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import type { DocumentData } from '../data/package';
import { createInitialState, type ReviewSession } from '../state/session';
import { replaceState } from '../state/store';
import { DrawingSheet } from './DrawingSheet';
import { EmailDoc } from './EmailDoc';
import { SourcePane } from './SourcePane';

afterEach(() => {
  cleanup();
  act(() => replaceState(createInitialState()));
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
    const initial = createInitialState();
    const session: ReviewSession = {
      ...initial,
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
    };
    act(() => replaceState(session));
    render(<SourcePane onFocusField={vi.fn()} />);

    // The label stays "Spec"; the reading marker is a separate dot with its own name.
    const tab = screen.getByRole('tab', { name: /^Spec/ });
    expect(tab).toHaveAttribute('aria-selected', 'true');
    expect(within(tab).getByRole('img', { name: 'reading' })).toBeInTheDocument();
    expect(tab).toHaveTextContent('Spec');
    expect(document.getElementById('spec:s3')).toHaveAttribute('data-reading', 'true');
  });

  test('quiet mode omits the injected email note', () => {
    render(<SourcePane onFocusField={vi.fn()} quiet />);
    expect(screen.queryByText(/ignore previous instructions/)).not.toBeInTheDocument();
    expect(document.getElementById('email:note')).toBeNull();
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
    expect(screen.getByText('Sheet 1 of 4 · regions are clickable')).toBeInTheDocument();
  });
});
