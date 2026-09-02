// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, describe, expect, test, vi } from 'vitest';
import { samplePackage, setPackage } from './data/package';
import { App } from './App';
import * as controller from './replay/controller';
import { createInitialState, type ReviewSession } from './state/session';
import { replaceState } from './state/store';

/* jsdom carries no top layer; the element's own behaviour is proved in the browser. */
beforeAll(() => {
  Object.assign(HTMLDialogElement.prototype, {
    showModal(this: HTMLDialogElement) { this.open = true; },
    close(this: HTMLDialogElement) { this.open = false; this.dispatchEvent(new Event('close')); },
  });
});

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
  vi.restoreAllMocks();
});

describe('App', () => {
  test('renders the product name', () => {
    render(<App />);
    expect(screen.getByRole('heading', { name: 'Spotcheck' })).toBeInTheDocument();
  });

  test('unmounting leaves the attached replay so the saved live session is restored', () => {
    const leave = vi.spyOn(controller, 'leave').mockResolvedValue(false);
    vi.spyOn(controller, 'getSnapshot').mockReturnValue({
      active: true, label: 'Sample session', recordedAt: '2026-09-01', position: 3, total: 26,
      playing: true, busy: false, ended: false, finishedByViewer: false, recordedMs: 0, focusRequest: 0,
    });
    const { unmount } = render(<App />);
    expect(screen.getByRole('group', { name: 'Replay controls' })).toBeInTheDocument();
    expect(leave).not.toHaveBeenCalled();
    unmount();
    expect(leave).toHaveBeenCalledOnce();
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

describe('P5: opening a package of your own', () => {
  afterEach(() => { act(() => setPackage(samplePackage)); localStorage.clear(); });

  const fill = async (user: ReturnType<typeof userEvent.setup>) => {
    await user.click(screen.getByRole('button', { name: 'Open your own package' }));
    await user.type(screen.getByLabelText('Reference'), 'RFQ 91-2201');
    await user.type(screen.getByLabelText('Customer'), 'Ridgeway Panels');
    await user.click(screen.getByLabelText('Customer email'));
    await user.paste('Bay cover quote\n\nPlease quote 240 covers.');
    await user.click(screen.getByLabelText('Specification'));
    await user.paste('1. Purpose\n\nFabricate 240 bay covers.');
    await user.click(screen.getByRole('button', { name: 'Open package' }));
  };

  test('the header, the orienting line and the source pane all follow it', async () => {
    const user = userEvent.setup();
    render(<App />);
    await fill(user);

    expect(document.querySelector('.header__package')).toHaveTextContent('RFQ 91-2201 · Ridgeway Panels');
    expect(screen.getByText(/This page holds your package RFQ 91-2201: email and spec\./)).toBeInTheDocument();
    expect(screen.getAllByRole('tab').map(tab => tab.textContent)).toEqual(['Email', 'Spec']);
    expect(screen.getByText('Please quote 240 covers.')).toBeInTheDocument();
    expect(document.querySelectorAll('.field-row')).toHaveLength(11);
    expect(document.querySelectorAll('.field-list__group-heading')).toHaveLength(0);
  });

  test('it survives into the next visit, and the sample takes it back', async () => {
    const user = userEvent.setup();
    render(<App />);
    await fill(user);
    expect(localStorage.getItem('spotcheck.package.v1')).toContain('RFQ 91-2201');

    await user.click(screen.getByRole('button', { name: 'Open another package' }));
    await user.click(screen.getByRole('button', { name: 'Use the sample package' }));

    expect(document.querySelector('.header__package')).toHaveTextContent('RFQ 26-0812 · Tarrowline Console Systems');
    expect(localStorage.getItem('spotcheck.package.v1')).toBeNull();
  });
});
