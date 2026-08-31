import { expect, test } from 'vitest';
import { reduce } from './reducer';
import { canConfirm, canDraft, createInitialState, reviewSession } from './session';
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

test('invariant-02: agent writes preserve the locked current field', () => {
  const before = state({ locked: true, state: 'needs_review', value: 'human choice' });
  for (const type of ['propose', 'report_conflict', 'report_missing'] as const) {
    expect(agent(before, type).fields).toEqual(before.fields);
  }
});

test('invariant-03: reports never release locks or acquire human locks', () => {
  for (const locked of [false, true]) {
    const before = state({ locked });
    for (const [type, input, expected] of [
      ['report_missing', { field_id: 'material', searched: ['spec'] }, 'missing'],
      ['report_conflict', { field_id: 'material', candidates: [proposal, { ...proposal, value: 'steel' }] }, 'conflict'],
    ] as const) {
      const result = agent(before, type, input);
      expect(result.fields[0]?.locked).toBe(locked);
      expect(result.fields[0]?.state).toBe(locked ? 'empty' : expected);
    }
  }
});

test('invariant-04: only a human can exit a conflict', () => {
  const before = state({ state: 'conflict', candidates: [proposal, { ...proposal, value: 'steel' }] });
  expect(agent(before, 'propose').fields).toEqual(before.fields);
  expect(agent(before, 'report_missing', { field_id: 'material', searched: ['spec'] }).fields).toEqual(before.fields);
});

test('invariant-05: human verification always locks', () => {
  const result = human(agent(state(), 'propose'), { type: 'verify', field_id: 'material' } as HumanAction);
  expect(result.fields[0]).toMatchObject({ state: 'verified', locked: true });
});

test('invariant-06: superseded agent payloads survive immutable history', () => {
  const first = agent(state(), 'propose');
  const next = agent(first, 'propose', { ...proposal, value: 'steel' });
  expect(first.fields[0]?.value).toBe('6061-T6');
  expect(next.fields[0]?.proposal?.value).toBe('steel');
  expect(next.fields[0]?.revised?.was).toBe('6061-T6');
  expect(reviewSession(next).log[0]?.event).toMatchObject({ actor: 'agent', action: { input: proposal } });
});

test('invariant-07: draft eligibility equals open gaps and not confirmed', () => {
  for (const status of ['empty', 'needs_review', 'missing', 'conflict', 'verified'] as const) {
    const s = state({ state: status });
    expect(canDraft(s)).toBe(status === 'missing' || status === 'conflict');
    expect(canDraft({ ...s, confirmed: true })).toBe(false);
  }
  expect(canDraft(state({ state: 'needs_review', ask_customer: true }))).toBe(true);
});

test('invariant-08: confirm requires exactly all eleven fields verified', () => {
  const initial = createInitialState();
  expect(initial.fields).toHaveLength(11);
  expect(canConfirm(initial)).toBe(false);
  const ready = { ...initial, fields: initial.fields.map(f => ({ ...f, state: 'verified' as const, locked: true })) };
  expect(canConfirm(ready)).toBe(true);
  expect(canConfirm({ ...ready, fields: ready.fields.slice(1) })).toBe(false);
  expect(canConfirm({ ...ready, fields: ready.fields.map(() => ready.fields[0]!) })).toBe(false);
});

test('invariant-09: each unfrozen action emits one attributed log entry', () => {
  let current = state();
  for (const type of ['read', 'propose', 'report_missing', 'draft'] as const) {
    const before = reviewSession(current).log.length;
    current = agent(current, type);
    expect(reviewSession(current).log).toHaveLength(before + 1);
    expect(reviewSession(current).log.at(-1)?.actor).toBe('agent');
  }
  const result = human(current, { type: 'confirm' });
  expect(reviewSession(result).log).toHaveLength(5);
  expect(reviewSession(result).log.at(-1)?.actor).toBe('estimator');
});

test('invariant-10: confirmed writes are frozen and reads still log', () => {
  const before = { ...state(), confirmed: true };
  for (const type of ['propose', 'report_conflict', 'report_missing', 'draft'] as const) {
    expect(agent(before, type)).toBe(before);
  }
  expect(human(before, { type: 'verify', field_id: 'material' })).toBe(before);
  expect(reviewSession(agent(before, 'read')).log).toHaveLength(1);
});

test('invariant-11: accepted proposals and every candidate require resolvable provenance', () => {
  for (const source_refs of [[], ['spec:unknown'], ['spec:s1.1', 'bad']]) {
    expect(agent(state(), 'propose', { ...proposal, source_refs }).fields[0]?.state).toBe('empty');
    expect(agent(state(), 'report_conflict', { field_id: 'material', candidates: [proposal, { ...proposal, source_refs }] }).fields[0]?.state).toBe('empty');
  }
  expect(agent(state(), 'propose').fields[0]?.proposal?.source_refs).toEqual(['spec:s1.1']);
});

test('invariant-12: unit-bearing value cannot verify without a unit', () => {
  const before = agent(state({ id: 'overall_dimensions' }), 'propose', { ...proposal, field_id: 'overall_dimensions' });
  expect(human(before, { type: 'verify', field_id: 'overall_dimensions' }).fields[0]?.state).toBe('needs_review');
  const withUnit = agent(state({ id: 'overall_dimensions' }), 'propose', { ...proposal, field_id: 'overall_dimensions', unit: 'in' });
  expect(human(withUnit, { type: 'verify', field_id: 'overall_dimensions' }).fields[0]?.state).toBe('verified');
});
