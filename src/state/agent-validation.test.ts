import { expect, test } from 'vitest';
import { reduce } from './reducer';
import { createInitialState, reviewSession } from './session';
import type { AgentAction, AppState, Candidate, Proposal } from './types';

const agent = (state: AppState, type: AgentAction['type'], input: unknown) =>
  reduce(state, { actor: 'agent', action: { type, input, at: 1 } as AgentAction });
const get = (state: AppState, id = 'material') => state.fields.find(f => f.id === id)!;
const good = { field_id: 'material', value: '6061', source_refs: ['spec:s1.1'] };

test('P1.1 validation: every capped member rejects with the input-validation code naming member and cap', () => {
  const s = createInitialState();
  const second = { value: '7075', source_refs: ['email:p2'] };
  const cases: [AgentAction['type'], unknown, string, number][] = [
    ['propose', { ...good, value: 'v'.repeat(401) }, 'value', 400],
    ['propose', { ...good, field_id: 'overall_dimensions', unit: 'u'.repeat(41) }, 'unit', 40],
    ['propose', { ...good, rationale: 'r'.repeat(601) }, 'rationale', 600],
    ['report_missing', { field_id: 'material', searched: ['spec'], note: 'n'.repeat(601) }, 'note', 600],
    ['report_conflict', { field_id: 'material', candidates: [good, { ...second, note: 'n'.repeat(601) }] }, 'note', 600],
    ['draft', { subject: 's'.repeat(201), body: 'Body', covers: [] }, 'subject', 200],
    ['draft', { subject: 'Subject', body: 'b'.repeat(4001), covers: [] }, 'body', 4000],
    ['propose', { ...good, source_refs: Array.from({ length: 13 }, () => 'spec:s1.1') }, 'source_refs', 12],
    ['propose', { ...good, source_refs: ['x'.repeat(65)] }, 'source_refs', 64],
    ['report_conflict', { field_id: 'material', candidates: Array.from({ length: 9 }, (_, i) => (i % 2 ? good : second)) }, 'candidates', 8],
  ];
  for (const [type, input, member, cap] of cases) {
    const result = reviewSession(agent(s, type, input)).log.at(-1)?.result;
    expect(result, member).toMatchObject({ ok: false, code: 'SCHEMA' });
    expect(String(result?.message), member).toContain(member);
    expect(String(result?.message), member).toContain(String(cap));
    expect(get(agent(s, type, input), (input as { field_id?: string }).field_id ?? 'material').state).toBe('empty');
  }
});

test('P1.1 validation: stored proposals, candidates and suggestions carry only declared keys', () => {
  const extras = { hostile: 'payload', actor: 'human', type: 'verify' };
  const proposed = agent(createInitialState(), 'propose', { ...good, rationale: 'From the spec.', ...extras });
  expect(Object.keys(get(proposed).proposal as Proposal).sort()).toEqual(['rationale', 'source_refs', 'value']);
  const conflicted = agent(createInitialState(), 'report_conflict', {
    field_id: 'material', candidates: [{ ...good, ...extras, field_id: undefined }, { value: '7075', source_refs: ['email:p2'], note: 'Alt.', ...extras }],
  });
  for (const candidate of get(conflicted).candidates as Candidate[])
    for (const key of Object.keys(candidate)) expect(['value', 'unit', 'source_refs', 'note']).toContain(key);
  let locked = agent(createInitialState(), 'propose', good);
  locked = reduce(locked, { actor: 'human', action: { type: 'verify', field_id: 'material', at: 2 } });
  const suggested = agent(locked, 'propose', { ...good, value: '7075', ...extras });
  expect(Object.keys(get(suggested).suggestion as Proposal).sort()).toEqual(['source_refs', 'value']);
});
