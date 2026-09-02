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

/** The empty value in the interface: the one sanctioned dash character. */
export const NO_VALUE = '—';

/** A value as the interface prints it: the unit travels with it, or a dash stands in for it. */
export function displayValue(value: string | null, unit?: string | null): string {
  return `${value ?? NO_VALUE}${unit ? ` ${unit}` : ''}`;
}

/** Counts read as counts: one call, two calls, one entry, 23 entries. */
export function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

export function duration(ms: number): string {
  const totalSeconds = Math.floor(Math.max(0, ms) / 1_000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

export function relativeTime(at: number, now: number): string {
  return `${duration(now - at)} ago`;
}

/** `spec:s1.1` reads as `spec §1.1`, `email:p2` as `email ¶2`, `drawing:width` as `drawing width`. */
export function sourceLabel(ref: string): string {
  const [documentId, region] = ref.split(':', 2);
  if (!region) return ref;
  if (documentId === 'spec') return `spec §${region.replace(/^s/, '')}`;
  if (documentId === 'email') return `email ¶${region.replace(/^p/, '')}`;
  return `${documentId} ${region.replaceAll('_', ' ')}`;
}

const DOCUMENT_WORDS: Record<string, string> = {
  spec: 'the specification',
  email: 'the email',
  drawing: 'the drawing',
};

/** A searched place in prose: spec:s3 reads spec \u00a73, a bare drawing reads the drawing. */
export function searchedLabel(ref: string): string {
  const [documentId, section] = ref.split(':', 2);
  if (!section) return DOCUMENT_WORDS[ref] ?? ref;
  if (documentId === 'spec' && /^s\d/.test(section)) return `spec \u00a7${section.slice(1)}`;
  if (documentId === 'email' && /^p\d/.test(section)) return `email \u00b6${section.slice(1)}`;
  return DOCUMENT_WORDS[documentId ?? ''] ?? ref;
}

/** The bare fragment: with no handler the link still lands on the region. */
export function sourceHref(ref: string): string {
  return `#${ref}`;
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
