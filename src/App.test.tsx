// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, test } from 'vitest';
import { App } from './App';
import { createInitialState, type ReviewSession } from './state/session';
import { replaceState } from './state/store';

const draftSession = (): ReviewSession => {
  const initial = createInitialState();
  const covers = ['general_tolerance', 'drawing_number'] as const;
  return {
    ...initial,
    fields: initial.fields.map(field => covers.includes(field.id as typeof covers[number])
      ? { ...field, state: 'missing' as const, searched: { searched: ['drawing'] } }
      : field),
    log: [],
    draft: {
      subject: 'Two questions',
      body: 'Please confirm the tolerance and the drawing number.',
      covers: [...covers],
    },
  };
};

afterEach(() => {
  cleanup();
  act(() => replaceState(createInitialState()));
});

describe('App', () => {
  test('renders the product name', () => {
    render(<App />);
    expect(screen.getByRole('heading', { name: 'Spotcheck' })).toBeInTheDocument();
  });

  test('sending a clarification expands the verified group and focuses the first covered badge', async () => {
    const user = userEvent.setup();
    act(() => replaceState(draftSession()));
    render(<App />);

    await user.click(screen.getByRole('button', { name: 'Send' }));

    const badge = document.querySelector('[data-field-badge="general_tolerance"]');
    expect(badge).not.toBeNull();
    expect(badge).toHaveFocus();
    expect(badge).toHaveTextContent(/Awaiting customer/);
  });
});
