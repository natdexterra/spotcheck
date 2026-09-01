// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { Button } from '../components/Button';
import { createInitialState } from '../state/session';
import { replaceState } from '../state/store';
import type { FieldState } from '../state/types';
import { useKeyboardMap } from './useKeyboardMap';

const Harness = ({ onAction = vi.fn() }: { onAction?: (action: string) => void }) => {
  useKeyboardMap();
  return (
    <>
      <article data-field-id="quantity">
        <Button onClick={() => onAction('pick')} variant="secondary">Pick</Button>
        <Button onClick={() => onAction('edit-conflict')} variant="text">Enter another value</Button>
      </article>
      <article data-field-id="material">
        <Button onClick={() => onAction('verify')} variant="secondary">Verify</Button>
        <Button onClick={() => onAction('edit')} variant="text">Edit</Button>
      </article>
      <article data-field-id="delivery">
        <Button onClick={() => onAction('enter')} variant="secondary">Enter value</Button>
        <Button onClick={() => onAction('not-required')} variant="text">Mark not required</Button>
      </article>
      <input aria-label="Editor value" />
      <Button onClick={() => onAction('close')} variant="text">Close</Button>
    </>
  );
};

const setStates = (states: Partial<Record<string, FieldState>>) => {
  const state = createInitialState();
  for (const field of state.fields) field.state = states[field.id] ?? 'verified';
  act(() => replaceState(state));
};

afterEach(() => {
  cleanup();
  act(() => replaceState(createInitialState()));
});

describe('useKeyboardMap', () => {
  test('j and k focus flagged rows in risk order', () => {
    setStates({ quantity: 'conflict', delivery: 'missing', material: 'needs_review' });
    render(<Harness />);

    fireEvent.keyDown(document, { key: 'j' });
    expect(document.querySelector('[data-field-id="quantity"]')).toHaveFocus();
    fireEvent.keyDown(document, { key: 'j' });
    expect(document.querySelector('[data-field-id="delivery"]')).toHaveFocus();
    fireEvent.keyDown(document, { key: 'k' });
    expect(document.querySelector('[data-field-id="quantity"]')).toHaveFocus();
  });

  test('Enter, e and n trigger the same visible buttons as pointer input', () => {
    const onAction = vi.fn();
    setStates({ quantity: 'conflict', delivery: 'empty', material: 'needs_review' });
    render(<Harness onAction={onAction} />);

    const quantity = document.querySelector<HTMLElement>('[data-field-id="quantity"]')!;
    quantity.tabIndex = -1;
    quantity.focus();
    fireEvent.keyDown(document, { key: 'Enter' });
    fireEvent.keyDown(document, { key: 'e' });
    expect(onAction).toHaveBeenCalledWith('pick');
    expect(onAction).toHaveBeenCalledWith('edit-conflict');

    const delivery = document.querySelector<HTMLElement>('[data-field-id="delivery"]')!;
    delivery.tabIndex = -1;
    delivery.focus();
    fireEvent.keyDown(document, { key: 'n' });
    expect(onAction).toHaveBeenCalledWith('not-required');
  });

  test('is inert in inputs and buttons, while Escape has a Close pointer equivalent', () => {
    const onAction = vi.fn();
    setStates({ quantity: 'conflict' });
    render(<Harness onAction={onAction} />);

    const input = screen.getByRole('textbox', { name: 'Editor value' });
    input.focus();
    fireEvent.keyDown(input, { key: 'j' });
    expect(input).toHaveFocus();

    const pick = screen.getByRole('button', { name: 'Pick' });
    pick.focus();
    fireEvent.keyDown(pick, { key: 'e' });
    expect(onAction).not.toHaveBeenCalled();

    document.body.focus();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onAction).toHaveBeenCalledWith('close');
  });
});
