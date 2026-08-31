import { resolvesSearch, resolvesSource } from '../data/package';
import { FIELD_IDS } from './session';
import type { AgentAction, FieldId } from './types';

export type Result = Record<string, unknown>;
export const reject = (code: string, message: string, extras: Result = {}): Result => ({ ok: false, code, message, ...extras });
export const schemaError = (path: string): Result => reject('SCHEMA', `Supply a valid ${path}.`, { path });
export const record = (input: unknown): input is Record<string, unknown> =>
  input !== null && typeof input === 'object' && !Array.isArray(input);
const nonempty = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;
const capError = (path: string, limit: number, kind = 'characters'): Result =>
  reject('SCHEMA', `Keep ${path} within ${limit} ${kind}.`, { path });

function validateValue(input: Record<string, unknown>, field: unknown, path: string): Result | undefined {
  if (!nonempty(input.value) || (field === 'quantity' && !/^\d+$/.test(input.value))) return schemaError(`${path}value`);
  if (input.value.length > 400) return capError(`${path}value`, 400);
  if (typeof input.unit === 'string' && input.unit.length > 40) return capError(`${path}unit`, 40);
  if (input.unit !== undefined && (field !== 'overall_dimensions' || !['in', 'mm'].includes(input.unit as string))) return schemaError(`${path}unit`);
  if (!Array.isArray(input.source_refs) || !input.source_refs.length)
    return reject('NO_SOURCE_REF', 'Supply at least one source region or section.', { path: `${path}source_refs` });
  if (input.source_refs.length > 12) return capError(`${path}source_refs`, 12, 'refs');
  if (input.source_refs.some(ref => typeof ref === 'string' && ref.length > 64))
    return reject('SCHEMA', `Keep each ${path}source_refs entry within 64 characters.`, { path: `${path}source_refs` });
  const badIndex = input.source_refs.findIndex(ref => typeof ref !== 'string' || !resolvesSource(ref));
  if (badIndex >= 0) return reject('INVALID_SOURCE_REF', 'Use a region or section from the document index.', { ref: input.source_refs[badIndex] });
  for (const key of ['rationale', 'note']) {
    const member = input[key];
    if (member !== undefined && typeof member !== 'string') return schemaError(`${path}${key}`);
    if (typeof member === 'string' && member.length > 600) return capError(`${path}${key}`, 600);
  }
}

export function validateWrite(action: AgentAction): Result | undefined {
  const input = action.input;
  if (!record(input)) return schemaError('input');
  if (action.type === 'draft') {
    if (!nonempty(input.subject)) return schemaError('subject');
    if (input.subject.length > 200) return capError('subject', 200);
    if (!nonempty(input.body)) return schemaError('body');
    if (input.body.length > 4000) return capError('body', 4000);
    if (!Array.isArray(input.covers)) return schemaError('covers');
    if (input.covers.some(id => !FIELD_IDS.includes(id as FieldId))) return reject('UNKNOWN_FIELD', 'Use the field ids in get_review_state.');
    return;
  }
  if (!FIELD_IDS.includes(input.field_id as FieldId)) return reject('UNKNOWN_FIELD', 'Use one of the eleven field ids.');
  if (action.type === 'propose') return validateValue(input, input.field_id, '');
  if (input.note !== undefined && typeof input.note !== 'string') return schemaError('note');
  if (typeof input.note === 'string' && input.note.length > 600) return capError('note', 600);
  if (action.type === 'report_missing') {
    if (!Array.isArray(input.searched) || !input.searched.length) return schemaError('searched');
    const badIndex = input.searched.findIndex(ref => typeof ref !== 'string' || !resolvesSearch(ref));
    if (badIndex >= 0) return reject('INVALID_SOURCE_REF', 'Name a searched document or section from the index.', { ref: input.searched[badIndex] });
  }
  if (action.type === 'report_conflict') {
    if (!Array.isArray(input.candidates) || input.candidates.length < 2) return schemaError('candidates');
    if (input.candidates.length > 8) return capError('candidates', 8, 'candidates');
    for (const [index, candidate] of input.candidates.entries()) {
      if (!record(candidate)) return schemaError(`candidates[${index}]`);
      const error = validateValue(candidate, input.field_id, `candidates[${index}].`);
      if (error) return error;
    }
  }
}
