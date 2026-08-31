// State and action types for the Spotcheck review workspace.
// Unions mirror build-spec.md ("State machine"); payload details land with the
// real reducer (task P1) — F1 fixes the member names and the actor envelope.

export type FieldId =
  | 'customer_rfq_ref'
  | 'part_name'
  | 'quantity'
  | 'material'
  | 'stock_thickness'
  | 'overall_dimensions'
  | 'general_tolerance'
  | 'surface_finish'
  | 'drawing_number'
  | 'drawing_revision'
  | 'delivery';

export type FieldState = 'empty' | 'needs_review' | 'conflict' | 'missing' | 'verified';

export type ResolutionKind =
  | 'verified'
  | 'edited'
  | 'entered'
  | 'picked'
  | 'dismissed'
  | 'applied'
  | 'asked_customer';

export interface Proposal {
  value: string;
  unit?: string | null;
  source_refs: string[];
  rationale?: string;
}

export interface Candidate {
  value: string;
  unit?: string | null;
  source_refs: string[];
  note?: string;
}

export interface Searched {
  searched: string[];
  note?: string;
}

export interface Suggestion {
  value: string;
  unit?: string | null;
  source_refs: string[];
  rationale?: string;
}

export interface Resolution {
  kind: ResolutionKind;
  at: number;
}

export interface Field {
  id: FieldId;
  state: FieldState;
  value: string | null;
  unit?: string | null; // unit-bearing fields only
  locked: boolean; // first human action incl. first keystroke; never released
  proposal?: Proposal; // superseded, never removed
  candidates?: Candidate[];
  searched?: Searched;
  revised?: { was: string | null; at: number };
  suggestion?: Suggestion; // one pending; replacement is logged
  ask_customer?: boolean;
  resolution?: Resolution;
}

// Agent dispatcher action union — nothing else.
export type AgentAction =
  | { type: 'read'; input?: unknown; at?: number }
  | { type: 'propose'; input?: unknown; at?: number }
  | { type: 'report_conflict'; input?: unknown; at?: number }
  | { type: 'report_missing'; input?: unknown; at?: number }
  | { type: 'draft'; input?: unknown; at?: number };

// Human action union — the twelve members from build-spec.md.
export type HumanAction =
  | { type: 'verify'; field_id?: FieldId; at?: number }
  | { type: 'edit'; field_id?: FieldId; value?: string; unit?: string | null; at?: number }
  | { type: 'edit_start'; field_id?: FieldId; at?: number }
  | { type: 'enter'; field_id?: FieldId; value?: string; unit?: string | null; at?: number }
  | { type: 'pick'; field_id?: FieldId; index?: number; at?: number }
  | { type: 'dismiss'; field_id?: FieldId; reason?: string; at?: number }
  | { type: 'apply' }
  | { type: 'dismiss_suggestion' }
  | { type: 'ask_customer' }
  | { type: 'send' }
  | { type: 'reopen' }
  | { type: 'confirm' };

export type DispatchedEvent =
  | { actor: 'agent'; action: AgentAction }
  | { actor: 'human'; action: HumanAction };

export interface AppState {
  confirmed: boolean;
  fields: Field[];
}
