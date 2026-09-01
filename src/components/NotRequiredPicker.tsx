import { useId, useState, type FormEvent, type KeyboardEvent, type RefObject } from 'react';
import { dispatchHuman } from '../state/store';
import type { Field } from '../state/types';
import { Button } from './Button';
import { Choice } from './Choice';

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

const OTHER = 'Other reason';

export const NotRequiredPicker = ({ field, onClose, returnFocusRef }: NotRequiredPickerProps) => {
  const [preset, setPreset] = useState('');
  const [other, setOther] = useState('');
  const [otherChosen, setOtherChosen] = useState(false);
  const otherLabelId = useId();
  const reason = otherChosen ? other.trim() : preset;

  const closeAndReturnFocus = () => {
    onClose();
    returnFocusRef?.current?.focus();
  };

  const chooseOther = () => {
    setOtherChosen(true);
    setPreset('');
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
        <legend className="not-required-picker__legend">Why is this not required?</legend>
        {PRESET_REASONS.map(option => (
          <Choice
            checked={!otherChosen && preset === option}
            key={option}
            name={`${field.id}-not-required-reason`}
            onChange={() => { setPreset(option); setOtherChosen(false); }}
            type="radio"
            value={option}
          >
            {option}
          </Choice>
        ))}

        <div className="not-required-picker__other">
          <Choice
            checked={otherChosen}
            labelId={otherLabelId}
            name={`${field.id}-not-required-reason`}
            onChange={chooseOther}
            type="radio"
            value={OTHER}
          >
            {OTHER}
          </Choice>
          <input
            aria-labelledby={otherLabelId}
            className="not-required-picker__other-input"
            name="other-reason"
            onChange={event => {
              setOther(event.target.value);
              // Typing is choosing: the row selects itself.
              chooseOther();
            }}
            value={other}
          />
        </div>
      </fieldset>

      <div className="not-required-picker__actions">
        <Button disabled={!reason} size="compact" type="submit" variant="primary">Mark not required</Button>
        <Button onClick={closeAndReturnFocus} variant="text">Cancel</Button>
        <span className="not-required-picker__hint">The reason travels into the confirm summary.</span>
      </div>
    </form>
  );
};
