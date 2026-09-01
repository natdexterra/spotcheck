// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { createInitialState, type ReviewSession } from '../state/session';
import { replaceState } from '../state/store';
import { StatusStrip } from './StatusStrip';

afterEach(() => {
  cleanup();
  act(() => replaceState(createInitialState()));
});

describe('StatusStrip', () => {
  test('selects no-api and offers the primary sample action', () => {
    const onPlay = vi.fn();
    render(<StatusStrip apiAvailable={false} onPlaySample={onPlay} />);
    fireEvent.click(screen.getByRole('button', { name: 'Play sample session' }));
    expect(screen.getByText(/WebMCP-capable desktop browser/)).toBeInTheDocument();
    expect(onPlay).toHaveBeenCalledOnce();
  });

  test('selects waiting when the API is present without calls', () => {
    render(<StatusStrip apiAvailable />);
    expect(screen.getByText('Waiting for your agent.')).toBeInTheDocument();
    expect(screen.getByText('Extract this RFQ into a quote request')).toBeInTheDocument();
  });

  test('shows live roster counts and the last rejection code', () => {
    const initial = createInitialState();
    const fields = initial.fields.map(field => field.id === 'quantity' ? { ...field, state: 'conflict' as const } : field);
    const session: ReviewSession = { confirmed: false, fields, log: [
      { actor: 'agent', at: 1, event: { actor: 'agent', action: { type: 'report_conflict', at: 1 } }, result: { ok: true } },
      { actor: 'agent', at: 2, event: { actor: 'agent', action: { type: 'report_conflict', at: 2 } }, result: { ok: false, code: 'FIELD_LOCKED' } },
    ] };
    act(() => replaceState(session));
    render(<StatusStrip apiAvailable />);
    expect(screen.getByText('7 tools · 2 calls')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Show tools/ }));
    expect(screen.getByText('FIELD_LOCKED')).toBeInTheDocument();
    expect(screen.getByText('2 calls')).toBeInTheDocument();
  });

  test('selects confirmed after the review is confirmed', () => {
    act(() => replaceState({ ...createInitialState(), confirmed: true }));
    render(<StatusStrip apiAvailable />);
    expect(screen.getByText('Confirmed')).toBeInTheDocument();
  });
});
