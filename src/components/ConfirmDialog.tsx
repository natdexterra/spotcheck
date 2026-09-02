import { useEffect, useId, useRef } from 'react';
import { CrossIcon } from '../icons';
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
      {/* The same three parts as the package dialog, so one question looks like
          a short version of the form and not like another kind of window. */}
      <div className="dialog__form">
        <header className="dialog__header">
          <h2 className="dialog__title" id={`${id}-title`}>{title}</h2>
          <Button aria-label="Close" className="dialog__close" onClick={onCancel} variant="text">
            <CrossIcon />
          </Button>
        </header>
        <div className="dialog__body">
          <p className="dialog__message">{message}</p>
        </div>
        <footer className="dialog__footer">
          <div className="dialog__actions">
            <Button onClick={onConfirm} size="large" variant="primary">{confirmLabel}</Button>
            <Button onClick={onCancel} variant="text">Cancel</Button>
          </div>
        </footer>
      </div>
    </dialog>
  );
}
