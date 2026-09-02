import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { CheckedBoxIcon, LockIcon } from '../icons';
import { clockTime, displayValue, fieldLabel, NO_VALUE, searchedLabel, sourceHref, sourceLabel } from '../lib/format';
import type { SentQuestion } from '../lib/log';
import { dispatchHuman } from '../state/store';
import type { Field, FieldId } from '../state/types';
import { Button } from './Button';
import { Badge } from './Badge';
import { JumpLink } from './JumpLink';
import { ConflictPanel } from './ConflictPanel';
import { InlineEditor } from './InlineEditor';
import { NotRequiredPicker } from './NotRequiredPicker';
import { ProvenanceLink } from './ProvenanceLink';
import { SuggestionCard } from './SuggestionCard';

export interface FieldRowProps {
  /** True before the first tool call: the row is label, value and badge only. */
  bare?: boolean;
  /** The reason recorded when this field was marked not required. */
  dismissReason?: string;
  field: Field;
  /** Set when the agent's newest call on this locked field was a rejected report. */
  lockedReport?: string;
  onSource?: (ref: string, fieldId: FieldId) => void;
  now?: number;
  /** The clarification that carried this field's question to the customer. */
  sent?: SentQuestion;
}

const fieldSources = (field: Field): string[] => {
  if (field.proposal) return field.proposal.source_refs;
  return [];
};

export function FieldRow({ bare = false, dismissReason, field, lockedReport, now, onSource, sent }: FieldRowProps) {
  const [editorOpen, setEditorOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [closes, setCloses] = useState(0);
  const rowRef = useRef<HTMLElement>(null);
  const editorButtonRef = useRef<HTMLButtonElement>(null);
  const pickerButtonRef = useRef<HTMLButtonElement>(null);
  // The trigger unmounts while the editor or the picker holds the row, so
  // focus can only go back once React has put a fresh one in place. Not every
  // state has a trigger of its own; the row is the fallback (WCAG 2.4.3).
  const closedPicker = useRef(false);
  useLayoutEffect(() => {
    if (closes === 0) return;
    const trigger = closedPicker.current ? pickerButtonRef.current : editorButtonRef.current;
    (trigger ?? rowRef.current)?.focus();
  }, [closes]);
  const sources = fieldSources(field);
  // Where the agent looked is evidence, not prose: one chip per place.
  const searched = [...new Set(field.searched?.searched.map(searchedLabel) ?? [])];
  const note = field.proposal?.rationale ?? field.searched?.note ?? '';
  const showAgentOriginal = field.proposal && field.locked && field.state !== 'verified'
    ? field.proposal
    : undefined;
  // The value slot carries the value or nothing at all: how a field was
  // settled is the badge's job, never the value line's.
  const value = field.value === null
    ? NO_VALUE
    : `${field.locked && field.state !== 'verified' ? 'your entry: ' : ''}${field.value}${field.unit ? ` ${field.unit}` : ''}`;
  const openSource = onSource
    ? (ref: string) => (event: { preventDefault: () => void }) => {
      event.preventDefault();
      onSource(ref, field.id);
    }
    : undefined;
  const openEditor = () => {
    setPickerOpen(false);
    setEditorOpen(true);
  };
  const openPicker = () => {
    setEditorOpen(false);
    setPickerOpen(true);
  };
  const close = (picker: boolean) => () => {
    closedPicker.current = picker;
    if (picker) setPickerOpen(false); else setEditorOpen(false);
    setCloses(count => count + 1);
  };

  /* Export 11: one sentence under a settled value saying how it got there.
     The wording turns on the resolution kind, never on the state name. */
  const sourceRun = (refs: readonly string[]): ReactNode => refs.map(ref => (
    <span key={ref}>
      {' · '}
      <ProvenanceLink href={sourceHref(ref)} onClick={openSource?.(ref)}>{sourceLabel(ref)}</ProvenanceLink>
    </span>
  ));
  const kind = field.state === 'verified' ? field.resolution?.kind : undefined;
  let resolution: ReactNode = null;
  if (field.state === 'empty') resolution = 'The agent has proposed nothing here. It may still be reading, or it skipped the field.';
  else if (kind === 'entered') resolution = 'no agent proposal · you typed this one';
  else if (field.proposal && kind === 'verified') {
    resolution = <>the agent’s value, kept as proposed{sourceRun(field.proposal.source_refs)}</>;
  } else if (field.proposal && (kind === 'edited' || kind === 'picked' || kind === 'applied')) {
    resolution = (
      <>
        agent {displayValue(field.proposal.value, field.proposal.unit)}
        {' → yours '}
        {displayValue(field.value, field.unit)}
        {sourceRun(field.proposal.source_refs)}
      </>
    );
  } else if (kind === 'picked' && field.candidates) {
    // A conflict row is settled from its candidates: the one whose value the
    // row now carries is yours, the rest are the readings you passed over.
    const chosen = field.candidates.find(candidate =>
      candidate.value === field.value && (candidate.unit ?? null) === (field.unit ?? null));
    resolution = (
      <>
        agent {field.candidates.filter(candidate => candidate !== chosen)
          .map(candidate => displayValue(candidate.value, candidate.unit)).join(', ')}
        {' → yours '}
        {displayValue(field.value, field.unit)}
        {sourceRun(chosen?.source_refs ?? [])}
      </>
    );
  } else if (kind === 'dismissed' && dismissReason) {
    resolution = `your reason: ${dismissReason}`;
  } else if (kind === 'asked_customer' && sent) {
    // Export 11: the row says when the question went and how much of the
    // clarification it shares, then points at the text that was sent.
    const others = sent.covers.filter(id => id !== field.id).map(fieldLabel);
    resolution = (
      <>
        sent {clockTime(sent.at)} · covers this field{others.length > 0 ? ` and ${others.join(', ')}` : ''}
        {' · '}
        <JumpLink href="#source-panel-clarification" onClick={openSource?.('clarification')}>
          see the sent text
        </JumpLink>
      </>
    );
  }
  // Export 11: when the row carries a resolution sentence the sentence holds
  // the provenance, so the row keeps no separate line of links.
  const showResolution = resolution !== null && !editorOpen && !bare;

  return (
    <article
      className={`field-row field-row--${field.state}${bare ? ' field-row--bare' : ''}`}
      data-field-id={field.id}
      id={`field-${field.id}`}
      ref={rowRef}
      tabIndex={-1}
    >
      <div className="field-row__label">
        <span>{fieldLabel(field.id)}</span>
        {field.locked ? <LockIcon /> : null}
      </div>

      {editorOpen ? null : <div className="field-row__value">{value}</div>}
      <Badge field={field} now={now} />

      {!editorOpen && sources.length > 0 && !showAgentOriginal && !showResolution ? (
        <div className="field-row__sources">
          {sources.map(ref => (
            <ProvenanceLink href={sourceHref(ref)} key={ref} onClick={openSource?.(ref)}>
              {sourceLabel(ref)}
            </ProvenanceLink>
          ))}
        </div>
      ) : null}

      {searched.length > 0 && !editorOpen ? (
        <div className="field-row__chips">
          {searched.map(place => <span className="field-row__chip" key={place}>{place}</span>)}
        </div>
      ) : null}

      {note && !editorOpen ? <p className="field-row__agent-note">Agent: {note}</p> : null}
      {lockedReport && !editorOpen ? (
        <p className="field-row__agent-note">
          Agent: {lockedReport} <JumpLink href="#change-log">see log</JumpLink>
        </p>
      ) : null}
      {field.revised && !editorOpen ? <p className="field-row__revision">was: {field.revised.was ?? NO_VALUE}</p> : null}
      {showAgentOriginal && !editorOpen ? (
        <p className="field-row__agent-original">
          agent {showAgentOriginal.value}
          {showAgentOriginal.source_refs.map(ref => (
            <span key={ref}>
              {' \u00b7 '}
              <ProvenanceLink href={sourceHref(ref)} onClick={openSource?.(ref)}>{sourceLabel(ref)}</ProvenanceLink>
            </span>
          ))}
        </p>
      ) : null}

      {showResolution ? (
        <p className="field-row__resolution">{resolution}</p>
      ) : null}

      {field.state === 'needs_review' && !editorOpen ? (
        <div className="field-row__actions">
          {field.id === 'overall_dimensions' && field.unit == null ? (
            <Button ref={editorButtonRef} variant="secondary" onClick={openEditor}>Add unit</Button>
          ) : (
            <Button
              ref={editorButtonRef}
              variant="secondary"
              onClick={() => dispatchHuman({ type: 'verify', field_id: field.id, at: Date.now() })}
            >
              Verify
            </Button>
          )}
          <Button variant="text" onClick={openEditor}>Edit</Button>
          <Button
            aria-pressed={field.ask_customer === true}
            variant="text"
            onClick={() => dispatchHuman({ type: 'ask_customer', field_id: field.id, at: Date.now() })}
          >
            {field.ask_customer ? <CheckedBoxIcon /> : null}
            Ask customer
          </Button>
        </div>
      ) : null}

      {field.ask_customer && !editorOpen ? (
        <p className="field-row__resolution">
          Marked for the clarification email. This field still counts as open.
        </p>
      ) : null}

      {field.state === 'conflict' && !editorOpen ? (
        <ConflictPanel
          editorButtonRef={editorButtonRef}
          field={field}
          onOpenEditor={openEditor}
          onSource={openSource}
        />
      ) : null}

      {(field.state === 'missing' || field.state === 'empty') && !editorOpen && !bare ? (
        <div className="field-row__actions">
          <Button ref={editorButtonRef} variant="secondary" onClick={openEditor}>Enter value</Button>
          <Button ref={pickerButtonRef} variant="text" onClick={openPicker}>Mark not required</Button>
        </div>
      ) : null}

      {field.state === 'verified' && !editorOpen ? (
        <div className="field-row__actions">
          <Button
            variant="text"
            onClick={() => dispatchHuman({ type: 'reopen', field_id: field.id, at: Date.now() })}
          >
            Reopen
          </Button>
        </div>
      ) : null}

      {editorOpen ? (
        <InlineEditor field={field} onClose={close(false)} onSource={openSource} />
      ) : null}
      {pickerOpen ? (
        <NotRequiredPicker field={field} onClose={close(true)} />
      ) : null}
      {field.suggestion ? <SuggestionCard field={field} onSource={openSource} /> : null}
    </article>
  );
}
