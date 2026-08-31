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
