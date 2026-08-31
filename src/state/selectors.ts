import { getState, subscribe } from './store';
import { canDraft, reviewSession } from './session';
import { reject } from './agent-validation';
export { selectGaps, selectBlockers, reviewProjection as selectReviewState } from './review-projection';

export const selectToolResult = (readOnly: boolean): Record<string, unknown> => {
  const state = getState();
  if (!readOnly && state.confirmed) return reject('SESSION_CONFIRMED', 'Start a new review to propose changes.');
  return reviewSession(state).log.at(-1)?.result ?? {};
};
export const selectDraftAvailable = () => canDraft(getState());
export const subscribeReview = subscribe;
