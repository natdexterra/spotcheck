import { useState, type FormEvent, type KeyboardEvent, type RefObject } from 'react';
import { dispatchHuman } from '../state/store';
import type { Field } from '../state/types';
import { Button } from './Button';

export interface NotRequiredPickerProps {
  field: Field;
  onClose: () => void;
  returnFocusRef?: RefObject<HTMLElement | null>;
}

const PRESET_REASONS = [
  'Not required for this quote',
  'Covered by our shop standard',
  'Will confirm at PO',
] as const;

export const NotRequiredPicker = ({ field, onClose, returnFocusRef }: NotRequiredPickerProps) => {
  const [preset, setPreset] = useState('');
  const [other, setOther] = useState('');
  const reason = other.trim() || preset;

  const closeAndReturnFocus = () => {
    onClose();
    returnFocusRef?.current?.focus();
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!reason) return;
    dispatchHuman({ type: 'dismiss', field_id: field.id, reason, at: Date.now() });
    onClose();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLFormElement>) => {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    closeAndReturnFocus();
  };

  return (
    <form className="not-required-picker" onKeyDown={handleKeyDown} onSubmit={submit}>
      <fieldset className="not-required-picker__choices">
        <legend>Reason</legend>
        {PRESET_REASONS.map(option => (
          <label className="not-required-picker__choice" key={option}>
            <input
              checked={preset === option}
              name={`${field.id}-not-required-reason`}
              onChange={() => {
                setPreset(option);
                setOther('');
              }}
              type="radio"
              value={option}
            />
            <span>{option}</span>
          </label>
        ))}
      </fieldset>

      <label className="not-required-picker__other">
        <span>Other reason</span>
        <input
          name="other-reason"
          onChange={event => {
            setOther(event.target.value);
            if (event.target.value) setPreset('');
          }}
          value={other}
        />
      </label>

      <div className="not-required-picker__actions">
        <Button disabled={!reason} type="submit" variant="primary">Mark not required</Button>
        <Button onClick={closeAndReturnFocus} variant="text">Cancel</Button>
      </div>
    </form>
  );
};
