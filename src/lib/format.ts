import type { Field, FieldId, FieldState, ResolutionKind } from '../state/types';

const FIELD_LABELS: Record<FieldId, string> = {
  customer_rfq_ref: 'Customer RFQ ref',
  part_name: 'Part',
  quantity: 'Quantity',
  material: 'Material',
  stock_thickness: 'Stock thickness',
  overall_dimensions: 'Overall dimensions',
  general_tolerance: 'General tolerance',
  surface_finish: 'Surface finish',
  drawing_number: 'Drawing number',
  drawing_revision: 'Drawing revision',
  delivery: 'Delivery',
};

const SHORT_LABELS: Record<FieldState | ResolutionKind, string> = {
  empty: 'Not extracted',
  needs_review: 'Needs review',
  conflict: 'Conflict',
  missing: 'Missing',
  verified: 'Verified',
  edited: 'Edited',
  entered: 'Entered',
  picked: 'Picked',
  dismissed: 'Not required',
  applied: 'Applied',
  asked_customer: 'Asked customer',
};

const VERIFIED_BADGE_LABELS: Record<ResolutionKind, string> = {
  verified: 'Verified by you',
  edited: 'Edited by you',
  entered: 'Entered by you',
  picked: 'Picked by you',
  dismissed: 'Not required',
  applied: 'Applied by you',
  asked_customer: 'Awaiting customer',
};

export function duration(ms: number): string {
  const totalSeconds = Math.floor(Math.max(0, ms) / 1_000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

export function relativeTime(at: number, now: number): string {
  return `${duration(now - at)} ago`;
}

export function fieldLabel(id: FieldId): string {
  return FIELD_LABELS[id];
}

export function groupLabel(state: FieldState | ResolutionKind): string {
  return SHORT_LABELS[state];
}

export function badgeText(field: Field, now = Date.now()): string {
  if (field.state === 'empty') return 'Not extracted';
  if (field.state === 'conflict') return 'Two sources disagree';
  if (field.state === 'missing') return 'Not found';

  if (field.state === 'needs_review') {
    if (field.id === 'overall_dimensions' && field.unit == null) return 'Unit missing';
    if (field.revised) return 'Revised by agent';
    return 'Needs review';
  }

  const resolution = field.resolution;
  if (!resolution) return 'Verified by you';
  return `${VERIFIED_BADGE_LABELS[resolution.kind]} · ${relativeTime(resolution.at, now)}`;
}
