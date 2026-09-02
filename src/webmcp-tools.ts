import { dispatchAgent } from './state/store';
import { selectDraftAvailable, selectToolResult, subscribeReview } from './state/selectors';

interface Tool {
  name: string; description: string; inputSchema: object;
  annotations?: { readOnlyHint?: boolean; untrustedContentHint?: boolean };
  execute: (input: unknown) => Promise<unknown>;
}
declare global {
  interface Document { modelContext?: { registerTool(tool: Tool, options?: { signal: AbortSignal }): void } }
}

export type ToolName = 'list_rfq_documents' | 'read_document' | 'propose_field' | 'report_conflict' |
  'report_missing' | 'get_review_state' | 'draft_clarification';

export async function executeTool(name: ToolName, input: unknown, at = Date.now()): Promise<Record<string, unknown>> {
  if (input === undefined) input = {};
  if (name === 'draft_clarification') draftInFlight++;
  try {
  switch (name) {
    case 'list_rfq_documents': dispatchAgent({ type: 'read', operation: 'list', input, at }); break;
    case 'read_document': dispatchAgent({ type: 'read', operation: 'section', input, at,
      quiet: typeof location !== 'undefined' && new URLSearchParams(location.search).get('quiet') === '1' }); break;
    case 'get_review_state': dispatchAgent({ type: 'read', operation: 'review', input, at }); break;
    case 'propose_field': dispatchAgent({ type: 'propose', input, at }); break;
    case 'report_conflict': dispatchAgent({ type: 'report_conflict', input, at }); break;
    case 'report_missing': dispatchAgent({ type: 'report_missing', input, at }); break;
    case 'draft_clarification': dispatchAgent({ type: 'draft', input, at }); break;
    default: return { ok: false, code: 'SCHEMA', message: 'Choose a registered tool.', path: 'tool' };
  }
  const result = selectToolResult(name === 'list_rfq_documents' || name === 'read_document' || name === 'get_review_state');
  return await Promise.resolve(structuredClone(result));
  } finally {
    if (name === 'draft_clarification') {
      // Finally still runs inside the returned Promise. Release the registration on the next turn,
      // after that Promise and its caller's settlement handlers have completed.
      setTimeout(() => { draftInFlight--; syncDraftTool(); }, 0);
    }
  }
}

const text = (description: string) => ({ type: 'string', description });
const field = text('One of the 11 field ids in the taxonomy.');
const value = text('The proposed value, as it should appear in the quote request.');
const unit = text('Unit for the unit-bearing field (in or mm). Omit if the sources state none.');
const refs = { type: 'array', items: { type: 'string' }, description: 'Region or section ids the value comes from. At least one is required.' };
const schema = (properties: object = {}) => ({ type: 'object', properties });
let registered = false;
let draftController: AbortController | undefined;
let draftInFlight = 0;

function syncDraftTool(): void {
  if (!registered || !document.modelContext) return;
  if (selectDraftAvailable()) {
    if (draftController) return;
    draftController = new AbortController();
    document.modelContext.registerTool({
      name: 'draft_clarification',
      description: 'Opens a clarification-email draft for the estimator, with your subject, body and the gap fields it covers. The estimator edits and sends it; the covered fields are then marked as asked. Available while open gaps exist.',
      inputSchema: schema({ subject: { type: 'string' }, body: { type: 'string' }, covers: { type: 'array', items: { type: 'string' } } }),
      execute: input => executeTool('draft_clarification', input),
    }, { signal: draftController.signal });
  } else if (draftController && draftInFlight === 0) {
    draftController.abort();
    draftController = undefined;
  }
}

export function registerTools(): void {
  if (typeof document === 'undefined' || typeof document.modelContext?.registerTool !== 'function') return;
  if (typeof window !== 'undefined' && window.top !== window) return;
  if (registered) return;
  registered = true;
  const controller = new AbortController();
  document.modelContext.registerTool({
    name: 'list_rfq_documents',
    description: 'Lists the documents in the RFQ package with their section index. Call once at the start to learn what can be read; use the section ids with read_document.',
    inputSchema: schema(), annotations: { readOnlyHint: true }, execute: input => executeTool('list_rfq_documents', input),
  }, { signal: controller.signal });
  document.modelContext.registerTool({
    name: 'read_document',
    description: 'Reads one section of one document and returns its text as regions with stable ids. Use those region ids as source_refs when proposing values. One section per call; output is capped, so read the sections you need.',
    inputSchema: schema({ doc_id: text('Document id from list_rfq_documents: email, spec or drawing.'), section_id: text("Section id from that document's index, e.g. s3 or overall.") }),
    annotations: { readOnlyHint: true, untrustedContentHint: true }, execute: input => executeTool('read_document', input),
  }, { signal: controller.signal });
  document.modelContext.registerTool({
    name: 'propose_field',
    description: 'Proposes a value for one quote-request field, with the source regions it came from. The field enters needs_review for the estimator to check. A field the estimator has already acted on keeps its value; your proposal is shown to them as a suggestion instead. Keep value short and as written in the source; explanation goes in rationale.',
    inputSchema: schema({ field_id: field, value, unit, source_refs: refs, rationale: text('One sentence on why this value; the estimator reads it.') }),
    execute: input => executeTool('propose_field', input),
  }, { signal: controller.signal });
  document.modelContext.registerTool({
    name: 'report_conflict',
    description: 'Reports that the sources disagree about a field. Include every candidate with its value and sources — the estimator resolves the conflict; you cannot. A candidate may record an absence ("none stated") with the section where the value should have been.',
    inputSchema: schema({ field_id: field, candidates: { type: 'array', items: schema({ value, unit, source_refs: refs, note: { type: 'string' } }) }, note: { type: 'string' } }),
    execute: input => executeTool('report_conflict', input),
  }, { signal: controller.signal });
  document.modelContext.registerTool({
    name: 'report_missing',
    description: "Reports that a field's value is absent after a real search, naming where you looked. Use this instead of guessing; the estimator sees the searched places and decides what to do.",
    inputSchema: schema({ field_id: field, searched: { type: 'array', items: { type: 'string' } }, note: { type: 'string' } }),
    execute: input => executeTool('report_missing', input),
  }, { signal: controller.signal });
  document.modelContext.registerTool({
    name: 'get_review_state',
    description: 'Returns the whole review: every field with its state, value and lock, which fields are still unverified, and which are open gaps. Call it to plan your next step or to answer questions about the review.',
    inputSchema: schema(), annotations: { readOnlyHint: true, untrustedContentHint: true }, execute: input => executeTool('get_review_state', input),
  }, { signal: controller.signal });
  subscribeReview(syncDraftTool);
  syncDraftTool();
}

registerTools();
