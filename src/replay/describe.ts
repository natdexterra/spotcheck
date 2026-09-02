import { fieldLabel, sourceLabel } from '../lib/format';
import type { FieldId } from '../state/types';
import type { Step } from './replay';

const inputRecord = (input: unknown): Record<string, unknown> =>
  typeof input === 'object' && input !== null ? input as Record<string, unknown> : {};

export function describeRead(operation: 'list' | 'section' | 'review', input: unknown, past = false): string {
  const actor = past ? 'Agent' : 'agent';
  if (operation === 'list') return `${actor} ${past ? 'listed' : 'lists'} the documents`;
  if (operation === 'review') return `${actor} ${past ? 'checked' : 'checks'} the review`;
  const data = inputRecord(input);
  return `${actor} ${past ? 'read' : 'reads'} ${sourceLabel(`${String(data.doc_id ?? '')}:${String(data.section_id ?? '')}`)}`;
}

export function describeStep(step: Step): string {
  if (step.actor === 'agent') {
    const { tool, input } = step.call;
    if (tool === 'list_rfq_documents') return describeRead('list', input);
    if (tool === 'read_document') return describeRead('section', input);
    if (tool === 'get_review_state') return describeRead('review', input);
    if (tool === 'draft_clarification') return 'agent drafts the clarification';
    const label = fieldLabel(inputRecord(input).field_id as FieldId) ?? 'field';
    if (tool === 'propose_field') return `agent proposes ${label}`;
    if (tool === 'report_conflict') return `agent reports a conflict on ${label}`;
    return `agent reports ${label} missing`;
  }
  const action = step.action;
  if (action.type === 'confirm') return 'estimator confirms the quote request';
  if (action.type === 'send') return `estimator sends the clarification for ${action.covers?.length ?? 0} fields`;
  const verbs = { verify: 'verifies', edit: 'edits', edit_start: 'starts editing', enter: 'enters', pick: 'picks',
    dismiss: 'marks not required', apply: 'applies the suggestion to', dismiss_suggestion: 'dismisses the suggestion on',
    ask_customer: 'asks the customer about', reopen: 'reopens' };
  return `estimator ${verbs[action.type]} ${action.field_id ? fieldLabel(action.field_id) : 'field'}`;
}
