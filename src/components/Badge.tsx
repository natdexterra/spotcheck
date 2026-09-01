import { useEffect, useState, type ComponentType } from 'react';
import {
  CheckCircleIcon,
  EnvelopeIcon,
  MinusCircleIcon,
} from '../icons';
import { badgeText, groupLabel } from '../lib/format';
import type { Field } from '../state/types';

export interface BadgeProps {
  field: Field;
  now?: number;
}

const resolutionIcon = (field: Field): ComponentType => {
  if (field.resolution?.kind === 'dismissed') return MinusCircleIcon;
  if (field.resolution?.kind === 'asked_customer') return EnvelopeIcon;
  return CheckCircleIcon;
};

export function Badge({ field, now }: BadgeProps) {
  const [currentTime, setCurrentTime] = useState(() => now ?? Date.now());
  const shortLabel = groupLabel(field.resolution?.kind ?? field.state);
  const ariaLabel = field.locked ? `${shortLabel}, locked` : shortLabel;
  const ResolutionIcon = resolutionIcon(field);

  useEffect(() => {
    if (now !== undefined || field.state !== 'verified') return;
    const timer = window.setInterval(() => setCurrentTime(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, [field.state, now]);

  return (
    <span
      aria-label={ariaLabel}
      className={`field-row__badge field-row__badge--${field.state}`}
      data-field-badge={field.id}
      tabIndex={-1}
    >
      {field.state === 'verified' ? (
        <ResolutionIcon />
      ) : (
        <span aria-hidden="true" className="field-row__badge-dot" />
      )}
      <span>{badgeText(field, now ?? currentTime)}</span>
    </span>
  );
}
