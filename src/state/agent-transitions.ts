import type { AgentAction, AppState, Candidate, Field, Proposal } from './types';
import { record, reject, validateWrite } from './agent-validation';
import type { Result } from './agent-validation';
import { readResult } from './read-results';
import { isGap, reviewSession } from './session';
import type { FieldId } from './types';

export interface AgentTransition { state: AppState; result: Result; notes?: string[] }
const current = (field: Field) => ({ state: field.state,
  ...(field.value !== null ? { value: field.value } : {}), ...(field.unit ? { unit: field.unit } : {}),
  ...(field.resolution ? { resolution: field.resolution.kind } : {}),
});
const includesCandidate = (candidates: Candidate[], earlier: Proposal | Candidate) => candidates.some(candidate =>
  candidate.value === earlier.value && (candidate.unit ?? null) === (earlier.unit ?? null) &&
  earlier.source_refs.every(ref => candidate.source_refs.includes(ref)));

export function transitionAgent(state: AppState, action: AgentAction): AgentTransition {
  if (action.type === 'read') return { state, result: readResult(state, action) };
  let error = validateWrite(action);
  const input = record(action.input) ? action.input : {};
  if (action.type === 'draft') {
    if (error) return { state, result: error };
    const covers = [...new Set(input.covers as FieldId[])].filter(id => state.fields.some(f => f.id === id && isGap(f)));
    return { state: { ...reviewSession(state), draft: { subject: input.subject as string, body: input.body as string, covers } },
      result: { ok: true, opened: true, covers } };
  }
  const field = state.fields.find(f => f.id === input.field_id);
  if (field && action.type === 'report_conflict' && (!error || error.path === 'candidates')) {
    const earlier = field.candidates ?? (field.proposal ? [field.proposal] : []);
    if (earlier.length && (!Array.isArray(input.candidates) || input.candidates.length < 2 ||
      earlier.some(candidate => !includesCandidate(input.candidates as Candidate[], candidate)))) {
      error = reject('SCHEMA', `Include every candidate; earlier material: ${earlier.map(c => `${c.value} (${c.source_refs.join(', ')})`).join('; ')}.`, { path: 'candidates' });
    }
  }
  if (field?.locked) {
    const agrees = action.type === 'propose' && input.value === field.value && (input.unit ?? null) === (field.unit ?? null);
    const suggestionRecorded = !error && action.type === 'propose' && !agrees;
    return {
      state: suggestionRecorded ? { ...state, fields: state.fields.map(f => f === field
        ? { ...f, suggestion: structuredClone(input) as unknown as Proposal } : f) } : state,
      result: reject('FIELD_LOCKED', 'The estimator keeps this decision; offer a sourced suggestion.', {
        current: current(field), suggestion_recorded: suggestionRecorded,
      }),
      ...(!error ? { notes: agrees ? ['agent independently agrees'] : action.type === 'propose'
        ? [field.suggestion ? 'Replaced pending suggestion' : 'Recorded suggestion']
        : [typeof input.note === 'string' ? input.note : `Agent reported ${action.type} on locked ${field.id}`] } : {}),
    };
  }
  if (field?.state === 'conflict' && (action.type === 'propose' || action.type === 'report_missing'))
    return { state, result: reject('FIELD_IN_CONFLICT', 'Include all candidates in report_conflict for the estimator to resolve.', {
      candidates: field.candidates?.map(({ value, source_refs }) => ({ value, source_refs })),
    }) };
  if (error) return { state, result: error };
  if (!field) return { state, result: reject('UNKNOWN_FIELD', 'Use one of the eleven field ids.') };
  let updated: Field = field;
  if (action.type === 'propose') {
    const proposal = structuredClone(input) as unknown as Proposal;
    updated = { ...field, state: 'needs_review', value: proposal.value, proposal,
      ...(field.id === 'overall_dimensions' ? { unit: proposal.unit ?? null } : {}),
      ...(field.proposal ? { revised: { was: field.value, at: action.at ?? 0 } } : {}),
    };
  } else if (action.type === 'report_conflict') updated = { ...field, state: 'conflict', candidates: structuredClone(input.candidates) as Candidate[] };
  else if (action.type === 'report_missing') updated = { ...field, state: 'missing', searched: {
    searched: [...input.searched as string[]], ...(typeof input.note === 'string' ? { note: input.note } : {}),
  } };
  return { state: { ...state, fields: state.fields.map(f => f === field ? updated : f) },
    result: { ok: true, field_id: field.id, state: updated.state,
      ...(action.type === 'propose' ? { value: updated.value, ...(updated.unit ? { unit: updated.unit } : {}), ...(updated.revised ? { revised: true } : {}) } : {}),
      ...(action.type === 'report_conflict' ? { candidates: updated.candidates!.length } : {}),
    },
  };
}
