import type { AppState, Field, HumanAction, ResolutionKind } from './types';
import { canConfirm, isGap, reviewSession } from './session';

const hasUnit = (field: Field) => field.id !== 'overall_dimensions' || field.unit === 'in' || field.unit === 'mm';
const resolve = (field: Field, kind: ResolutionKind, at: number): Field => ({
  ...field, state: 'verified', locked: true, resolution: { kind, at }, ask_customer: false,
});

export function transitionHuman(state: AppState, action: HumanAction): AppState {
  if (action.type === 'confirm') {
    if (!canConfirm(state)) return state;
    const { draft: _draft, ...session } = reviewSession(state);
    return { ...session, confirmed: true, confirmedAt: action.at ?? 0,
      fields: state.fields.map(({ suggestion: _suggestion, ...field }) => field) };
  }
  if (action.type === 'reopen') return { ...state, fields: state.fields.map(field => {
    if (field.id !== action.field_id || field.state !== 'verified') return field;
    const { resolution: _resolution, ...rest } = field;
    return { ...rest, locked: true, ask_customer: false,
      state: field.candidates?.length ? 'conflict' : field.searched ? 'missing' : field.proposal ? 'needs_review' : 'empty' };
  }) };
  if (action.type === 'send') {
    const session = reviewSession(state);
    if (!session.draft || !action.subject?.trim() || !action.body?.trim() || !Array.isArray(action.covers)) return state;
    if (action.covers.some(id => !session.draft!.covers.includes(id) || !state.fields.some(f => f.id === id && isGap(f)))) return state;
    const { draft: _draft, ...rest } = session;
    return { ...rest, sent: { subject: action.subject, body: action.body, covers: [...new Set(action.covers)] },
      fields: state.fields.map(field => action.covers!.includes(field.id) ? resolve({ ...field, value: null,
        ...(field.id === 'overall_dimensions' ? { unit: null } : {}) }, 'asked_customer', action.at ?? 0) : field) };
  }
  if (action.type === 'ask_customer') return { ...state, fields: state.fields.map(field =>
    field.id === action.field_id && field.state !== 'verified' ? { ...field, locked: true, ask_customer: true } : field) };
  if (action.type === 'apply' || action.type === 'dismiss_suggestion') return { ...state, fields: state.fields.map(field => {
    if (field.id !== action.field_id || !field.suggestion) return field;
    const { suggestion, ...current } = field;
    if (action.type === 'dismiss_suggestion') return { ...current, locked: true };
    const next = { ...current, value: suggestion.value, ...(field.id === 'overall_dimensions' ? { unit: suggestion.unit } : {}) };
    return hasUnit(next) ? resolve(next, 'applied', action.at ?? 0) : field;
  }) };
  if (action.type === 'dismiss') {
    if (typeof action.reason !== 'string' || !action.reason.trim()) return state;
    return { ...state, fields: state.fields.map(field => field.id !== action.field_id ? field :
      resolve({ ...field, value: null, ...(field.id === 'overall_dimensions' ? { unit: null } : {}) }, 'dismissed', action.at ?? 0)) };
  }
  if (action.type === 'pick') return { ...state, fields: state.fields.map(field => {
    if (field.id !== action.field_id || field.state !== 'conflict' || !Number.isInteger(action.index)) return field;
    const candidate = field.candidates?.[action.index!];
    if (!candidate) return field;
    const next = { ...field, value: candidate.value, ...(field.id === 'overall_dimensions' ? { unit: candidate.unit } : {}) };
    return hasUnit(next) ? resolve(next, 'picked', action.at ?? 0) : field;
  }) };
  if (action.type === 'edit_start') return { ...state, fields: state.fields.map(field =>
    field.id === action.field_id ? { ...field, locked: true } : field) };
  if (action.type === 'edit' || action.type === 'enter') {
    if (typeof action.value !== 'string' || !action.value.trim()) return state;
    return { ...state, fields: state.fields.map(field => {
      if (field.id !== action.field_id) return field;
      const next = { ...field, value: action.value!, ...(field.id === 'overall_dimensions' ? { unit: action.unit ?? field.unit } : {}) };
      return hasUnit(next) ? resolve(next, action.type === 'enter' ? 'entered' : 'edited', action.at ?? 0) : field;
    }) };
  }
  if (action.type !== 'verify') return state;
  return { ...state, fields: state.fields.map(field => field.id === action.field_id &&
    field.state === 'needs_review' && field.value !== null && hasUnit(field)
    ? resolve(field, 'verified', action.at ?? 0) : field) };
}
