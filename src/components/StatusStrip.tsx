import { useMemo, useState } from 'react';
import { useReview } from '../hooks/useReview';
import { ChevronDownIcon } from '../icons';
import type { AgentAction } from '../state/types';
import { Button } from './Button';

const PROMPT = 'Extract this RFQ into a quote request';

const BASE_TOOLS = [
  ['list_rfq_documents', true],
  ['read_document', true],
  ['propose_field', false],
  ['report_conflict', false],
  ['report_missing', false],
  ['get_review_state', true],
] as const;

function toolForAction(action: AgentAction): string {
  if (action.type === 'read') {
    if (action.operation === 'list') return 'list_rfq_documents';
    if (action.operation === 'review') return 'get_review_state';
    return 'read_document';
  }
  if (action.type === 'propose') return 'propose_field';
  if (action.type === 'draft') return 'draft_clarification';
  return action.type;
}

function lastActivity(action: AgentAction | undefined): string {
  if (!action) return 'waiting for activity';
  if (action.type === 'draft') return 'agent opened the clarification draft';
  if (action.type === 'read') return action.operation === 'section' ? 'agent read a document section' : 'agent checked the review';
  if (action.type === 'propose') return 'agent proposed a field';
  if (action.type === 'report_conflict') return 'agent reported a conflict';
  return 'agent reported a missing field';
}

export interface StatusStripProps {
  apiAvailable?: boolean;
  onPlaySample?: () => void;
}

export function StatusStrip({
  apiAvailable = typeof document.modelContext?.registerTool === 'function',
  onPlaySample,
}: StatusStripProps) {
  const { confirmed, gaps, log } = useReview();
  const [toolsOpen, setToolsOpen] = useState(false);
  const agentEntries = useMemo(() => log.filter(entry => entry.actor === 'agent'), [log]);
  const dynamicAvailable = gaps.length > 0 && !confirmed;
  const tools = useMemo(() => {
    const roster: Array<{ name: string; readOnly: boolean }> = BASE_TOOLS.map(([name, readOnly]) => ({ name, readOnly }));
    if (dynamicAvailable) roster.push({ name: 'draft_clarification', readOnly: false });
    return roster.map(tool => {
      const calls = agentEntries.filter(entry => toolForAction(entry.event.action as AgentAction) === tool.name);
      const last = calls.at(-1);
      const code = typeof last?.result?.code === 'string' ? last.result.code : undefined;
      return { ...tool, calls: calls.length, code };
    });
  }, [agentEntries, dynamicAvailable]);
  const lastAgent = agentEntries.at(-1);
  const live = agentEntries.length > 0;
  const state = confirmed ? 'confirmed' : !apiAvailable ? 'no-api' : live ? 'live' : 'waiting';

  const copyPrompt = () => void navigator.clipboard?.writeText(PROMPT);

  return (
    <section className={`status-strip status-strip--${state}`} aria-label="Session status">
      <div className="status-strip__summary">
        <span className="status-strip__dot" aria-hidden="true" />
        {state === 'no-api' && <span>Live mode needs a WebMCP-capable desktop browser: the ChatGPT desktop app&apos;s browser, or Chrome 149+ with the WebMCP flag.</span>}
        {state === 'waiting' && (
          <>
            <strong>Waiting for your agent.</strong>
            <span>In the chat, ask:</span>
            <code>{PROMPT}</code>
            <Button variant="text" onClick={copyPrompt}>Copy</Button>
          </>
        )}
        {state === 'live' && (
          <>
            <strong>Live</strong>
            <span className="numeric">{tools.length} tools · {agentEntries.length} calls</span>
            <span>{lastActivity(lastAgent?.event.action as AgentAction | undefined)} · just now</span>
            <Button variant="text" aria-expanded={toolsOpen} onClick={() => setToolsOpen(open => !open)}>
              Show tools <ChevronDownIcon />
            </Button>
          </>
        )}
        {state === 'confirmed' && (
          <><strong>Confirmed</strong><span>Fields are read-only · the agent can still answer questions from the review state</span></>
        )}
      </div>
      {(state === 'no-api' || state === 'waiting') && (
        <Button variant={state === 'no-api' ? 'primary' : 'secondary'} onClick={onPlaySample}>Play sample session</Button>
      )}
      {state === 'live' && <span className="status-strip__export-slot" aria-label="Export session slot" />}
      {toolsOpen && state === 'live' && (
        <ul className="status-strip__roster">
          {tools.map(tool => (
            <li key={tool.name}>
              <code>{tool.name}</code>
              <span>{tool.readOnly ? 'read' : 'write'}</span>
              <span className="numeric">{tool.calls} calls</span>
              {tool.code && <code>{tool.code}</code>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
