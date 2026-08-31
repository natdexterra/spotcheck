import { expect, test } from 'vitest';
import { createInitialState } from './session';
import { selectBlockers, selectGaps, selectReviewState } from './selectors';

test('selectors omit null/false, cut values to 40 characters and expose no session mode', () => {
  const state = createInitialState();
  state.fields[0]!.state = 'needs_review';
  state.fields[0]!.value = 'x'.repeat(60);
  state.fields[1]!.state = 'conflict';
  state.fields[2]!.state = 'missing';
  const result = selectReviewState(state);
  expect(result.fields[0]?.value).toBe('x'.repeat(39) + '…');
  expect(result.fields[3]).toEqual({ id: 'material', state: 'empty' });
  expect(result).not.toHaveProperty('confirmed');
  expect(result).not.toHaveProperty('mode');
  expect(selectGaps(state)).toEqual(['part_name', 'quantity']);
  expect(selectBlockers(state)).toHaveLength(11);
  state.fields[0]!.state = 'verified';
  expect(selectBlockers(state)).toHaveLength(10);
});
