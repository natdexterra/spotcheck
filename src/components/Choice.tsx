import type { ReactNode } from 'react';
import { CheckIcon } from '../icons';

export interface ChoiceProps {
  checked: boolean;
  children?: ReactNode;
  disabled?: boolean;
  labelId?: string;
  name?: string;
  onChange: (checked: boolean) => void;
  type: 'radio' | 'checkbox';
  value?: string;
}

/**
 * One drawing for every choice in the app (DESIGN.md § Choice controls): the
 * native input stays for semantics and keyboard, `appearance: none` hands the
 * box to the stylesheet, and the checked mark is drawn on it — the accent dot
 * for a radio, the icon-set check for a checkbox. The row is the click target.
 */
export function Choice({
  checked,
  children,
  disabled = false,
  labelId,
  name,
  onChange,
  type,
  value,
}: ChoiceProps) {
  return (
    <label className={`choice choice--${type}`}>
      <input
        checked={checked}
        className="choice__input"
        disabled={disabled}
        name={name}
        onChange={event => onChange(event.currentTarget.checked)}
        type={type}
        value={value}
      />
      {type === 'checkbox' ? (
        <span aria-hidden="true" className="choice__mark"><CheckIcon /></span>
      ) : null}
      {children === undefined ? null : (
        <span className="choice__label" id={labelId}>{children}</span>
      )}
    </label>
  );
}
