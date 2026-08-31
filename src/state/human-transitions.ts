import type { AppState, Field, HumanAction, ResolutionKind } from './types';

const hasUnit = (field: Field) => field.id !== 'overall_dimensions' || field.unit === 'in' || field.unit === 'mm';
const resolve = (field: Field, kind: ResolutionKind, at: number): Field => ({
  ...field, state: 'verified', locked: true, resolution: { kind, at }, ask_customer: false,
});

export function transitionHuman(state: AppState, action: HumanAction): AppState {
  if (action.type !== 'verify') return state;
  return { ...state, fields: state.fields.map(field => field.id === action.field_id &&
    field.state === 'needs_review' && field.value !== null && hasUnit(field)
    ? resolve(field, 'verified', action.at ?? 0) : field) };
}
