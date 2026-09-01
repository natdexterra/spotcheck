// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { createInitialState, type ReviewSession } from '../state/session';
import { replaceState } from '../state/store';
import type { Field, FieldId, FieldState } from '../state/types';
import { useReview } from './useReview';

const field = (id: FieldId, state: FieldState, at?: number): Field => ({
  id,
  state,
  value: state === 'empty' || state === 'missing' ? null : id,
  locked: state === 'verified',
  ...(state === 'verified' ? { resolution: { kind: 'verified', at: at ?? 0 } } : {}),
});

afterEach(() => {
  act(() => replaceState(createInitialState()));
  vi.restoreAllMocks();
});

describe('useReview', () => {
  test('subscribes to the external store and memoises one projection per snapshot', () => {
    const { result, rerender } = renderHook(() => useReview());
    const first = result.current;

    rerender();
    expect(result.current).toBe(first);

    act(() => replaceState({
      confirmed: false,
      fields: [
        field('part_name', 'empty'),
        field('quantity', 'conflict'),
        field('material', 'missing'),
        field('delivery', 'needs_review'),
        field('drawing_number', 'verified', 10),
        field('customer_rfq_ref', 'verified', 20),
      ],
    }));

    expect(result.current).not.toBe(first);
    expect(result.current.riskOrder.map(item => item.id)).toEqual([
      'quantity',
      'material',
      'delivery',
      'part_name',
      'customer_rfq_ref',
      'drawing_number',
    ]);
    expect(result.current.groups.map(group => [group.state, group.fields.length])).toEqual([
      ['conflict', 1],
      ['missing', 1],
      ['needs_review', 1],
      ['empty', 1],
      ['verified', 2],
    ]);
  });

  test('exposes gaps, blockers, draft, log, confirmation state and a stopped timer', () => {
    const base = createInitialState();
    const readyFields = base.fields.map(item => field(item.id, 'verified', 25));
    readyFields[0] = { ...readyFields[0]!, state: 'needs_review', ask_customer: true, locked: true };
    const session: ReviewSession = {
      confirmed: true,
      confirmedAt: 130,
      startedAt: 30,
      fields: readyFields,
      draft: { subject: 'Question', body: 'Please confirm.', covers: ['customer_rfq_ref'] },
      log: [{ actor: 'agent', at: 30, event: { actor: 'agent', action: { type: 'propose' } } }],
    };

    act(() => replaceState(session));
    const { result } = renderHook(() => useReview());

    expect(result.current.state).toBe(session);
    expect(result.current.session.log).toBe(session.log);
    expect(result.current.gaps).toEqual(['customer_rfq_ref']);
    expect(result.current.blockers).toEqual(['customer_rfq_ref']);
    expect(result.current.draft).toBe(session.draft);
    expect(result.current.log).toBe(session.log);
    expect(result.current.timer).toBe(100);
    expect(result.current.canConfirm).toBe(false);
    expect(result.current.verifiedCount).toBe(10);
    expect(result.current.confirmed).toBe(true);
    expect(result.current.confirmedAt).toBe(130);
  });

  test('uses the current time while a review is active and has no timer before it starts', () => {
    vi.spyOn(Date, 'now').mockReturnValue(250);
    const { result } = renderHook(() => useReview());
    expect(result.current.timer).toBeNull();

    act(() => replaceState({ ...createInitialState(), startedAt: 100, log: [] } as ReviewSession));
    expect(result.current.timer).toBe(150);
  });
});
