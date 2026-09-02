// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { act, cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, describe, expect, test, vi } from 'vitest';
import { createInitialState, type ReviewSession } from '../state/session';
import { getState, replaceState } from '../state/store';
import { ChangeLogDrawer } from './ChangeLogDrawer';

/* jsdom carries no top layer; the element's own behaviour is proved in the browser. */
beforeAll(() => {
  Object.assign(HTMLDialogElement.prototype, {
    showModal(this: HTMLDialogElement) { this.open = true; },
    close(this: HTMLDialogElement) { this.open = false; this.dispatchEvent(new Event('close')); },
  });
});

afterEach(() => {
  cleanup();
  act(() => replaceState(createInitialState()));
});

describe('ChangeLogDrawer', () => {
  test('an edit on a unit-bearing field names the unit on both sides of the arrow', () => {
    const state = createInitialState();
    const dimensions = state.fields.find(field => field.id === 'overall_dimensions')!;
    dimensions.proposal = { value: '20.000 × 14.500', unit: 'in', source_refs: ['drawing:width'] };
    dimensions.value = '20.000 × 14.600';
    dimensions.unit = 'in';
    const session: ReviewSession = {
      ...state,
      log: [{
        actor: 'estimator',
        at: 2_000,
        event: {
          actor: 'human',
          action: { type: 'edit', field_id: 'overall_dimensions', value: '20.000 × 14.600', unit: 'in' },
        },
      }],
    };
    act(() => replaceState(session));
    render(<ChangeLogDrawer />);

    expect(screen.getByLabelText('Change log')).toHaveTextContent(
      'You edited Overall dimensions: agent 20.000 × 14.500 in → yours 20.000 × 14.600 in',
    );
  });
  test('shows the latest actor-first sentence collapsed and the full log oldest first', async () => {
    const user = userEvent.setup();
    const state = createInitialState();
    const material = state.fields.find(field => field.id === 'material')!;
    material.proposal = { value: '6061', source_refs: ['spec:s1.1'] };
    material.value = '7075';
    const session: ReviewSession = {
      ...state,
      log: [
        {
          actor: 'agent',
          at: 1_000,
          event: { actor: 'agent', action: { type: 'propose', input: { field_id: 'material', value: '6061' } } },
          result: { ok: true, field_id: 'material' },
        },
        {
          actor: 'estimator',
          at: 2_000,
          event: { actor: 'human', action: { type: 'edit', field_id: 'material', value: '7075' } },
        },
      ],
    };
    act(() => replaceState(session));
    render(<ChangeLogDrawer />);

    // Exports 01, 02, 16: a fixed label at the left, the last entry between,
    // the entry count as the disclosure at the right.
    expect(document.querySelector('.change-log__label')).toHaveTextContent('Change log');
    expect(screen.getByLabelText('Change log')).toHaveTextContent('You edited Material: agent 6061 → yours 7075');
    expect(screen.queryByText(/Agent proposed Material/)).not.toBeInTheDocument();

    // The count is the label the exports draw; the accessible name says what
    // pressing it does and which region it opens.
    const disclosure = screen.getByRole('button', { name: 'Show change log, 2 entries' });
    expect(disclosure).toHaveTextContent('2 entries');
    expect(disclosure).toHaveAttribute('aria-controls', 'change-log');
    expect(disclosure.querySelector('svg')).not.toBeNull();
    // Exports 02, 16: a middle dot parts the time from the sentence.
    expect(document.querySelector('.change-log__collapsed'))
      .toHaveTextContent(/\d\d:\d\d\s*·\s*You edited Material/);
    await user.click(disclosure);
    expect(document.querySelector('.change-log__meta')).toHaveTextContent('2 entries · agent and you');
    const entries = screen.getAllByRole('listitem');
    expect(entries[0]).toHaveTextContent('Agent proposed Material: 6061');
    expect(entries[1]).toHaveTextContent('You edited Material: agent 6061 → yours 7075');
    expect(screen.getByRole('button', { name: 'Close' })).toHaveAttribute('aria-controls', 'change-log');
    expect(screen.getByRole('button', { name: 'Export session' })).toBeEnabled();
  });

  test('renders rejection codes, agent notes and skipped replay entries', async () => {
    const user = userEvent.setup();
    const session: ReviewSession = {
      ...createInitialState(),
      log: [
        {
          actor: 'agent',
          at: 1,
          event: { actor: 'agent', action: { type: 'propose', input: { field_id: 'quantity' } } },
          result: { ok: false, code: 'FIELD_LOCKED' },
          notes: ['Recorded suggestion', 'The email allows an equivalent alloy.'],
        },
        {
          actor: 'estimator',
          at: 2,
          event: { actor: 'human', action: { type: 'verify', field_id: 'quantity', replay_skip: 'viewer handled quantity' } },
          notes: ['Skipped fixture step: viewer handled quantity'],
        },
      ],
    };
    act(() => replaceState(session));
    render(<ChangeLogDrawer />);
    await user.click(screen.getByRole('button', { name: /entr(y|ies)$/ }));

    expect(screen.getByText(/FIELD_LOCKED/)).toBeInTheDocument();
    // App notes read plain; only the agent's own text is reported speech.
    expect(screen.getByText('Recorded suggestion')).toBeInTheDocument();
    expect(screen.getByText('Agent: The email allows an equivalent alloy.')).toBeInTheDocument();
    expect(screen.getByText('You skipped viewer handled quantity')).toBeInTheDocument();
  });

  test('has an empty collapsed state and opens a closeable sheet', async () => {
    const user = userEvent.setup();
    render(<ChangeLogDrawer />);
    expect(screen.getByText('No activity yet')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /entr(y|ies)$/ }));
    expect(document.querySelector('.change-log__sheet')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.getByRole('button', { name: /entr(y|ies)$/ })).toBeInTheDocument();
  });
});

describe('P5: the log header during a live session', () => {
  const liveSession = (entries = 3): ReviewSession => ({
    ...createInitialState(),
    log: Array.from({ length: entries }, (_, index) => ({
      actor: 'agent' as const,
      at: 1_000 + index,
      event: { actor: 'agent' as const, action: { type: 'propose' as const, at: 1_000 + index } },
      result: { ok: true },
    })),
  });

  test('carries the way into a package of your own beside the sample', async () => {
    const onOpenPackage = vi.fn();
    const user = userEvent.setup();
    act(() => replaceState(liveSession()));
    render(<ChangeLogDrawer onOpenPackage={onOpenPackage} />);
    await user.click(screen.getByRole('button', { name: /entr(y|ies)$/ }));

    expect(screen.getByRole('button', { name: 'Play sample session' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Open your own package' }));
    expect(onOpenPackage).toHaveBeenCalledOnce();
  });

  test('Start over asks first, and Cancel changes nothing', async () => {
    const user = userEvent.setup();
    act(() => replaceState(liveSession()));
    render(<ChangeLogDrawer />);
    await user.click(screen.getByRole('button', { name: /entr(y|ies)$/ }));
    await user.click(screen.getByRole('button', { name: 'Start over' }));

    expect(screen.getByText('This discards 3 entries and every value on the page.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(getState()).toEqual(liveSession());
  });

  test('confirming clears the page and the session that was saved with it', async () => {
    const user = userEvent.setup();
    act(() => replaceState(liveSession()));
    render(<ChangeLogDrawer />);
    await user.click(screen.getByRole('button', { name: /entr(y|ies)$/ }));
    await user.click(screen.getByRole('button', { name: 'Start over' }));
    const dialog = document.querySelector('.dialog--confirm') as HTMLElement;
    await act(async () => { await user.click(within(dialog).getByRole('button', { name: 'Start over' })); });

    expect(getState()).toEqual(createInitialState());
  });

  test('an empty page is offered no way to start over', async () => {
    const user = userEvent.setup();
    render(<ChangeLogDrawer />);
    await user.click(screen.getByRole('button', { name: /entr(y|ies)$/ }));

    expect(screen.queryByRole('button', { name: 'Start over' })).toBeNull();
  });
});
