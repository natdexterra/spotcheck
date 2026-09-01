import { useReview } from '../hooks/useReview';
import { dispatchHuman } from '../state/store';
import type { Field, FieldState } from '../state/types';
import { Button } from './Button';
import { JumpLink } from './JumpLink';

interface BlockerGroup {
  state: Exclude<FieldState, 'verified'>;
  fields: Field[];
  label: string;
}

const blockerLabel = (state: BlockerGroup['state'], count: number): string => {
  if (state === 'conflict') return `${count} ${count === 1 ? 'conflict' : 'conflicts'}`;
  if (state === 'missing') return `${count} missing`;
  if (state === 'needs_review') return `${count} to check`;
  return `${count} not extracted`;
};

export function ConfirmFooter() {
  const { canConfirm, state } = useReview();
  const blockerGroups = (['conflict', 'missing', 'needs_review', 'empty'] as const)
    .map(groupState => {
      const fields = state.fields.filter(field => field.state === groupState);
      return { state: groupState, fields, label: blockerLabel(groupState, fields.length) };
    })
    .filter(group => group.fields.length > 0);
  const suggestionCount = state.fields.filter(field => field.suggestion).length;

  return (
    <footer className="confirm-footer">
      <Button
        disabled={!canConfirm}
        variant="primary"
        onClick={() => dispatchHuman({ type: 'confirm', at: Date.now() })}
      >
        Confirm quote request
      </Button>

      <div className="confirm-footer__status">
        {blockerGroups.length > 0 ? (
          <span className="confirm-footer__blockers">
            Blocked by{' '}
            {blockerGroups.map((group, index) => (
              <span key={group.state}>
                {index > 0 ? ' · ' : null}
                <JumpLink href={`#field-${group.fields[0]!.id}`}>{group.label}</JumpLink>
              </span>
            ))}
          </span>
        ) : null}
        {suggestionCount > 0 ? (
          <span className="confirm-footer__suggestions">
            {blockerGroups.length > 0 ? ' · ' : null}
            {`${suggestionCount} ${suggestionCount === 1 ? 'suggestion' : 'suggestions'} pending`}
          </span>
        ) : null}
      </div>
    </footer>
  );
}
