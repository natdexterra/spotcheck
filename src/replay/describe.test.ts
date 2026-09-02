import { expect, test } from 'vitest';
import { describeStep, describeRead } from './describe';
import type { HumanAction } from '../state/types';

test.each([
  ['list_rfq_documents', {}, 'agent lists the documents'],
  ['read_document', { doc_id: 'spec', section_id: 's3' }, 'agent reads spec §3'],
  ['read_document', { doc_id: 'email', section_id: 'p2' }, 'agent reads email ¶2'],
  ['read_document', { doc_id: 'drawing', section_id: 'detail' }, 'agent reads drawing detail'],
  ['get_review_state', {}, 'agent checks the review'],
  ['propose_field', { field_id: 'part_name' }, 'agent proposes Part'],
  ['report_conflict', { field_id: 'quantity' }, 'agent reports a conflict on Quantity'],
  ['report_missing', { field_id: 'material' }, 'agent reports Material missing'],
  ['draft_clarification', {}, 'agent drafts the clarification'],
] as const)('describes agent %s', (tool, input, phrase) => {
  expect(describeStep({ actor: 'agent', at: 0, call: { tool, input } })).toBe(phrase);
});

test.each([
  ['verify', 'verifies'], ['edit', 'edits'], ['edit_start', 'starts editing'], ['enter', 'enters'],
  ['pick', 'picks'], ['dismiss', 'marks not required'], ['apply', 'applies the suggestion to'],
  ['dismiss_suggestion', 'dismisses the suggestion on'], ['ask_customer', 'asks the customer about'], ['reopen', 'reopens'],
] as const)('describes estimator %s', (type, verb) => {
  expect(describeStep({ actor: 'estimator', at: 0, action: { type, field_id: 'part_name' } as HumanAction })).toBe(`estimator ${verb} Part`);
});

test('send and confirm descriptions and past-tense reads share vocabulary', () => {
  expect(describeStep({ actor: 'estimator', at: 0, action: { type: 'send', covers: ['material'] } })).toBe('estimator sends the clarification for 1 fields');
  expect(describeStep({ actor: 'estimator', at: 0, action: { type: 'confirm' } })).toBe('estimator confirms the quote request');
  expect(describeRead('list', {}, true)).toBe('Agent listed the documents');
  expect(describeRead('review', {}, true)).toBe('Agent checked the review');
  expect(describeRead('section', { doc_id: 'spec', section_id: 's3.1' }, true)).toBe('Agent read spec §3.1');
});
