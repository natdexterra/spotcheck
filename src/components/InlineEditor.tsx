import { useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode, type RefObject } from 'react';
import { ErrorIcon } from '../icons';
import { fieldLabel, sourceHref, sourceLabel } from '../lib/format';
import { dispatchHuman } from '../state/store';
import type { Field } from '../state/types';
import { Button } from './Button';
import type { SourceHandler } from './CandidateOption';
import { ProvenanceLink } from './ProvenanceLink';

export interface InlineEditorProps {
  field: Field;
  onClose: () => void;
  onSource?: SourceHandler;
  returnFocusRef?: RefObject<HTMLElement | null>;
}

type Unit = 'in' | 'mm';

const validUnit = (unit: string | null | undefined): unit is Unit => unit === 'in' || unit === 'mm';

const UNIT_MISSING = 'no unit given · the value cannot be verified until a unit is set';
const NO_PROPOSAL = 'no agent proposal · whatever you type here is yours alone';
const CLEARED = 'The field is already locked · you typed and cleared it';
const LOCKS_UNIT = 'Locks on the first keystroke · after that no agent proposal can replace what you are typing';
const LOCKS = 'Locks on the first keystroke.';

export const InlineEditor = ({ field, onClose, onSource, returnFocusRef }: InlineEditorProps) => {
  const [value, setValue] = useState(field.state === 'empty' ? '' : field.value ?? '');
  const [unit, setUnit] = useState<Unit | ''>(validUnit(field.unit) ? field.unit : '');
  const [error, setError] = useState('');
  const [cleared, setCleared] = useState(false);
  const editingStarted = useRef(false);
  const errorId = `${field.id}-editor-error`;
  const label = fieldLabel(field.id);
  const unitBearing = field.id === 'overall_dimensions';
  const proposal = field.proposal;
  const firstSource = proposal?.source_refs[0];

  const startEditing = () => {
    if (editingStarted.current) return;
    editingStarted.current = true;
    dispatchHuman({ type: 'edit_start', field_id: field.id, at: Date.now() });
  };

  const closeAndReturnFocus = () => {
    onClose();
    returnFocusRef?.current?.focus();
  };

  const validate = () => {
    if (!value.trim()) return 'Enter a value or cancel';
    if (field.id === 'quantity' && !/^\d+$/.test(value)) return 'Quantity is a whole number';
    if (unitBearing && !unit) return 'Choose in or mm';
    return '';
  };

  const save = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }

    dispatchHuman({
      // A field with no value is being entered, whether the agent never
      // extracted it (empty) or searched and found nothing (missing).
      type: field.value == null ? 'enter' : 'edit',
      field_id: field.id,
      value,
      at: Date.now(),
      ...(unitBearing ? { unit } : {}),
    });
    onClose();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLFormElement>) => {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    closeAndReturnFocus();
  };

  /* Export 12: one line under the row label saying what the editor works
     against. The unit-bearing field names the block first, because nothing can
     be verified there until the unit is chosen. */
  let context: ReactNode = NO_PROPOSAL;
  if (unitBearing && !unit) context = UNIT_MISSING;
  else if (proposal) {
    context = (
      <>
        Agent: {proposal.value}
        {firstSource ? (
          <>
            {' · '}
            <ProvenanceLink href={sourceHref(firstSource)} onClick={onSource?.(firstSource)}>
              {sourceLabel(firstSource)}
            </ProvenanceLink>
          </>
        ) : null}
      </>
    );
  }

  let hint = '';
  if (cleared) hint = CLEARED;
  else if (unitBearing) hint = LOCKS_UNIT;
  else if (proposal) hint = LOCKS;

  return (
    <form className="inline-editor" onKeyDown={handleKeyDown} onSubmit={save} noValidate>
      <p className="inline-editor__context">{context}</p>

      <div className="inline-editor__controls">
        <label className="inline-editor__field">
          <span className="inline-editor__label">value</span>
          <input
            aria-describedby={error ? errorId : undefined}
            aria-invalid={error ? true : undefined}
            aria-label={`${label} value`}
            autoFocus
            className="inline-editor__input"
            name="value"
            onChange={event => {
              startEditing();
              setValue(event.target.value);
              setCleared(event.target.value.trim() === '');
              setError('');
            }}
            value={value}
          />
        </label>

        {unitBearing && (
          <fieldset aria-label={`${label} unit`} className="inline-editor__units">
            <legend className="inline-editor__label">unit</legend>
            <div className="segmented">
              {(['in', 'mm'] as const).map(option => (
                <label className="segmented__option" key={option}>
                  <input
                    checked={unit === option}
                    className="visually-hidden"
                    name={`${field.id}-unit`}
                    onChange={() => {
                      startEditing();
                      setUnit(option);
                      setError('');
                    }}
                    type="radio"
                    value={option}
                  />
                  <span>{option}</span>
                </label>
              ))}
            </div>
          </fieldset>
        )}
      </div>

      {error ? (
        <p className="inline-editor__error" id={errorId} role="alert">
          <ErrorIcon />
          {error}
        </p>
      ) : hint ? <p className="inline-editor__hint">{hint}</p> : null}

      <div className="inline-editor__actions">
        <Button size="compact" variant="primary" type="submit">Save</Button>
        <Button onClick={closeAndReturnFocus} variant="text">Cancel</Button>
        <span className="inline-editor__keys">Enter saves and verifies · Esc cancels</span>
      </div>
    </form>
  );
};
