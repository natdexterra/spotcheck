import { useMemo, useSyncExternalStore } from 'react';
import { selectBlockers, selectGaps } from '../state/review-projection';
import { canConfirm as selectCanConfirm, reviewSession } from '../state/session';
import { getState, subscribe } from '../state/store';
import type { Field, FieldState } from '../state/types';

const RISK_ORDER: readonly FieldState[] = [
  'conflict',
  'missing',
  'needs_review',
  'empty',
  'verified',
];

export interface ReviewGroup {
  state: FieldState;
  fields: Field[];
}

const orderFields = (fields: Field[]): Field[] => [...fields].sort((left, right) => {
  const riskDifference = RISK_ORDER.indexOf(left.state) - RISK_ORDER.indexOf(right.state);
  if (riskDifference !== 0) return riskDifference;

  if (left.state !== 'verified' || right.state !== 'verified') return 0;
  return (right.resolution?.at ?? 0) - (left.resolution?.at ?? 0);
});

export const useReview = () => {
  const state = useSyncExternalStore(subscribe, getState, getState);

  return useMemo(() => {
    const session = reviewSession(state);
    const riskOrder = orderFields(state.fields);
    const groups: ReviewGroup[] = RISK_ORDER.map(groupState => ({
      state: groupState,
      fields: riskOrder.filter(field => field.state === groupState),
    })).filter(group => group.fields.length > 0);
    const timerEnd = session.confirmedAt ?? Date.now();

    return {
      state,
      session,
      riskOrder,
      groups,
      gaps: selectGaps(state),
      blockers: selectBlockers(state),
      draft: session.draft,
      log: session.log,
      timer: session.startedAt === undefined ? null : Math.max(0, timerEnd - session.startedAt),
      canConfirm: selectCanConfirm(state),
      verifiedCount: state.fields.filter(field => field.state === 'verified').length,
      confirmed: state.confirmed,
      confirmedAt: session.confirmedAt,
    };
  }, [state]);
};
