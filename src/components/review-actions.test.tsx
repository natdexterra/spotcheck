// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { createRef } from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, test, vi } from 'vitest';
import type { Field } from '../state/types';

vi.mock('../state/store', () => ({ dispatchHuman: vi.fn() }));

import { dispatchHuman } from '../state/store';
import { ConflictPanel } from './ConflictPanel';
import { InlineEditor } from './InlineEditor';
import { NotRequiredPicker } from './NotRequiredPicker';
import { SuggestionCard } from './SuggestionCard';

const dispatch = vi.mocked(dispatchHuman);
const baseField = (overrides: Partial<Field> = {}): Field => ({
  id: 'material',
  state: 'needs_review',
  value: '6061',
  locked: false,
  ...overrides,
});

afterEach(() => {
  cleanup();
  dispatch.mockClear();
});

describe('InlineEditor', () => {
  test('dispatches edit_start once on the first change and Enter saves dimensions with a chosen unit', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<InlineEditor field={baseField({ id: 'overall_dimensions', unit: null, value: '20 × 14' })} onClose={onClose} />);

    const input = screen.getByRole('textbox', { name: 'Overall dimensions' });
    await user.type(input, '.5');
    await user.click(screen.getByRole('radio', { name: 'in' }));
    await user.keyboard('{Enter}');

    expect(dispatch.mock.calls.filter(([action]) => action.type === 'edit_start')).toHaveLength(1);
    expect(dispatch).toHaveBeenLastCalledWith(expect.objectContaining({
      type: 'edit',
      field_id: 'overall_dimensions',
      value: '20 × 14.5',
      unit: 'in',
    }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  test('Escape closes without saving and returns focus', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const returnFocusRef = createRef<HTMLButtonElement>();
    render(
      <>
        <button ref={returnFocusRef}>Edit material</button>
        <InlineEditor field={baseField()} onClose={onClose} returnFocusRef={returnFocusRef} />
      </>,
    );

    await user.keyboard('{Escape}');

    expect(onClose).toHaveBeenCalledOnce();
    expect(dispatch).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Edit material' })).toHaveFocus();
  });

  test.each([
    [baseField({ state: 'empty', value: null }), '', 'Enter a value or cancel'],
    [baseField({ id: 'quantity', value: '1.5' }), '1.5', 'Quantity is a whole number'],
    [baseField({ id: 'overall_dimensions', value: '20 × 14', unit: null }), '20 × 14', 'Choose in or mm'],
  ])('validates before dispatch', async (field, _value, message) => {
    const user = userEvent.setup();
    render(<InlineEditor field={field} onClose={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(screen.getByRole('alert')).toHaveTextContent(message);
    expect(screen.getByRole('textbox')).toHaveAttribute('aria-invalid', 'true');
    expect(dispatch).not.toHaveBeenCalled();
  });
});

describe('NotRequiredPicker', () => {
  test('requires a reason and dispatches the selected preset', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<NotRequiredPicker field={baseField()} onClose={onClose} />);
    const submit = screen.getByRole('button', { name: 'Mark not required' });
    expect(submit).toBeDisabled();

    await user.click(screen.getByRole('radio', { name: 'Covered by our shop standard' }));
    await user.click(submit);

    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({
      type: 'dismiss',
      field_id: 'material',
      reason: 'Covered by our shop standard',
    }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  test('uses a free-text reason and Cancel returns focus without dispatching', async () => {
    const user = userEvent.setup();
    const returnFocusRef = createRef<HTMLButtonElement>();
    const { rerender } = render(
      <>
        <button ref={returnFocusRef}>Mark not required trigger</button>
        <NotRequiredPicker field={baseField()} onClose={vi.fn()} returnFocusRef={returnFocusRef} />
      </>,
    );
    await user.type(screen.getByRole('textbox', { name: 'Other reason' }), 'Customer supplies it');
    await user.click(screen.getByRole('button', { name: 'Mark not required' }));
    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ reason: 'Customer supplies it' }));

    dispatch.mockClear();
    rerender(
      <>
        <button ref={returnFocusRef}>Mark not required trigger</button>
        <NotRequiredPicker field={baseField()} onClose={vi.fn()} returnFocusRef={returnFocusRef} />
      </>,
    );
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(dispatch).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Mark not required trigger' })).toHaveFocus();
  });
});

describe('ConflictPanel and SuggestionCard', () => {
  test('Pick dispatches the candidate index and the editor action is exposed', async () => {
    const user = userEvent.setup();
    const onOpenEditor = vi.fn();
    render(<ConflictPanel field={baseField({ state: 'conflict', candidates: [
      { value: '6061', source_refs: ['spec:s1.1'] },
      { value: '7075', source_refs: ['email:p2'], note: 'Customer requested this alloy' },
    ] })} onOpenEditor={onOpenEditor} />);

    await user.click(screen.getAllByRole('button', { name: 'Pick' })[1]!);
    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ type: 'pick', field_id: 'material', index: 1 }));
    expect(screen.getByRole('link', { name: 'spec §1.1' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Enter another value' }));
    expect(onOpenEditor).toHaveBeenCalledOnce();
  });

  test('candidate and suggestion source links call the provenance handler instead of a dead fragment', async () => {
    const user = userEvent.setup();
    const onSource = vi.fn();
    const handler = (ref: string) => (event: { preventDefault: () => void }) => {
      event.preventDefault();
      onSource(ref);
    };
    render(
      <>
        <ConflictPanel
          field={baseField({ state: 'conflict', candidates: [
            { value: '800', source_refs: ['spec:s1.1'] },
            { value: '750', source_refs: ['email:p2'] },
          ] })}
          onOpenEditor={vi.fn()}
          onSource={handler}
        />
        <SuggestionCard
          field={baseField({
            locked: true,
            resolution: { kind: 'edited', at: Date.now() },
            suggestion: { value: '7075', source_refs: ['drawing:width'] },
          })}
          onSource={handler}
        />
      </>,
    );

    expect(screen.getByRole('link', { name: 'spec §1.1' })).toHaveAttribute('href', '#spec:s1.1');
    await user.click(screen.getByRole('link', { name: 'spec §1.1' }));
    await user.click(screen.getByRole('link', { name: 'drawing width' }));
    expect(onSource.mock.calls.flat()).toEqual(['spec:s1.1', 'drawing:width']);
  });

  test.each([
    ['Apply', 'apply'],
    ['Dismiss', 'dismiss_suggestion'],
  ] as const)('%s resolves the suggestion and focuses its badge', async (label, type) => {
    const user = userEvent.setup();
    render(
      <>
        <button data-field-badge="material">Material badge</button>
        <SuggestionCard field={baseField({
          locked: true,
          resolution: { kind: 'edited', at: Date.now() - 42_000 },
          suggestion: { value: '7075', source_refs: ['email:p2'], rationale: 'Newer customer note' },
        })} />
      </>,
    );

    await user.click(screen.getByRole('button', { name: label }));
    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ type, field_id: 'material' }));
    expect(screen.getByRole('button', { name: 'Material badge' })).toHaveFocus();
  });
});
