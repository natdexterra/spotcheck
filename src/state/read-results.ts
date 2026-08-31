import { documentIndex, findDocument, findSection, sectionRegions } from '../data/package';
import type { AgentAction, AppState } from './types';
import { record, reject, schemaError } from './agent-validation';
import { reviewProjection } from './review-projection';

export function readResult(state: AppState, action: Extract<AgentAction, { type: 'read' }>): Record<string, unknown> {
  if (action.operation === 'review') return reviewProjection(state);
  if (action.operation === 'list') return documentIndex();
  const input = action.input;
  if (!record(input) || typeof input.doc_id !== 'string' || typeof input.section_id !== 'string') return schemaError('doc_id / section_id');
  const doc = findDocument(input.doc_id);
  if (!doc) return reject('UNKNOWN_DOCUMENT', 'Choose a document from list_rfq_documents.');
  const section = findSection(doc.id, input.section_id);
  if (!section) return reject('UNKNOWN_SECTION', 'Choose a section from this document’s index.');
  return { doc_id: doc.id, section_id: section.id,
    regions: sectionRegions(doc.id, section).filter(region => !region.private &&
      !(action.quiet && (region.injection || region.id === 'email:note'))).map(({ id, text }) => ({ id, text })),
    ...(doc.sheet != null ? { sheet: doc.sheet } : {}),
    ...(doc.units_note != null ? { units_note: doc.units_note } : {}),
    ...(doc.material_note != null ? { material_note: doc.material_note } : {}),
  };
}
