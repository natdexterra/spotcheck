import { useRef, useState, type FormEvent, type KeyboardEvent, type RefObject } from 'react';
import { ErrorIcon } from '../icons';
import { fieldLabel } from '../lib/format';
import { dispatchHuman } from '../state/store';
import type { Field } from '../state/types';
import { Button } from './Button';

export interface InlineEditorProps {
  field: Field;
  onClose: () => void;
  returnFocusRef?: RefObject<HTMLElement | null>;
}

type Unit = 'in' | 'mm';

const validUnit = (unit: string | null | undefined): unit is Unit => unit === 'in' || unit === 'mm';

export const InlineEditor = ({ field, onClose, returnFocusRef }: InlineEditorProps) => {
  const [value, setValue] = useState(field.state === 'empty' ? '' : field.value ?? '');
  const [unit, setUnit] = useState<Unit | ''>(validUnit(field.unit) ? field.unit : '');
  const [error, setError] = useState('');
  const editingStarted = useRef(false);
  const errorId = `${field.id}-editor-error`;

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
    if (field.id === 'overall_dimensions' && !unit) return 'Choose in or mm';
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
      type: field.state === 'empty' ? 'enter' : 'edit',
      field_id: field.id,
      value,
      at: Date.now(),
      ...(field.id === 'overall_dimensions' ? { unit } : {}),
    });
    onClose();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLFormElement>) => {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    closeAndReturnFocus();
  };

  return (
    <form className="inline-editor" onKeyDown={handleKeyDown} onSubmit={save} noValidate>
      <div className="inline-editor__controls">
        <label className="inline-editor__field">
          <span className="inline-editor__label">{fieldLabel(field.id)}</span>
          <input
            aria-describedby={error ? errorId : undefined}
            aria-invalid={error ? true : undefined}
            autoFocus
            className="inline-editor__input"
            name="value"
            onChange={event => {
              startEditing();
              setValue(event.target.value);
              setError('');
            }}
            value={value}
          />
        </label>

        {field.id === 'overall_dimensions' && (
          <fieldset className="inline-editor__units">
            <legend className="inline-editor__label">Unit</legend>
            <div className="inline-editor__segments">
              {(['in', 'mm'] as const).map(option => (
                <label className="inline-editor__segment" key={option}>
                  <input
                    checked={unit === option}
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
            {!unit && <span className="inline-editor__hint">no unit given</span>}
          </fieldset>
        )}
      </div>

      {error && (
        <p className="inline-editor__error" id={errorId} role="alert">
          <ErrorIcon />
          {error}
        </p>
      )}

      <div className="inline-editor__actions">
        <Button variant="primary" type="submit">Save</Button>
        <Button onClick={closeAndReturnFocus} variant="text">Cancel</Button>
      </div>
    </form>
  );
};
