import { getState, replaceState } from '../state/store';
import { createInitialState, FIELD_IDS, reviewSession } from '../state/session';
import { record } from '../state/agent-validation';
import { runStep } from './replay';
import type { Fixture, Step } from './replay';
import type { AgentAction, FieldId } from '../state/types';
import type { ToolName } from '../webmcp-tools';

const toolNames: ToolName[] = ['list_rfq_documents', 'read_document', 'get_review_state', 'propose_field', 'report_conflict', 'report_missing', 'draft_clarification'];
const humanNames = ['verify', 'edit', 'edit_start', 'enter', 'pick', 'dismiss', 'apply', 'dismiss_suggestion', 'ask_customer', 'send', 'reopen', 'confirm'];
const toolForAction = (action: AgentAction): ToolName => {
  if (action.type === 'read') return action.operation === 'section' ? 'read_document' : action.operation === 'review' ? 'get_review_state' : 'list_rfq_documents';
  return action.type === 'propose' ? 'propose_field' : action.type === 'draft' ? 'draft_clarification' : action.type;
};

export function exportSession(recorded_at = new Date().toISOString(), pretty = false): string {
  const steps: Step[] = reviewSession(getState()).log.map(entry => {
    if (entry.event.actor === 'agent') return { actor: 'agent', at: entry.at,
      call: { tool: toolForAction(entry.event.action), input: entry.event.action.input } };
    const { at: _at, ...action } = entry.event.action;
    return { actor: 'estimator', at: entry.at, action };
  });
  return JSON.stringify({ recorded_at, steps }, null, pretty ? 2 : undefined);
}

export function parseFixture(serialized: string): Fixture {
  const data: unknown = JSON.parse(serialized);
  if (!record(data) || typeof data.recorded_at !== 'string' || !Array.isArray(data.steps)) throw new Error('Supply a recorded_at string and steps array.');
  for (const [index, step] of data.steps.entries()) {
    const fail = () => { throw new Error(`Invalid fixture step ${index}.`); };
    if (!record(step) || typeof step.at !== 'number' || !Number.isFinite(step.at)) fail();
    if (step.actor === 'agent') {
      if (!record(step.call) || !toolNames.includes(step.call.tool as ToolName) || !('input' in step.call)) fail();
    } else if (step.actor === 'estimator') {
      const action = step.action;
      if (!record(action) || !humanNames.includes(action.type as string)) fail();
      if (action.field_id !== undefined && !FIELD_IDS.includes(action.field_id as FieldId)) fail();
      for (const key of ['value', 'reason', 'subject', 'body', 'replay_skip']) if (action[key] !== undefined && typeof action[key] !== 'string') fail();
      if (action.unit !== undefined && action.unit !== null && !['in', 'mm'].includes(action.unit as string)) fail();
      if (action.index !== undefined && !Number.isInteger(action.index)) fail();
      if (action.covers !== undefined && (!Array.isArray(action.covers) || action.covers.some((id: unknown) => !FIELD_IDS.includes(id as FieldId)))) fail();
    } else fail();
  }
  return data as unknown as Fixture;
}

export async function importSession(serialized: string): Promise<void> {
  const fixture = parseFixture(serialized);
  replaceState(createInitialState());
  for (const step of fixture.steps) await runStep(step);
}
