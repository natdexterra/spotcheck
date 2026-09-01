import { useRef, useState } from 'react';
import { CheckedBoxIcon, LockIcon } from '../icons';
import { fieldLabel, sourceHref, sourceLabel } from '../lib/format';
import { dispatchHuman } from '../state/store';
import type { Field, FieldId } from '../state/types';
import { Button } from './Button';
import { Badge } from './Badge';
import { ConflictPanel } from './ConflictPanel';
import { InlineEditor } from './InlineEditor';
import { NotRequiredPicker } from './NotRequiredPicker';
import { ProvenanceLink } from './ProvenanceLink';
import { SuggestionCard } from './SuggestionCard';

export interface FieldRowProps {
  field: Field;
  onSource?: (ref: string, fieldId: FieldId) => void;
  now?: number;
}

const fieldSources = (field: Field): string[] => {
  if (field.proposal) return field.proposal.source_refs;
  return [];
};

export function FieldRow({ field, now, onSource }: FieldRowProps) {
  const [editorOpen, setEditorOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const editorButtonRef = useRef<HTMLButtonElement>(null);
  const pickerButtonRef = useRef<HTMLButtonElement>(null);
  const sources = fieldSources(field);
  const note = field.proposal?.rationale ?? field.searched?.note;
  const showAgentOriginal = field.proposal && (
    (field.state === 'verified' &&
      (field.resolution?.kind === 'edited' || field.resolution?.kind === 'picked' || field.resolution?.kind === 'applied')) ||
    (field.locked && field.state !== 'verified')
  ) ? field.proposal : undefined;
  const nullResolution = field.resolution?.kind;
  const value = field.value === null
    ? nullResolution === 'dismissed'
      ? 'Not required'
      : nullResolution === 'asked_customer'
        ? 'Awaiting customer'
        : '—'
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

  return (
    <article className={`field-row field-row--${field.state}`} id={`field-${field.id}`} data-field-id={field.id}>
      <div className="field-row__label">
        <span>{fieldLabel(field.id)}</span>
        {field.locked ? <LockIcon /> : null}
      </div>

      <div className="field-row__value">{value}</div>
      <Badge field={field} now={now} />

      {sources.length > 0 ? (
        <div className="field-row__sources">
          {sources.map(ref => (
            <ProvenanceLink href={sourceHref(ref)} key={ref} onClick={openSource?.(ref)}>
              {sourceLabel(ref)}
            </ProvenanceLink>
          ))}
        </div>
      ) : null}

      {field.searched ? (
        <div className="field-row__searched" aria-label="Searched documents">
          {field.searched.searched.map(ref => <span className="field-row__chip" key={ref}>{sourceLabel(ref)}</span>)}
        </div>
      ) : null}

      {note ? <p className="field-row__agent-note">Agent: {note}</p> : null}
      {field.revised ? <p className="field-row__revision">was: {field.revised.was ?? '—'}</p> : null}
      {showAgentOriginal ? (
        <p className="field-row__agent-original">agent {showAgentOriginal.value}</p>
      ) : null}

      {field.state === 'needs_review' ? (
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

      {field.state === 'conflict' ? (
        <ConflictPanel field={field} onOpenEditor={openEditor} onSource={openSource} />
      ) : null}

      {field.state === 'missing' || field.state === 'empty' ? (
        <div className="field-row__actions">
          <Button ref={editorButtonRef} variant="secondary" onClick={openEditor}>Enter value</Button>
          <Button ref={pickerButtonRef} variant="text" onClick={openPicker}>Mark not required</Button>
        </div>
      ) : null}

      {field.state === 'verified' ? (
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
        <InlineEditor field={field} onClose={() => setEditorOpen(false)} returnFocusRef={editorButtonRef} />
      ) : null}
      {pickerOpen ? (
        <NotRequiredPicker field={field} onClose={() => setPickerOpen(false)} returnFocusRef={pickerButtonRef} />
      ) : null}
      {field.suggestion ? <SuggestionCard field={field} onSource={openSource} /> : null}
    </article>
  );
}
