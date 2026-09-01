// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { act, cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, test } from 'vitest';
import { createInitialState, type LogEntry, type ReviewSession } from '../state/session';
import { getState, replaceState } from '../state/store';
import type { Field, ResolutionKind } from '../state/types';
import { ConfirmSummary } from './ConfirmSummary';

const resolve = (field: Field, kind: ResolutionKind, value: string = field.id): Field => ({
  ...field,
  state: 'verified',
  locked: true,
  value: kind === 'dismissed' || kind === 'asked_customer' ? null : value,
  resolution: { kind, at: 50_000 },
});

const humanLog = (type: 'dismiss' | 'confirm', at: number, details: Record<string, unknown> = {}): LogEntry => ({
  actor: 'estimator',
  at,
  event: { actor: 'human', action: { type, at, ...details } },
});

const confirmedFixture = (): ReviewSession => {
  const fields = createInitialState().fields;
  const kinds: ResolutionKind[] = [
    'verified', 'verified', 'picked', 'edited', 'entered', 'applied', 'dismissed',
    'asked_customer', 'asked_customer', 'asked_customer', 'asked_customer',
  ];
  const resolved = fields.map((field, index) => resolve(field, kinds[index]!));
  const materialIndex = resolved.findIndex(field => field.id === 'material');
  resolved[materialIndex] = {
    ...resolved[materialIndex]!,
    value: '6061-T6, no substitution',
    proposal: { value: '6061-T6 aluminum or equivalent', source_refs: ['spec:s1.1'] },
  };
  const quantityIndex = resolved.findIndex(field => field.id === 'quantity');
  resolved[quantityIndex] = {
    ...resolved[quantityIndex]!,
    value: '800',
    candidates: [
      { value: '800', source_refs: ['spec:s1.1'] },
      { value: '750', source_refs: ['email:p2'] },
    ],
  };

  const log: LogEntry[] = [
    {
      actor: 'agent',
      at: 1_000,
      event: {
        actor: 'agent',
        action: {
          type: 'propose',
          at: 1_000,
          input: { field_id: 'customer_rfq_ref', value: 'RFQ-1', source_refs: ['spec:s1.1'] },
        },
      },
      notes: ['agent independently agrees'],
    },
    humanLog('dismiss', 60_000, { field_id: 'general_tolerance', reason: 'Covered by our shop standard' }),
    {
      ...humanLog('confirm', 109_000),
      notes: ['Auto-dismissed suggestion: material', 'Auto-dismissed suggestion: delivery'],
    },
  ];

  return {
    confirmed: true,
    confirmedAt: 109_000,
    startedAt: 1_000,
    fields: resolved,
    log,
  };
};

afterEach(() => {
  cleanup();
  act(() => replaceState(createInitialState()));
});

describe('ConfirmSummary', () => {
  test('derives title, timer, resolution counts, decisions, pending fields, suggestions, and log from the fixture', () => {
    act(() => replaceState(confirmedFixture()));
    render(<ConfirmSummary />);

    expect(screen.getByRole('heading', { name: 'Confirmed with 4 open questions' })).toBeInTheDocument();
    expect(screen.getByText("Reviewed in 1:48 — from the agent's first write to confirm")).toBeInTheDocument();

    const counts = screen.getByLabelText('Resolution counts');
    for (const text of ['2 verified', '1 edited', '1 entered', '1 picked', '1 not required', '1 applied', '4 asked customer']) {
      expect(within(counts).getByText(text)).toBeInTheDocument();
    }
    expect(screen.getByText('agent independently agreed on 1 field')).toBeInTheDocument();
    expect(screen.getByText(/material · agent “6061-T6 aluminum or equivalent” → yours “6061-T6, no substitution”/)).toBeInTheDocument();
    expect(screen.getByText('quantity · picked 800 · losing candidate 750')).toBeInTheDocument();
    expect(screen.getByText('general_tolerance · Covered by our shop standard')).toBeInTheDocument();
    expect(screen.getByText('surface_finish · drawing_number · drawing_revision · delivery')).toBeInTheDocument();
    expect(screen.getByText('material · delivery')).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: 'Full change log' })).getAllByRole('listitem')).toHaveLength(3);
  });

  test('supports full-log component integration and resets to a fresh review', async () => {
    act(() => replaceState(confirmedFixture()));
    render(<ConfirmSummary logContent={<div data-testid="change-log">Rendered log</div>} />);

    expect(screen.getByTestId('change-log')).toHaveTextContent('Rendered log');
    await userEvent.click(screen.getByRole('button', { name: 'Start over' }));

    expect(getState().confirmed).toBe(false);
    expect(getState().fields).toHaveLength(11);
    expect(getState().fields.every(field => field.state === 'empty')).toBe(true);
    expect(screen.queryByRole('heading', { name: /Confirmed/ })).not.toBeInTheDocument();
  });

  test('uses the plain Confirmed title when no customer questions remain', () => {
    const fixture = confirmedFixture();
    fixture.fields = fixture.fields.map(field => field.resolution?.kind === 'asked_customer'
      ? resolve(field, 'verified', 'resolved')
      : field);
    act(() => replaceState(fixture));

    render(<ConfirmSummary />);
    expect(screen.getByRole('heading', { name: 'Confirmed' })).toBeInTheDocument();
  });
});
