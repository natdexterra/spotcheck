import { describe, expect, test } from 'vitest';
import type { Field, FieldId, FieldState, ResolutionKind } from '../state/types';
import { badgeText, duration, fieldLabel, groupLabel, relativeTime } from './format';

const field = (overrides: Partial<Field> = {}): Field => ({
  id: 'material',
  state: 'empty',
  value: null,
  locked: false,
  ...overrides,
});

describe('time formatting', () => {
  test('formats elapsed durations as minutes and zero-padded seconds', () => {
    expect(duration(108_000)).toBe('1:48');
    expect(duration(5_000)).toBe('0:05');
  });

  test('formats a timestamp relative to now', () => {
    expect(relativeTime(1_000, 43_000)).toBe('0:42 ago');
  });
});

describe('fieldLabel', () => {
  test.each<[FieldId, string]>([
    ['customer_rfq_ref', 'Customer RFQ ref'],
    ['part_name', 'Part'],
    ['quantity', 'Quantity'],
    ['material', 'Material'],
    ['stock_thickness', 'Stock thickness'],
    ['overall_dimensions', 'Overall dimensions'],
    ['general_tolerance', 'General tolerance'],
    ['surface_finish', 'Surface finish'],
    ['drawing_number', 'Drawing number'],
    ['drawing_revision', 'Drawing revision'],
    ['delivery', 'Delivery'],
  ])('%s is labelled %s', (id, label) => {
    expect(fieldLabel(id)).toBe(label);
  });
});

describe('badgeText', () => {
  test.each<[FieldState, string]>([
    ['empty', 'Not extracted'],
    ['needs_review', 'Needs review'],
    ['conflict', 'Two sources disagree'],
    ['missing', 'Not found'],
  ])('%s uses the required row wording', (state, text) => {
    expect(badgeText(field({ state }))).toBe(text);
  });

  test('calls out a missing unit before the generic review status', () => {
    expect(
      badgeText(field({ id: 'overall_dimensions', state: 'needs_review', value: '10 × 20', unit: null })),
    ).toBe('Unit missing');
  });

  test('calls out a proposal revised by the agent', () => {
    expect(badgeText(field({ state: 'needs_review', revised: { was: 'A36', at: 1_000 } }))).toBe(
      'Revised by agent',
    );
  });

  test.each<[ResolutionKind, string]>([
    ['verified', 'Verified by you · 0:42 ago'],
    ['edited', 'Edited by you · 0:42 ago'],
    ['entered', 'Entered by you · 0:42 ago'],
    ['picked', 'Picked by you · 0:42 ago'],
    ['applied', 'Applied by you · 0:42 ago'],
    ['dismissed', 'Not required · 0:42 ago'],
    ['asked_customer', 'Awaiting customer · 0:42 ago'],
  ])('%s uses the required human wording', (kind, text) => {
    expect(
      badgeText(
        field({
          state: 'verified',
          resolution: { kind, at: 1_000 },
        }),
        43_000,
      ),
    ).toBe(text);
  });
});

describe('groupLabel', () => {
  test.each<[FieldState | ResolutionKind, string]>([
    ['empty', 'Not extracted'],
    ['needs_review', 'Needs review'],
    ['conflict', 'Conflict'],
    ['missing', 'Missing'],
    ['verified', 'Verified'],
    ['edited', 'Edited'],
    ['entered', 'Entered'],
    ['picked', 'Picked'],
    ['dismissed', 'Not required'],
    ['applied', 'Applied'],
    ['asked_customer', 'Asked customer'],
  ])('%s uses the short label %s', (state, label) => {
    expect(groupLabel(state)).toBe(label);
  });
});
