import { useEffect, useState, type ComponentType } from 'react';
import { useReview } from '../hooks/useReview';
import {
  CheckCircleIcon,
  CircleDotIcon,
  DashedCircleIcon,
  DashIcon,
  OpposingArrowsIcon,
} from '../icons';
import { fieldLabel } from '../lib/format';
import type { FieldId, FieldState } from '../state/types';
import { Button } from './Button';
import { FieldRow } from './FieldRow';

export interface FocusRequest {
  fieldId: FieldId;
  nonce: number;
}

export interface FieldListProps {
  focusRequest?: FocusRequest;
  onSource?: (ref: string, fieldId: FieldId) => void;
}

const GROUP_ICONS: Record<FieldState, ComponentType> = {
  conflict: OpposingArrowsIcon,
  missing: DashedCircleIcon,
  needs_review: CircleDotIcon,
  empty: DashIcon,
  verified: CheckCircleIcon,
};

const groupHeading = (state: FieldState, count: number): string => {
  if (state === 'conflict') return `${count} ${count === 1 ? 'conflict' : 'conflicts'}`;
  if (state === 'missing') return `${count} missing`;
  if (state === 'needs_review') return `${count} to review`;
  if (state === 'empty') return `${count} not extracted`;
  return `${count} verified`;
};

export function FieldList({ focusRequest, onSource }: FieldListProps) {
  const { groups, verifiedCount } = useReview();
  const [verifiedOpen, setVerifiedOpen] = useState(false);
  const verified = groups.find(group => group.state === 'verified');
  const hasPendingSuggestion = verified?.fields.some(field => field.suggestion !== undefined) === true;
  const openGroups = groups.filter(group => group.state !== 'verified');

  const requestedFieldIsVerified = focusRequest !== undefined &&
    verified?.fields.some(field => field.id === focusRequest.fieldId) === true;

  useEffect(() => {
    if (hasPendingSuggestion) setVerifiedOpen(true);
  }, [hasPendingSuggestion]);

  useEffect(() => {
    if (requestedFieldIsVerified) setVerifiedOpen(true);
  }, [focusRequest?.nonce, requestedFieldIsVerified]);

  useEffect(() => {
    if (!focusRequest) return;
    const row = document.querySelector<HTMLElement>(`[data-field-id="${focusRequest.fieldId}"]`);
    if (!row) return;
    row.scrollIntoView?.({ block: 'center' });
    (row.querySelector<HTMLElement>('[data-field-badge]') ?? row).focus();
  }, [focusRequest?.nonce, verifiedOpen]);

  return (
    <section className="field-list" aria-labelledby="field-list-title">
      <header className="field-list__header">
        <div className="field-list__title-line">
          <h2 id="field-list-title">Quote request</h2>
          <h3 className="field-list__count numeric">{verifiedCount} of 11 verified</h3>
        </div>
        <p>Your agent reads the documents → fields fill with sources → you verify and confirm.</p>
      </header>

      {openGroups.map(group => {
        const GroupIcon = GROUP_ICONS[group.state];
        return (
          <section className={`field-list__group field-list__group--${group.state}`} key={group.state}>
            <h3 className="field-list__group-heading">
              <GroupIcon />
              {groupHeading(group.state, group.fields.length)}
            </h3>
            {group.fields.map(field => <FieldRow field={field} key={field.id} onSource={onSource} />)}
          </section>
        );
      })}

      {verified ? (
        <section className="field-list__group field-list__group--verified">
          <div className="field-list__verified-summary">
            <CheckCircleIcon />
            <span>
              {verified.fields.length} more verified · {verified.fields.map(field => fieldLabel(field.id)).join(' · ')}
            </span>
            <Button
              aria-expanded={verifiedOpen}
              variant="text"
              onClick={() => setVerifiedOpen(open => !open)}
            >
              {verifiedOpen ? 'Hide' : 'Show'}
            </Button>
          </div>
          {verifiedOpen
            ? verified.fields.map(field => <FieldRow field={field} key={field.id} onSource={onSource} />)
            : null}
        </section>
      ) : null}
    </section>
  );
}
