import { useRef, useState } from 'react';
import { useNarrowLayout } from '../hooks/useNarrowLayout';
import { useReview } from '../hooks/useReview';
import { useSheetDialog } from '../hooks/useSheetDialog';
import { ChevronDownIcon, CrossIcon, OpposingArrowsIcon } from '../icons';
import { fieldLabel } from '../lib/format';
import type { LogEntry } from '../state/session';
import type { Field, FieldId } from '../state/types';
import { Button } from './Button';
import { describeRead } from '../replay/describe';
import { startImported } from '../replay/controller';
import { parseFixture } from '../replay/serialization';
import { ExportSessionButton } from './ExportSessionButton';
import { announce } from './LiveRegion';

// Notes the app writes about the agent are app copy; only the agent's own note
// text is reported speech and takes the "Agent:" prefix (DESIGN.md constraint 1).
const APP_NOTES = [
  'agent independently agrees',
  'Recorded suggestion',
  'Replaced pending suggestion',
];
const APP_NOTE_PREFIXES = ['Agent reported ', 'Auto-dismissed suggestion: ', 'Skipped fixture step:'];
const agentAuthored = (note: string): boolean =>
  !APP_NOTES.includes(note) && !APP_NOTE_PREFIXES.some(prefix => note.startsWith(prefix));

const clockTime = (at: number) => {
  const date = new Date(at);
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
};

const actionInput = (entry: LogEntry): Record<string, unknown> => {
  if (entry.event.actor !== 'agent') return {};
  const input = entry.event.action.input;
  return typeof input === 'object' && input !== null && !Array.isArray(input) ? input as Record<string, unknown> : {};
};

const entryFieldId = (entry: LogEntry): FieldId | undefined => {
  const action = entry.event.action;
  const candidate = 'field_id' in action ? action.field_id : actionInput(entry).field_id;
  return typeof candidate === 'string' ? candidate as FieldId : undefined;
};

const fieldName = (entry: LogEntry) => {
  const id = entryFieldId(entry);
  return id ? fieldLabel(id) : 'field';
};

const agentSentence = (entry: LogEntry) => {
  const action = entry.event.action;
  if (action.type === 'read') return describeRead(action.operation ?? 'list', action.input, true);
  if (entry.result?.ok === false) {
    return `Agent ${action.type === 'propose' ? 'proposal' : 'report'} for ${fieldName(entry)} was rejected — ${String(entry.result.code ?? 'ERROR')}`;
  }
  if (action.type === 'propose') return `Agent proposed ${fieldName(entry)} — ${String(actionInput(entry).value ?? '')}`;
  if (action.type === 'report_conflict') return `Agent reported a conflict on ${fieldName(entry)}`;
  if (action.type === 'report_missing') return `Agent reported ${fieldName(entry)} missing`;
  return 'Agent opened the clarification draft';
};

const humanSentence = (entry: LogEntry, fields: Field[]) => {
  const action = entry.event.action;
  const skipped = entry.notes?.find(note => note.startsWith('Skipped fixture step:'));
  if (skipped) return `You skipped ${skipped.slice('Skipped fixture step:'.length).trim()}`;
  const name = fieldName(entry);
  const field = fields.find(item => item.id === entryFieldId(entry));
  if (action.type === 'verify') return `You verified ${name}`;
  if (action.type === 'edit') return `You edited ${name} — agent ${field?.proposal?.value ?? '—'} → yours ${action.value ?? '—'}`;
  if (action.type === 'edit_start') return `You started editing ${name}`;
  if (action.type === 'enter') return `You entered ${name} — ${action.value ?? '—'}`;
  if (action.type === 'pick') return `You picked ${name} — ${field?.value ?? '—'}`;
  if (action.type === 'dismiss') return `You marked ${name} not required — ${action.reason ?? ''}`;
  if (action.type === 'apply') return `You applied the agent suggestion to ${name}`;
  if (action.type === 'dismiss_suggestion') return `You dismissed the agent suggestion for ${name}`;
  if (action.type === 'ask_customer') return `You asked the customer about ${name}`;
  if (action.type === 'send') return `You sent a clarification for ${action.covers?.length ?? 0} fields`;
  if (action.type === 'reopen') return `You reopened ${name}`;
  return 'You confirmed the quote request';
};

export const formatLogEntry = (entry: LogEntry, fields: Field[]) =>
  entry.actor === 'agent' ? agentSentence(entry) : humanSentence(entry, fields);

export const LogLine = ({ entry, fields, collapsed = false }: { entry: LogEntry; fields: Field[]; collapsed?: boolean }) => (
  <div className={`change-log__entry${collapsed ? ' change-log__entry--collapsed' : ''}`}>
    <time className="change-log__time" dateTime={new Date(entry.at).toISOString()}>{clockTime(entry.at)}</time>
    <span className="change-log__sentence">{formatLogEntry(entry, fields)}</span>
    {!collapsed && entry.notes?.filter(note => !note.startsWith('Skipped fixture step:')).map(note => (
      <span className="change-log__agent-note" key={note}>
        {agentAuthored(note) ? `Agent: ${note}` : note}
      </span>
    ))}
  </div>
);

export const ChangeLogDrawer = () => {
  const { log, state } = useReview();
  const [expanded, setExpanded] = useState(false);
  const [error, setError] = useState<string>();
  const fileRef = useRef<HTMLInputElement>(null);
  const disclosureRef = useRef<HTMLButtonElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const narrow = useNarrowLayout();
  const latest = log.at(-1);

  const importFile = async (file: File | undefined) => {
    setError(undefined);
    if (!file) return;
    try {
      const fixture = parseFixture(await file.text());
      await startImported(fixture, 'Imported session');
      setExpanded(false);
      requestAnimationFrame(() => document.querySelector<HTMLButtonElement>('.replay-controls__actions button')?.focus());
    } catch (cause) {
      const message = `Could not import: ${cause instanceof Error ? cause.message : String(cause)}`;
      setError(message); announce(message);
    } finally { if (fileRef.current) fileRef.current.value = ''; }
  };

  const close = () => {
    setExpanded(false);
    requestAnimationFrame(() => disclosureRef.current?.focus());
  };

  // Narrow only: the expanded log is a full-height sheet over the page, so it
  // owns focus while it is open. On desktop it expands in place inside the bar.
  useSheetDialog({ active: expanded && narrow, onClose: close, returnFocusRef: disclosureRef, sheetRef });

  return (
    <aside
      aria-label="Change log"
      className={`change-log${expanded ? ' change-log--expanded' : ''}`}
      id="change-log"
    >
      {!expanded ? (
        <div className="change-log__collapsed">
          {latest ? <LogLine collapsed entry={latest} fields={state.fields} /> : <p className="change-log__empty">No activity yet</p>}
          <Button aria-expanded="false" onClick={() => setExpanded(true)} ref={disclosureRef} variant="text">
            Show change log
            <ChevronDownIcon />
          </Button>
        </div>
      ) : (
        <div
          className="change-log__sheet"
          ref={sheetRef}
          {...(narrow
            ? { 'aria-labelledby': 'change-log-title', 'aria-modal': true, role: 'dialog', tabIndex: -1 }
            : {})}
        >
          <header className="change-log__header">
            <h2 id="change-log-title">Change log</h2>
            <div className="change-log__file-actions">
              <ExportSessionButton />
              <div className="session-import">
                <label className="visually-hidden" htmlFor="session-file">Import session</label>
                <input className="visually-hidden" id="session-file" ref={fileRef} type="file" accept="application/json,.json" onChange={event => void importFile(event.target.files?.[0])} />
                <Button variant="secondary" size="compact" onClick={() => fileRef.current?.click()}>Import session</Button>
              </div>
            </div>
            <Button aria-expanded="true" onClick={close} variant="text"><CrossIcon />Close</Button>
          </header>
          {error && <p className="session-error change-log__error"><OpposingArrowsIcon />{error}</p>}
          {log.length ? (
            <ol className="change-log__entries">
              {log.map((entry, index) => (
                <li key={`${entry.at}-${index}`}><LogLine entry={entry} fields={state.fields} /></li>
              ))}
            </ol>
          ) : <p className="change-log__empty">No activity yet</p>}
        </div>
      )}
    </aside>
  );
};
