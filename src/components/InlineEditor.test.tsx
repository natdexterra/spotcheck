// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, test, vi } from 'vitest';
import type { Field } from '../state/types';

vi.mock('../state/store', () => ({ dispatchHuman: vi.fn() }));

import { InlineEditor } from './InlineEditor';

const field = (overrides: Partial<Field> = {}): Field => ({
  id: 'material',
  state: 'needs_review',
  value: '6061',
  locked: false,
  ...overrides,
});

const dimensions = (overrides: Partial<Field> = {}): Field => field({
  id: 'overall_dimensions',
  value: '20 × 14.5',
  unit: null,
  proposal: { value: '20 × 14.5', source_refs: ['drawing:width'] },
  ...overrides,
});

const proposed = (overrides: Partial<Field> = {}): Field => field({
  proposal: { value: '6061-T6', source_refs: ['spec:s3.2', 'email:p3'] },
  ...overrides,
});

const context = () => document.querySelector('.inline-editor__context');
const hint = () => document.querySelector('.inline-editor__hint');

afterEach(cleanup);

describe('InlineEditor structure', () => {
  test('a unit-bearing field with no unit says why the value cannot be verified yet', () => {
    render(<InlineEditor field={dimensions()} onClose={vi.fn()} />);

    expect(context()).toHaveTextContent(
      'no unit given · the value cannot be verified until a unit is set',
    );
  });

  test('the unit line goes once a unit is chosen', async () => {
    const user = userEvent.setup();
    render(<InlineEditor field={dimensions()} onClose={vi.fn()} />);

    await user.click(screen.getByRole('radio', { name: 'in' }));

    expect(context()).not.toHaveTextContent('no unit given');
  });

  test('a plain field keeps the agent value and its first source as context', () => {
    render(<InlineEditor field={proposed()} onClose={vi.fn()} />);

    expect(context()).toHaveTextContent('Agent: 6061-T6 · spec §3.2');
    expect(screen.getByRole('link', { name: 'spec §3.2' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'email ¶3' })).not.toBeInTheDocument();
  });

  test('a field with no proposal says the value will be the estimator’s own', () => {
    render(<InlineEditor field={field({ state: 'empty', value: null })} onClose={vi.fn()} />);

    expect(context()).toHaveTextContent(
      'no agent proposal · whatever you type here is yours alone',
    );
  });

  test('micro-labels name the controls and the field name is never repeated', () => {
    render(<InlineEditor field={dimensions()} onClose={vi.fn()} />);

    const labels = [...document.querySelectorAll('.inline-editor__label')].map(node => node.textContent);
    expect(labels).toEqual(['value', 'unit']);
    expect(screen.queryByText('Overall dimensions')).not.toBeInTheDocument();
    expect(screen.getByRole('textbox')).toHaveAccessibleName('Overall dimensions value');
  });

  test('a plain field carries the value label alone', () => {
    render(<InlineEditor field={proposed()} onClose={vi.fn()} />);

    const labels = [...document.querySelectorAll('.inline-editor__label')].map(node => node.textContent);
    expect(labels).toEqual(['value']);
  });

  test.each([
    ['a unit-bearing field', dimensions(), 'Locks on the first keystroke · after that no agent proposal can replace what you are typing'],
    ['a proposed field', proposed(), 'Locks on the first keystroke.'],
  ])('%s warns that the first keystroke locks it', (_name, subject, expected) => {
    render(<InlineEditor field={subject} onClose={vi.fn()} />);

    expect(hint()).toHaveTextContent(expected);
  });

  test('an empty field carries no hint line', () => {
    render(<InlineEditor field={field({ state: 'empty', value: null })} onClose={vi.fn()} />);

    expect(hint()).toBeNull();
  });

  test('clearing the input says the lock has already happened', async () => {
    const user = userEvent.setup();
    render(<InlineEditor field={proposed()} onClose={vi.fn()} />);

    await user.clear(screen.getByRole('textbox'));

    expect(hint()).toHaveTextContent('The field is already locked · you typed and cleared it');
  });

  test('the validation line replaces the hint', async () => {
    const user = userEvent.setup();
    render(<InlineEditor field={field({ state: 'empty', value: null })} onClose={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(screen.getByRole('alert')).toHaveTextContent('Enter a value or cancel');
    expect(hint()).toBeNull();
  });

  test('Save is the compact local primary and the keys are spelled out beside it', () => {
    render(<InlineEditor field={proposed()} onClose={vi.fn()} />);

    expect(screen.getByRole('button', { name: 'Save' })).toHaveClass('button--primary', 'button--compact');
    expect(document.querySelector('.inline-editor__keys')).toHaveTextContent(
      'Enter saves and verifies · Esc cancels',
    );
  });
});
