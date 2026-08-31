import { expect, test } from 'vitest';
import { reduce } from './reducer';
import type { AgentAction, AppState, Field, HumanAction } from './types';

const field = (overrides: Partial<Field> = {}): Field => ({
  id: 'material', state: 'empty', value: null, locked: false, ...overrides,
});
const state = (overrides: Partial<Field> = {}): AppState => ({ confirmed: false, fields: [field(overrides)] });
const proposal = { field_id: 'material', value: '6061-T6', source_refs: ['spec:s1.1'] };
const agent = (s: AppState, type: AgentAction['type'], input: unknown = proposal) =>
  reduce(s, { actor: 'agent', action: { type, input } as AgentAction });
const human = (s: AppState, action: HumanAction) => reduce(s, { actor: 'human', action });

test('invariant-01: an agent proposal is reviewable, never verified', () => {
  const result = agent(state(), 'propose');
  expect(result.fields[0]).toMatchObject({ state: 'needs_review', value: '6061-T6', locked: false });
  for (const type of ['read', 'propose', 'report_conflict', 'report_missing', 'draft'] as const) {
    expect(agent(state(), type).fields.some(f => f.state === 'verified')).toBe(false);
  }
  expect(human(state(), { type: 'confirm' }).confirmed).toBe(false);
});
