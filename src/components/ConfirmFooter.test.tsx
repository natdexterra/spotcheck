// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { createInitialState, type ReviewSession } from '../state/session';
import { getState, replaceState } from '../state/store';
import type { Field, FieldState } from '../state/types';
import { ConfirmFooter } from './ConfirmFooter';

const withState = (field: Field, state: FieldState): Field => ({
  ...field,
  state,
  value: state === 'empty' || state === 'missing' ? null : field.id,
  locked: state === 'verified',
  ...(state === 'verified' ? { resolution: { kind: 'verified' as const, at: 1_000 } } : { resolution: undefined }),
});

afterEach(() => {
  cleanup();
  act(() => replaceState(createInitialState()));
  vi.restoreAllMocks();
});

describe('ConfirmFooter', () => {
  test('shows exact non-zero blocker counts as field links and keeps suggestions nonblocking', () => {
    const states: FieldState[] = [
      'conflict', 'conflict', 'missing', 'missing', 'needs_review', 'needs_review', 'empty',
      'verified', 'verified', 'verified', 'verified',
    ];
    const initial = createInitialState();
    const fields = initial.fields.map((field, index) => withState(field, states[index]!));
    fields[7] = { ...fields[7]!, suggestion: { value: 'alternate', source_refs: ['spec:s1.1'] } };
    fields[8] = { ...fields[8]!, suggestion: { value: 'other', source_refs: ['email:p2'] } };
    act(() => replaceState({ confirmed: false, fields }));

    render(<ConfirmFooter />);

    expect(screen.getByRole('button', { name: 'Confirm quote request' })).toBeDisabled();
    expect(screen.getByText('Blocked by', { exact: false })).toHaveTextContent(
      'Blocked by 2 conflicts · 2 missing · 2 to check · 1 not extracted',
    );
    expect(screen.getByRole('link', { name: '2 conflicts' })).toHaveAttribute('href', '#field-customer_rfq_ref');
    expect(screen.getByRole('link', { name: '2 missing' })).toHaveAttribute('href', '#field-quantity');
    expect(screen.getByRole('link', { name: '2 to check' })).toHaveAttribute('href', '#field-stock_thickness');
    expect(screen.getByRole('link', { name: '1 not extracted' })).toHaveAttribute('href', '#field-general_tolerance');
    expect(screen.getByText(/2 suggestions pending/)).toBeInTheDocument();
  });

  test('enables only when all eleven fields are verified and confirms despite a pending suggestion', async () => {
    const fields = createInitialState().fields.map(field => ({
      ...withState(field, 'verified'),
      ...(field.id === 'material'
        ? { suggestion: { value: 'alternate', source_refs: ['spec:s1.1'] } }
        : {}),
    }));
    act(() => replaceState({ confirmed: false, fields, log: [], startedAt: 1_000 } as ReviewSession));
    vi.spyOn(Date, 'now').mockReturnValue(109_000);

    render(<ConfirmFooter />);
    const confirm = screen.getByRole('button', { name: 'Confirm quote request' });
    expect(confirm).toBeEnabled();
    expect(screen.getByText('1 suggestion pending')).toBeInTheDocument();

    await userEvent.click(confirm);
    expect(getState().confirmed).toBe(true);
    expect(getState().fields.some(field => field.suggestion)).toBe(false);
  });
});
