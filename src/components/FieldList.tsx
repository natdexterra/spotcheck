import { useEffect, useState, type ComponentType } from 'react';
import { useReview } from '../hooks/useReview';
import {
  CheckCircleIcon,
  ChevronDownIcon,
  CircleDotIcon,
  DashedCircleIcon,
  DashIcon,
  OpposingArrowsIcon,
} from '../icons';
import { fieldLabel } from '../lib/format';
import type { LogEntry } from '../state/session';
import type { Field, FieldId, FieldState } from '../state/types';
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

const REPORT_WORDING: Record<string, string> = {
  report_conflict: 'reported a conflict on this field after you set it \u00b7',
  report_missing: 'reported this field missing after you set it \u00b7',
};

/**
 * A locked field the agent tried to flag afterwards: the newest call it made on
 * the field was a report tool, and the lock turned that call into a rejection.
 */
const lockedReportFor = (field: Field, log: LogEntry[]): string | undefined => {
  if (!field.locked) return undefined;
  for (let index = log.length - 1; index >= 0; index -= 1) {
    const entry = log[index]!;
    const action = entry.event.action;
    const input = 'input' in action && typeof action.input === 'object' && action.input !== null
      ? action.input as Record<string, unknown>
      : {};
    const fieldId = 'field_id' in action ? action.field_id : input.field_id;
    if (fieldId !== field.id) continue;
    if (entry.actor !== 'agent' || entry.result?.ok !== false) return undefined;
    return REPORT_WORDING[action.type];
  }
  return undefined;
};

export function FieldList({ focusRequest, onSource }: FieldListProps) {
  const { groups, log, verifiedCount } = useReview();
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
          <p className="field-list__count numeric">{verifiedCount} of 11 verified</p>
        </div>
        <p>Your agent reads the documents → fields fill with sources → you verify and confirm.</p>
      </header>

      {openGroups.map(group => {
        const GroupIcon = GROUP_ICONS[group.state];
        return (
          <section className={`field-list__group field-list__group--${group.state}`} key={group.state}>
            <h3 className={`field-list__group-heading field-list__group-heading--${group.state}`}>
              <GroupIcon />
              {groupHeading(group.state, group.fields.length)}
            </h3>
            {group.fields.map(field => (
              <FieldRow
                bare={log.length === 0}
                field={field}
                key={field.id}
                lockedReport={lockedReportFor(field, log)}
                onSource={onSource}
              />
            ))}
          </section>
        );
      })}

      {verified ? (
        <section className="field-list__group field-list__group--verified">
          <div className="field-list__verified-summary">
            <CheckCircleIcon />
            {/* "more" is only true while something else is still open. */}
            <span className="field-list__verified-count">
              {verified.fields.length} {openGroups.length > 0 ? 'more verified' : 'verified'}
            </span>
            <span className="field-list__verified-names">
              {verified.fields.map(field => fieldLabel(field.id)).join(' · ')}
            </span>
            <Button
              aria-expanded={verifiedOpen}
              variant="text"
              onClick={() => setVerifiedOpen(open => !open)}
            >
              {verifiedOpen ? 'Hide' : 'Show'}
              <ChevronDownIcon />
            </Button>
          </div>
          {verifiedOpen
            ? verified.fields.map(field => (
              <FieldRow
                field={field}
                key={field.id}
                lockedReport={lockedReportFor(field, log)}
                onSource={onSource}
              />
            ))
            : null}
        </section>
      ) : null}
    </section>
  );
}
