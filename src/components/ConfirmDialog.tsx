import { useEffect, useId, useRef } from 'react';
import { Button } from './Button';

/**
 * The second use of the dialog primitive: one question, one line of consequence,
 * and the action that carries it. It stands in front of the one thing on this
 * page that discards a person's own work, so it says how much there is to lose.
 * Esc cancels and focus returns to the button that opened it, both the element's.
 */
export interface ConfirmDialogProps {
  confirmLabel: string;
  message: string;
  onCancel: () => void;
  onConfirm: () => void;
  open: boolean;
  title: string;
}

export function ConfirmDialog({ confirmLabel, message, onCancel, onConfirm, open, title }: ConfirmDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const id = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog aria-labelledby={`${id}-title`} className="dialog dialog--confirm" onClose={onCancel} ref={dialogRef}>
      <div className="dialog__form">
        <h2 className="dialog__title" id={`${id}-title`}>{title}</h2>
        <p className="dialog__message">{message}</p>
        <div className="dialog__actions">
          <Button onClick={onConfirm} size="large" variant="primary">{confirmLabel}</Button>
          <Button onClick={onCancel} variant="text">Cancel</Button>
        </div>
      </div>
    </dialog>
  );
}
