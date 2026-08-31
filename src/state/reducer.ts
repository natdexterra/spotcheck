import type { AppState, Candidate, DispatchedEvent, Proposal } from './types';
import { reviewSession } from './session';

export function reduce(state: AppState, event: DispatchedEvent): AppState {
  const next = transition(state, event);
  if (next === state) return state;
  return { ...reviewSession(next), log: [...reviewSession(state).log, {
    actor: event.actor === 'human' ? 'estimator' : 'agent',
    at: 'at' in event.action ? event.action.at ?? 0 : 0,
    event: structuredClone(event),
  }] };
}

function transition(state: AppState, event: DispatchedEvent): AppState {
  if (event.actor === 'human' && event.action.type === 'verify') {
    const id = event.action.field_id;
    return { ...state, fields: state.fields.map(field => field.id === id && field.state === 'needs_review'
      ? { ...field, state: 'verified', locked: true } : field) };
  }
  if (event.actor === 'agent' && event.action.type === 'propose') {
    const input = event.action.input as (Proposal & { field_id?: string }) | undefined;
    if (!input || typeof input.value !== 'string') return state;
    return { ...state, fields: state.fields.map(field => field.id === input.field_id && !field.locked && field.state !== 'conflict'
      ? { ...field, state: 'needs_review', value: input.value, proposal: structuredClone(input),
          ...(field.proposal ? { revised: { was: field.value, at: event.action.at ?? 0 } } : {}) }
      : field) };
  }
  if (event.actor === 'agent' && ['report_missing', 'report_conflict'].includes(event.action.type)) {
    const input = event.action.input as { field_id?: string; searched?: string[]; candidates?: Candidate[] } | undefined;
    if (!input) return state;
    return { ...state, fields: state.fields.map(field => field.id !== input.field_id || field.locked || (field.state === 'conflict' && event.action.type === 'report_missing') ? field
      : event.action.type === 'report_missing'
        ? { ...field, state: 'missing', searched: { searched: input.searched ?? [] } }
        : { ...field, state: 'conflict', candidates: input.candidates ?? [] }) };
  }
  return state;
}
