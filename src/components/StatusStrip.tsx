import { useEffect, useMemo, useRef, useState } from 'react';
import { useNarrowLayout } from '../hooks/useNarrowLayout';
import { useReview } from '../hooks/useReview';
import { ChevronDownIcon } from '../icons';
import { plural } from '../lib/format';
import type { AgentAction } from '../state/types';
import { Button } from './Button';
import { useReplay } from '../hooks/useReplay';
import { startSample } from '../replay/controller';
import { ReplayControls } from './ReplayControls';
import { ExportSessionButton } from './ExportSessionButton';

const PROMPT = 'Extract this RFQ into a quote request';
const MARKER_MS = 2_000;
const NO_API_LONG = 'Live mode needs a WebMCP-capable desktop browser: the ChatGPT desktop app’s browser, or Chrome 149+ with the WebMCP flag.';
const NO_API_SHORT = 'Live mode needs a WebMCP-capable desktop browser.';
// The page has to orient a first-time reader on its own: what the documents
// are, what the task is. It shows only before the first tool call.
const INTRO = 'This page holds a customer’s RFQ package: email, spec and drawing. Your agent fills the 11 quote-request fields through the page’s tools; you check each against its source and confirm.';

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
  onPlaySample = () => { void startSample(); },
}: StatusStripProps) {
  const { confirmed, gaps, log } = useReview();
  const replay = useReplay();
  const narrow = useNarrowLayout();
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
  const lastCalled = lastAgent ? toolForAction(lastAgent.event.action as AgentAction) : undefined;
  const live = agentEntries.length > 0 || replay.active;

  // The row last called stays lit for two seconds, and a roster that grows or
  // shrinks says so in the count for the same two seconds.
  const [markedTool, setMarkedTool] = useState<string>();
  useEffect(() => {
    if (!lastCalled) return;
    setMarkedTool(lastCalled);
    const timer = window.setTimeout(() => setMarkedTool(undefined), MARKER_MS);
    return () => window.clearTimeout(timer);
  }, [agentEntries.length, lastCalled]);

  const rosterSize = tools.length;
  const previousSize = useRef(rosterSize);
  const [sizeChange, setSizeChange] = useState<string>();
  useEffect(() => {
    const before = previousSize.current;
    previousSize.current = rosterSize;
    if (before === rosterSize) return;
    setSizeChange(`${before} → ${rosterSize} tools`);
    const timer = window.setTimeout(() => setSizeChange(undefined), MARKER_MS);
    return () => window.clearTimeout(timer);
  }, [rosterSize]);
  // Precedence per the task's status-strip table: a replay started in a browser
  // without the API is live from its first step, and the sample button leaves.
  const state = confirmed ? 'confirmed' : live ? 'live' : apiAvailable ? 'waiting' : 'no-api';

  const copyPrompt = () => void navigator.clipboard?.writeText(PROMPT);
  const preLive = state === 'no-api' || state === 'waiting';

  return (
    <section className={`status-strip status-strip--${state}`} aria-label="Session status">
      {preLive && <p className="status-strip__intro">{INTRO}</p>}
      <div className="status-strip__line">
        <div className="status-strip__summary">
          <span
            aria-hidden="true"
            className={`status-strip__dot${live || confirmed ? ' status-strip__dot--settled' : ''}`}
          />
          {state === 'no-api' && <span className="status-strip__text">{narrow ? NO_API_SHORT : NO_API_LONG}</span>}
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
              <span className="numeric">{sizeChange ?? plural(rosterSize, 'tool', 'tools')} · {plural(agentEntries.length, 'call', 'calls')}</span>
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
        {preLive && (
          <Button size="compact" variant={state === 'no-api' ? 'primary' : 'secondary'} onClick={onPlaySample}>Play sample session</Button>
        )}
        {state === 'live' && <div className="status-strip__export-slot"><ExportSessionButton /></div>}
      </div>
      <ReplayControls />
      {toolsOpen && state === 'live' && (
        <ul className="status-strip__roster">
          {tools.map(tool => (
            <li
              className={tool.name === markedTool ? 'status-strip__roster-row--called' : undefined}
              key={tool.name}
            >
              <code>{tool.name}</code>
              <span>{tool.readOnly ? 'read' : 'write'}</span>
              <span className="numeric">{plural(tool.calls, 'call', 'calls')}</span>
              {tool.code && <code>{tool.code}</code>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
