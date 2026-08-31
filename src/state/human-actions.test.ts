import { expect, test } from 'vitest';
import { reduce } from './reducer';
import { createInitialState, reviewSession } from './session';
import type { AppState, FieldId, HumanAction } from './types';

const propose = (id: FieldId = 'material', unit?: string) => reduce(createInitialState(), {
  actor: 'agent', action: { type: 'propose', at: 10, input: { field_id: id, value: '6061', unit, source_refs: ['spec:s1.1'] } },
});
const act = (state: AppState, action: HumanAction) => reduce(state, { actor: 'human', action });
const get = (state: AppState, id: FieldId = 'material') => state.fields.find(f => f.id === id)!;

test('verify: resolves reviewable provenance at the action time, not empty/conflict/missing', () => {
  const verified = act(propose(), { type: 'verify', field_id: 'material', at: 20 });
  expect(get(verified)).toMatchObject({ state: 'verified', locked: true, resolution: { kind: 'verified', at: 20 } });
  expect(get(verified).proposal?.source_refs).toEqual(['spec:s1.1']);
  for (const state of ['empty', 'missing', 'conflict'] as const) {
    const before = createInitialState();
    get(before).state = state;
    expect(get(act(before, { type: 'verify', field_id: 'material' })).state).toBe(state);
  }
  expect(reviewSession(verified).log).toHaveLength(2);
});

test('edit_start locks immediately; edit saves and verifies with unit validation', () => {
  const before = propose('overall_dimensions');
  const typing = act(before, { type: 'edit_start', field_id: 'overall_dimensions', at: 15 } as HumanAction);
  expect(get(typing, 'overall_dimensions')).toMatchObject({ locked: true, state: 'needs_review' });
  const saved = act(typing, { type: 'edit', field_id: 'overall_dimensions', value: '20 × 14.5', unit: 'in', at: 20 } as HumanAction);
  expect(get(saved, 'overall_dimensions')).toMatchObject({ locked: true, state: 'verified', unit: 'in', resolution: { kind: 'edited', at: 20 } });
  expect(get(saved, 'overall_dimensions').proposal?.value).toBe('6061');
  const bad = act(typing, { type: 'edit', field_id: 'overall_dimensions', value: '20', unit: 'ft' } as HumanAction);
  expect(get(bad, 'overall_dimensions').state).toBe('needs_review');
});

test('enter: a human supplies an absent value and acquires a permanent lock', () => {
  const entered = act(createInitialState(), { type: 'enter', field_id: 'material', value: 'steel', at: 5 } as HumanAction);
  expect(get(entered)).toMatchObject({ state: 'verified', locked: true, value: 'steel', resolution: { kind: 'entered' } });
  expect(get(act(createInitialState(), { type: 'enter', field_id: 'material', value: ' ' } as HumanAction)).state).toBe('empty');
});
