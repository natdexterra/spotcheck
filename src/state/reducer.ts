import type { AppState, Candidate, DispatchedEvent, Proposal } from './types';
import { reviewSession } from './session';
import type { ReviewSession } from './session';
import { resolvesSource } from '../data/package';
import { transitionHuman } from './human-transitions';
import { validateWrite } from './agent-validation';
import { readResult } from './read-results';

const hasSources = (value: unknown): boolean => {
  if (!value || typeof value !== 'object') return false;
  const refs = (value as { source_refs?: unknown }).source_refs;
  return Array.isArray(refs) && refs.length > 0 && refs.every(ref => typeof ref === 'string' && resolvesSource(ref));
};

export function reduce(state: AppState, event: DispatchedEvent): AppState & Partial<ReviewSession> {
  if (state.confirmed && !(event.actor === 'agent' && event.action.type === 'read')) return state;
  const error = event.actor === 'agent' && event.action.type !== 'read' ? validateWrite(event.action) : undefined;
  const next = error ? state : transition(state, event);
  const input = event.actor === 'agent' ? event.action.input as { field_id?: string } | undefined : undefined;
  const changed = next.fields.find(field => field.id === input?.field_id);
  const result = event.actor !== 'agent' ? undefined : event.action.type === 'read' ? readResult(state, event.action) : error ?? {
    ok: true, field_id: changed?.id, state: changed?.state,
    ...(event.action.type === 'propose' ? { value: changed?.value, ...(changed?.unit ? { unit: changed.unit } : {}), ...(changed?.revised ? { revised: true } : {}) } : {}),
    ...(event.action.type === 'report_conflict' ? { candidates: changed?.candidates?.length } : {}),
  };
  return { ...reviewSession(next),
    ...(event.actor === 'agent' && event.action.type !== 'read' && reviewSession(state).startedAt === undefined
      ? { startedAt: event.action.at ?? 0 } : {}),
    log: [...reviewSession(state).log, {
    actor: event.actor === 'human' ? 'estimator' : 'agent',
    at: 'at' in event.action ? event.action.at ?? 0 : 0,
    event: structuredClone(event),
    ...(result ? { result } : {}),
    ...(next.confirmed && !state.confirmed ? { notes: state.fields.filter(f => f.suggestion).map(f => `Auto-dismissed suggestion: ${f.id}`) } : {}),
    ...(event.actor === 'human' && event.action.type === 'send' && next !== state && reviewSession(state).draft && reviewSession(next).sent
      ? { diff: { before: reviewSession(state).draft!, after: reviewSession(next).sent! } } : {}),
  }] };
}

function transition(state: AppState, event: DispatchedEvent): AppState {
  if (event.actor === 'human') return transitionHuman(state, event.action);
  if (event.actor === 'agent' && event.action.type === 'propose') {
    const input = event.action.input as (Proposal & { field_id?: string }) | undefined;
    if (!input || typeof input.value !== 'string') return state;
    if (!hasSources(input)) return state;
    return { ...state, fields: state.fields.map(field => field.id === input.field_id && !field.locked && field.state !== 'conflict'
      ? { ...field, state: 'needs_review', value: input.value, proposal: structuredClone(input),
          ...(field.id === 'overall_dimensions' ? { unit: input.unit ?? null } : {}),
          ...(field.proposal ? { revised: { was: field.value, at: event.action.at ?? 0 } } : {}) }
      : field) };
  }
  if (event.actor === 'agent' && ['report_missing', 'report_conflict'].includes(event.action.type)) {
    const input = event.action.input as { field_id?: string; searched?: string[]; candidates?: Candidate[] } | undefined;
    if (!input) return state;
    if (event.action.type === 'report_conflict' && (!Array.isArray(input.candidates) || !input.candidates.every(hasSources))) return state;
    return { ...state, fields: state.fields.map(field => field.id !== input.field_id || field.locked || (field.state === 'conflict' && event.action.type === 'report_missing') ? field
      : event.action.type === 'report_missing'
        ? { ...field, state: 'missing', searched: { searched: input.searched ?? [] } }
        : { ...field, state: 'conflict', candidates: input.candidates ?? [] }) };
  }
  return state;
}
