import { useEffect, type RefObject } from 'react';

const FOCUSABLE = [
  'a[href]',
  'button:not(:disabled)',
  'input:not(:disabled)',
  'select:not(:disabled)',
  'textarea:not(:disabled)',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

const focusableWithin = (sheet: HTMLElement): HTMLElement[] =>
  [...sheet.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
    element => element.getClientRects().length > 0,
  );

export interface SheetDialogOptions {
  active: boolean;
  onClose?: () => void;
  returnFocusRef?: RefObject<HTMLElement | null>;
  sheetRef: RefObject<HTMLElement | null>;
}

/**
 * Modal-sheet behaviour shared by the narrow source sheet and the narrow change
 * log: focus moves into the sheet on open, Tab cycles inside it, body scroll is
 * locked, and Escape closes and returns focus to the control that opened it.
 */
export function useSheetDialog({ active, onClose, returnFocusRef, sheetRef }: SheetDialogOptions): void {
  useEffect(() => {
    if (!active) return;
    const sheet = sheetRef.current;
    sheet?.focus();
  }, [active, sheetRef]);

  useEffect(() => {
    if (!active) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [active]);

  useEffect(() => {
    if (!active) return;
    const onKeyDown = (event: KeyboardEvent) => {
      const sheet = sheetRef.current;
      if (!sheet) return;

      if (event.key === 'Escape') {
        onClose?.();
        returnFocusRef?.current?.focus();
        return;
      }
      if (event.key !== 'Tab') return;

      const focusable = focusableWithin(sheet);
      const first = focusable[0];
      const last = focusable.at(-1);
      if (!first || !last) return;
      const active_ = document.activeElement;

      if (event.shiftKey && (active_ === first || active_ === sheet || !sheet.contains(active_))) {
        event.preventDefault();
        last.focus();
        return;
      }
      if (!event.shiftKey && (active_ === last || !sheet.contains(active_))) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [active, onClose, returnFocusRef, sheetRef]);
}
