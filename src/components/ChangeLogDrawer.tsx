import { useRef, useState } from 'react';
import { useNarrowLayout } from '../hooks/useNarrowLayout';
import { useReview } from '../hooks/useReview';
import { useSheetDialog } from '../hooks/useSheetDialog';
import { ChevronDownIcon, CrossIcon, OpposingArrowsIcon } from '../icons';
import { clockTime, displayValue, fieldLabel, NO_VALUE, plural } from '../lib/format';
import type { LogEntry } from '../state/session';
import type { Field, FieldId } from '../state/types';
import { Button } from './Button';
import { describeRead } from '../replay/describe';
import { clearReview, focusPause, startImported, startSample } from '../replay/controller';
import { useReplay } from '../hooks/useReplay';
import { parseFixture } from '../replay/serialization';
import { ConfirmDialog } from './ConfirmDialog';
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
    return `Agent ${action.type === 'propose' ? 'proposal' : 'report'} for ${fieldName(entry)} was rejected: ${String(entry.result.code ?? 'ERROR')}`;
  }
  if (action.type === 'propose') return `Agent proposed ${fieldName(entry)}: ${String(actionInput(entry).value ?? '')}`;
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
  if (action.type === 'edit') {
    const was = displayValue(field?.proposal?.value ?? null, field?.proposal?.unit);
    return `You edited ${name}: agent ${was} → yours ${displayValue(action.value ?? null, action.unit)}`;
  }
  if (action.type === 'edit_start') return `You started editing ${name}`;
  if (action.type === 'enter') return `You entered ${name}: ${action.value ?? NO_VALUE}`;
  if (action.type === 'pick') return `You picked ${name}: ${field?.value ?? NO_VALUE}`;
  if (action.type === 'dismiss') return `You marked ${name} not required: ${action.reason ?? ''}`;
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
    {/* Expanded, the time is a column of its own and needs no separator; on the
        collapsed bar the two run as one line (exports 02, 16). */}
    {collapsed ? <span aria-hidden="true">·</span> : null}
    <span className="change-log__sentence">{formatLogEntry(entry, fields)}</span>
    {!collapsed && entry.notes?.filter(note => !note.startsWith('Skipped fixture step:')).map(note => (
      <span className="change-log__agent-note" key={note}>
        {agentAuthored(note) ? `Agent: ${note}` : note}
      </span>
    ))}
  </div>
);

export interface ChangeLogDrawerProps {
  /** Given only where the strip is not carrying it, so the way in stands in one place. */
  onOpenPackage?: () => void;
}

export const ChangeLogDrawer = ({ onOpenPackage }: ChangeLogDrawerProps = {}) => {
  const { confirmed, log, state } = useReview();
  const replay = useReplay();
  const [expanded, setExpanded] = useState(false);
  const [startOverOpen, setStartOverOpen] = useState(false);
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
      focusPause();
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
          {/* Exports 01, 02, 16: the bar is named at the left and counted at
              the right, and the last entry fills whatever is left between. */}
          <span className="change-log__label">Change log</span>
          {latest ? <LogLine collapsed entry={latest} fields={state.fields} /> : <p className="change-log__empty">No activity yet</p>}
          <Button
            aria-controls="change-log"
            aria-expanded="false"
            aria-label={`Show change log, ${plural(log.length, 'entry', 'entries')}`}
            onClick={() => setExpanded(true)}
            ref={disclosureRef}
            variant="text"
          >
            {plural(log.length, 'entry', 'entries')}
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
            <p className="change-log__meta">{plural(log.length, 'entry', 'entries')} · agent and you</p>
            <div className="change-log__file-actions">
              {!replay.active && log.length > 0 && <Button variant="secondary" onClick={async () => { await startSample(); setExpanded(false); focusPause(); }}>Play sample session</Button>}
              {onOpenPackage && (
                <Button variant="text" onClick={() => { setExpanded(false); onOpenPackage(); }}>
                  Open your own package
                </Button>
              )}
              {/* The one control on the page that throws a person's own work
                  away, so it asks before it does (the confirm screen keeps its
                  own Start over). */}
              {!replay.active && !confirmed && log.length > 0 && (
                <Button variant="text" onClick={() => setStartOverOpen(true)}>Start over</Button>
              )}
              <ExportSessionButton />
              <div className="session-import">
                <label className="visually-hidden" htmlFor="session-file">Import session</label>
                <input className="visually-hidden" id="session-file" ref={fileRef} type="file" accept="application/json,.json" onChange={event => void importFile(event.target.files?.[0])} />
                {/* The native input is the control: it holds the tab stop and
                    the focus ring (.session-import:has(input:focus-visible)).
                    The visible button only forwards a pointer click, so it
                    stays out of the tab order and out of the accessibility
                    tree; otherwise "Import session" would name two controls. */}
                <Button aria-hidden="true" tabIndex={-1} variant="secondary" size="compact" onClick={() => fileRef.current?.click()}>Import session</Button>
              </div>
            </div>
            <Button aria-controls="change-log" aria-expanded="true" onClick={close} variant="text"><CrossIcon />Close</Button>
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
      <ConfirmDialog
        confirmLabel="Start over"
        message={`This discards ${plural(log.length, 'entry', 'entries')} and every value on the page.`}
        onCancel={() => setStartOverOpen(false)}
        onConfirm={() => { setStartOverOpen(false); clearReview(); announce('Review cleared'); }}
        open={startOverOpen}
        title="Start over?"
      />
    </aside>
  );
};
