// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { createInitialState, reviewSession, type ReviewSession } from '../state/session';
import { getState, replaceState } from '../state/store';
import type { FieldId } from '../state/types';
import { ClarificationEditor } from './ClarificationEditor';
import { SourcePane } from './SourcePane';

const draftSession = (covers: FieldId[] = ['general_tolerance', 'drawing_revision']): ReviewSession => {
  const initial = createInitialState();
  const fields = initial.fields.map(field => covers.includes(field.id)
    ? { ...field, state: 'missing' as const, searched: { searched: ['drawing'] } }
    : field);
  return {
    ...initial,
    fields,
    log: [],
    draft: {
      subject: 'Open drawing questions',
      body: 'Please confirm the missing drawing details.',
      covers,
    },
  };
};

afterEach(() => {
  cleanup();
  act(() => replaceState(createInitialState()));
});

describe('clarification lifecycle', () => {
  test('appears and auto-activates when a draft arrives', () => {
    render(<SourcePane onFocusField={vi.fn()} />);
    expect(screen.queryByRole('tab', { name: 'Clarification' })).not.toBeInTheDocument();

    act(() => replaceState(draftSession()));

    const tab = screen.getByRole('tab', { name: 'Clarification' });
    expect(tab).toHaveAttribute('aria-selected', 'true');
    expect(tab.querySelector('.source-pane__draft-dot')).toBeInTheDocument();
  });

  test('limits covers to current gaps and preserves edits across tab switches', async () => {
    const user = userEvent.setup();
    const session = draftSession();
    session.draft!.covers.push('material');
    act(() => replaceState(session));
    render(<SourcePane onFocusField={vi.fn()} />);

    expect(screen.getByRole('checkbox', { name: 'General tolerance' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Drawing revision' })).toBeChecked();
    expect(screen.queryByRole('checkbox', { name: 'Material' })).not.toBeInTheDocument();

    const subject = screen.getByRole('textbox', { name: 'Subject' });
    await user.clear(subject);
    await user.type(subject, 'Edited subject');
    await user.click(screen.getByRole('tab', { name: 'Email' }));
    await user.click(screen.getByRole('tab', { name: 'Clarification' }));
    expect(screen.getByRole('textbox', { name: 'Subject' })).toHaveValue('Edited subject');
  });

  test('sends edited content and checked covers, then shows the sent record and asks for the first badge', async () => {
    const user = userEvent.setup();
    const onFocusField = vi.fn();
    act(() => replaceState(draftSession()));
    render(<SourcePane onFocusField={onFocusField} />);

    const subject = screen.getByRole('textbox', { name: 'Subject' });
    await user.clear(subject);
    await user.type(subject, 'Tolerance question');
    await user.click(screen.getByRole('checkbox', { name: 'Drawing revision' }));
    await user.click(screen.getByRole('button', { name: 'Send' }));

    expect(reviewSession(getState()).sent).toEqual({
      subject: 'Tolerance question',
      body: 'Please confirm the missing drawing details.',
      covers: ['general_tolerance'],
    });
    expect(onFocusField).toHaveBeenCalledWith('general_tolerance');
    expect(screen.getByText('Sent · 1 field asked')).toBeInTheDocument();
    expect(screen.getByText('Tolerance question')).toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: 'Subject' })).not.toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Clarification' }).querySelector('.source-pane__draft-dot')).toBeNull();
  });

  test('hides an unsent clarification when the gap set becomes empty', () => {
    act(() => replaceState(draftSession()));
    render(<SourcePane onFocusField={vi.fn()} />);
    expect(screen.getByRole('tab', { name: 'Clarification' })).toBeInTheDocument();

    const resolved = draftSession();
    resolved.fields = createInitialState().fields;
    act(() => replaceState(resolved));

    expect(screen.queryByRole('tab', { name: 'Clarification' })).not.toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Email' })).toHaveAttribute('aria-selected', 'true');
  });

  test('renders a sent clarification read-only without a remaining draft', () => {
    render(
      <ClarificationEditor
        gaps={[]}
        sent={{ subject: 'Sent subject', body: '<b>literal body</b>', covers: ['drawing_revision'] }}
      />,
    );

    expect(screen.getByText('Sent · 1 field asked')).toBeInTheDocument();
    expect(screen.getByText('<b>literal body</b>')).toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(document.querySelector('b')).toBeNull();
  });
});
