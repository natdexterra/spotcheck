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

test('pick: resolves one existing candidate, preserving all candidates', () => {
  const s = createInitialState();
  get(s).state = 'conflict';
  get(s).candidates = [{ value: '800', source_refs: ['spec:s1.1'] }, { value: '750', source_refs: ['email:p2'] }];
  const picked = act(s, { type: 'pick', field_id: 'material', index: 1, at: 30 } as HumanAction);
  expect(get(picked)).toMatchObject({ value: '750', state: 'verified', locked: true, resolution: { kind: 'picked' } });
  expect(get(picked).candidates).toEqual(get(s).candidates);
  expect(get(act(s, { type: 'pick', field_id: 'material', index: 8 } as HumanAction)).state).toBe('conflict');
});

test('dismiss: requires a reason and permits null dimensions as not required', () => {
  const s = propose('overall_dimensions');
  for (const reason of [undefined, '', ' ']) {
    expect(get(act(s, { type: 'dismiss', field_id: 'overall_dimensions', reason } as HumanAction), 'overall_dimensions').state).toBe('needs_review');
  }
  const result = act(s, { type: 'dismiss', field_id: 'overall_dimensions', reason: 'Not required for this quote' } as HumanAction);
  expect(get(result, 'overall_dimensions')).toMatchObject({ state: 'verified', locked: true, value: null, resolution: { kind: 'dismissed' } });
  expect(reviewSession(result).log.at(-1)?.event.action).toMatchObject({ reason: 'Not required for this quote' });
});

test('apply and dismiss_suggestion keep locks; apply checks dimensions units', () => {
  const s = act(propose(), { type: 'verify', field_id: 'material' });
  get(s).suggestion = { value: 'steel', source_refs: ['email:p2'] };
  const applied = act(s, { type: 'apply', field_id: 'material' } as HumanAction);
  expect(get(applied)).toMatchObject({ value: 'steel', locked: true, resolution: { kind: 'applied' } });
  expect(get(applied).suggestion).toBeUndefined();
  const dismissed = act(s, { type: 'dismiss_suggestion', field_id: 'material' } as HumanAction);
  expect(get(dismissed).value).toBe('6061');
  expect(get(dismissed).locked).toBe(true);
  expect(get(dismissed).suggestion).toBeUndefined();
  const dimensions = propose('overall_dimensions');
  get(dimensions, 'overall_dimensions').suggestion = { value: '20', source_refs: ['drawing:width'] };
  expect(get(act(dimensions, { type: 'apply', field_id: 'overall_dimensions' } as HumanAction), 'overall_dimensions').state).toBe('needs_review');
});

test('ask_customer opens a gap and locks without verifying', () => {
  const result = act(propose(), { type: 'ask_customer', field_id: 'material' } as HumanAction);
  expect(get(result)).toMatchObject({ locked: true, state: 'needs_review', ask_customer: true });
});

test('send: resolves only selected current gaps and records one draft-versus-sent diff', () => {
  const s = act(propose(), { type: 'ask_customer', field_id: 'material' });
  const before = { ...reviewSession(s), draft: { subject: 'Draft', body: 'Which alloy?', covers: ['material' as const] } };
  const result = act(before, { type: 'send', subject: 'Question', body: 'Please confirm alloy.', covers: ['material'], at: 25 } as HumanAction);
  expect(get(result)).toMatchObject({ state: 'verified', locked: true, value: null, resolution: { kind: 'asked_customer' } });
  expect(reviewSession(result).log).toHaveLength(before.log.length + 1);
  expect(reviewSession(result).log.at(-1)?.diff).toMatchObject({ before: before.draft, after: { subject: 'Question', body: 'Please confirm alloy.', covers: ['material'] } });
  expect(reviewSession(result).draft).toBeUndefined();
  expect(get(result, 'quantity').state).toBe('empty');
});

test('reopen: derive agent state while keeping the human value and lock', () => {
  for (const derived of ['empty', 'needs_review', 'missing', 'conflict'] as const) {
    const s = createInitialState();
    Object.assign(get(s), { state: 'verified', value: 'human', locked: true, resolution: { kind: 'edited', at: 1 } });
    if (derived === 'needs_review') get(s).proposal = { value: 'agent', source_refs: ['spec:s1.1'] };
    if (derived === 'missing') get(s).searched = { searched: ['spec'] };
    if (derived === 'conflict') get(s).candidates = [{ value: 'a', source_refs: ['spec:s1.1'] }, { value: 'b', source_refs: ['email:p2'] }];
    const reopened = act(s, { type: 'reopen', field_id: 'material' } as HumanAction);
    expect(get(reopened)).toMatchObject({ state: derived, value: 'human', locked: true });
    expect(get(reopened).resolution).toBeUndefined();
  }
});

test('confirm: all verified gate, timer stops, suggestions auto-dismiss within one entry', () => {
  expect(act(propose(), { type: 'confirm' }).confirmed).toBe(false);
  let s = propose();
  for (const f of s.fields) s = act(s, { type: 'enter', field_id: f.id, value: 'human', ...(f.id === 'overall_dimensions' ? { unit: 'mm' } : {}) });
  get(s).suggestion = { value: 'agent', source_refs: ['spec:s1.1'] };
  const result = act(s, { type: 'confirm', at: 50 } as HumanAction);
  expect(result.confirmed).toBe(true);
  expect(get(result).suggestion).toBeUndefined();
  expect(reviewSession(result)).toMatchObject({ startedAt: 10, confirmedAt: 50 });
  expect(reviewSession(result).log).toHaveLength(reviewSession(s).log.length + 1);
  expect(reviewSession(result).log.at(-1)?.notes).toContain('Auto-dismissed suggestion: material');
});
