import { useEffect } from 'react';
import { useReview } from './useReview';

const isTypingTarget = (target: EventTarget | null) => {
  if (!(target instanceof HTMLElement)) return false;
  return target.matches('input, textarea, button') || target.isContentEditable;
};

const rowFor = (fieldId: string) => document.querySelector<HTMLElement>(`[data-field-id="${fieldId}"]`);

const focusRow = (row: HTMLElement | null) => {
  if (!row) return;
  row.tabIndex = -1;
  row.focus();
};

const buttonNamed = (row: HTMLElement, names: string[]) => [...row.querySelectorAll<HTMLButtonElement>('button')]
  .find(button => !button.disabled && names.includes(button.textContent?.trim() ?? ''));

export const useKeyboardMap = () => {
  const { riskOrder } = useReview();
  const flaggedIds = riskOrder.filter(field => field.state !== 'verified').map(field => field.id);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.altKey || event.ctrlKey || event.metaKey || isTypingTarget(event.target)) return;
      const active = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      const activeRow = active?.closest<HTMLElement>('[data-field-id]') ?? null;

      if (event.key === 'j' || event.key === 'k') {
        event.preventDefault();
        const currentIndex = activeRow ? flaggedIds.indexOf(activeRow.dataset.fieldId as typeof flaggedIds[number]) : -1;
        const nextIndex = event.key === 'j'
          ? Math.min(currentIndex + 1, flaggedIds.length - 1)
          : currentIndex < 0 ? flaggedIds.length - 1 : Math.max(currentIndex - 1, 0);
        focusRow(rowFor(flaggedIds[nextIndex] ?? ''));
        return;
      }

      if (event.key === 'Escape') {
        const close = [...document.querySelectorAll<HTMLButtonElement>('button')]
          .find(button => ['Cancel', 'Close'].includes(button.textContent?.trim() ?? ''));
        if (close) {
          event.preventDefault();
          close.click();
        }
        return;
      }
      if (!activeRow) return;

      let action: HTMLButtonElement | undefined;
      if (event.key === 'Enter') action = activeRow.querySelector<HTMLButtonElement>('.button--secondary:not(:disabled)') ?? undefined;
      if (event.key === 'e') action = buttonNamed(activeRow, ['Edit', 'Enter value', 'Enter another value', 'Add unit']);
      if (event.key === 'n') action = buttonNamed(activeRow, ['Mark not required']);
      if (!action) return;
      event.preventDefault();
      action.click();
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [flaggedIds.join('|')]);
};
