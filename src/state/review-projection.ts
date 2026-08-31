import type { AppState } from './types';
import { isGap } from './session';

export const selectGaps = (state: AppState) => state.fields.filter(isGap).map(field => field.id);
export const selectBlockers = (state: AppState) => state.fields.filter(field => field.state !== 'verified').map(field => field.id);
export const reviewProjection = (state: AppState) => ({
  ...(state.confirmed ? { confirmed: true } : {}),
  fields: state.fields.map(field => ({ id: field.id, state: field.state,
    ...(field.value !== null ? { value: field.value.length > 40 ? field.value.slice(0, 39) + '…' : field.value } : {}),
    ...(field.unit ? { unit: field.unit } : {}),
    ...(field.locked ? { locked: true } : {}),
    ...(field.suggestion ? { suggestion_pending: true } : {}),
    ...(field.resolution ? { resolution: field.resolution.kind } : {}),
  })),
  gaps: selectGaps(state), unverified: selectBlockers(state),
});
