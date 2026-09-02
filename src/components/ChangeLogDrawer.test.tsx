// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, test } from 'vitest';
import { createInitialState, type ReviewSession } from '../state/session';
import { replaceState } from '../state/store';
import { ChangeLogDrawer } from './ChangeLogDrawer';

afterEach(() => {
  cleanup();
  act(() => replaceState(createInitialState()));
});

describe('ChangeLogDrawer', () => {
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

    expect(screen.getByLabelText('Change log')).toHaveTextContent('You edited Material — agent 6061 → yours 7075');
    expect(screen.queryByText(/Agent proposed Material/)).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Show change log' }));
    const entries = screen.getAllByRole('listitem');
    expect(entries[0]).toHaveTextContent('Agent proposed Material — 6061');
    expect(entries[1]).toHaveTextContent('You edited Material — agent 6061 → yours 7075');
    expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument();
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
    await user.click(screen.getByRole('button', { name: 'Show change log' }));

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
    await user.click(screen.getByRole('button', { name: 'Show change log' }));
    expect(document.querySelector('.change-log__sheet')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.getByRole('button', { name: 'Show change log' })).toBeInTheDocument();
  });
});
