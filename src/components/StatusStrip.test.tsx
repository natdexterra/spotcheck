// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { samplePackage, setPackage } from '../data/package';
import { buildPackage } from '../data/user-package';
import { createInitialState, type ReviewSession } from '../state/session';
import { replaceState } from '../state/store';
import { StatusStrip } from './StatusStrip';

afterEach(() => {
  cleanup();
  act(() => replaceState(createInitialState()));
});

const INTRO = /This page holds a sample RFQ package/;

describe('StatusStrip', () => {
  test('orients the reader on the first line before the first tool call', () => {
    const { container, rerender } = render(<StatusStrip apiAvailable={false} />);
    expect(screen.getByText(INTRO)).toBeInTheDocument();
    rerender(<StatusStrip apiAvailable />);
    expect(screen.getByText(INTRO)).toBeInTheDocument();

    // The state dot belongs to the status line, never to the orienting one.
    expect(container.querySelector('.status-strip__intro .status-strip__dot')).toBeNull();
    expect(container.querySelector('.status-strip__line .status-strip__dot')).not.toBeNull();
  });

  test('drops the orienting line once the session is under way', () => {
    const session: ReviewSession = { ...createInitialState(), log: [
      { actor: 'agent', at: 1, event: { actor: 'agent', action: { type: 'propose', at: 1 } }, result: { ok: true } },
    ] };
    act(() => replaceState(session));
    const { rerender } = render(<StatusStrip apiAvailable />);
    expect(screen.queryByText(INTRO)).not.toBeInTheDocument();

    act(() => replaceState({ ...session, confirmed: true }));
    rerender(<StatusStrip apiAvailable />);
    expect(screen.queryByText(INTRO)).not.toBeInTheDocument();
  });

  test('selects no-api and offers the primary sample action', () => {
    const onPlay = vi.fn();
    render(<StatusStrip apiAvailable={false} onPlaySample={onPlay} />);
    fireEvent.click(screen.getByRole('button', { name: 'Play sample session' }));
    expect(screen.getByText(/WebMCP-capable desktop browser/)).toBeInTheDocument();
    expect(onPlay).toHaveBeenCalledOnce();
  });

  test('selects waiting when the API is present without calls', () => {
    render(<StatusStrip apiAvailable />);
    expect(screen.getByText('Waiting for your agent.')).toBeInTheDocument();
    expect(screen.getByText('Extract this RFQ into a quote request')).toBeInTheDocument();
  });

  test('shows live roster counts and the last rejection code', () => {
    const initial = createInitialState();
    const fields = initial.fields.map(field => field.id === 'quantity' ? { ...field, state: 'conflict' as const } : field);
    const session: ReviewSession = { confirmed: false, fields, log: [
      { actor: 'agent', at: 1, event: { actor: 'agent', action: { type: 'report_conflict', at: 1 } }, result: { ok: true } },
      { actor: 'agent', at: 2, event: { actor: 'agent', action: { type: 'report_conflict', at: 2 } }, result: { ok: false, code: 'FIELD_LOCKED' } },
    ] };
    act(() => replaceState(session));
    render(<StatusStrip apiAvailable />);
    expect(screen.getByText('7 tools · 2 calls')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Show tools/ }));
    expect(screen.getByText('FIELD_LOCKED')).toBeInTheDocument();
    expect(screen.getByText('2 calls')).toBeInTheDocument();
  });

  test('a replay without the API reads live from its first step, and the sample button leaves', () => {
    const session: ReviewSession = { ...createInitialState(), log: [
      { actor: 'agent', at: 1, event: { actor: 'agent', action: { type: 'propose', at: 1 } }, result: { ok: true } },
    ] };
    act(() => replaceState(session));
    render(<StatusStrip apiAvailable={false} />);
    expect(screen.getByText('Live')).toBeInTheDocument();
    expect(screen.queryByText(/WebMCP-capable desktop browser/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Play sample session' })).not.toBeInTheDocument();
  });

  test('selects confirmed after the review is confirmed', () => {
    act(() => replaceState({ ...createInitialState(), confirmed: true }));
    render(<StatusStrip apiAvailable />);
    expect(screen.getByText('Confirmed')).toBeInTheDocument();
  });
});

describe('P5: the way into a package of your own', () => {
  afterEach(() => act(() => setPackage(samplePackage)));

  const narrowScreen = () => vi.stubGlobal('matchMedia', (query: string) => ({
    matches: true, media: query, addEventListener() {}, removeEventListener() {},
  }));

  test('the orienting line names the sample package and the documents in it', () => {
    render(<StatusStrip apiAvailable />);
    expect(screen.getByText(
      'This page holds a sample RFQ package: email, spec and drawing. Your agent fills the 11 quote-request ' +
      'fields through the page’s tools; you check each against its source and confirm.',
    )).toBeInTheDocument();
  });

  test('a package a person opened is named by its reference, with the documents it holds', () => {
    act(() => setPackage(buildPackage({
      reference: 'RFQ 91-2201', email: 'Subject\n\nBody.', drawing: 'data:image/webp;base64,AAAA',
    })));
    render(<StatusStrip apiAvailable />);

    expect(screen.getByText(
      'This page holds your package RFQ 91-2201: email and drawing. Your agent fills the 11 quote-request ' +
      'fields through the page’s tools; you check each against its source and confirm.',
    )).toBeInTheDocument();
  });

  test('the button stands beside the sample button before the session starts', () => {
    const onOpenPackage = vi.fn();
    const { container } = render(<StatusStrip apiAvailable onOpenPackage={onOpenPackage} />);
    const actions = container.querySelector('.status-strip__actions');

    expect(within(actions as HTMLElement).getAllByRole('button').map(button => button.textContent))
      .toEqual(['Play sample session', 'Open your own package']);
    fireEvent.click(screen.getByRole('button', { name: 'Open your own package' }));
    expect(onOpenPackage).toHaveBeenCalledOnce();
  });

  test('with a package of their own open it offers another one', () => {
    act(() => setPackage(buildPackage({ reference: 'RFQ 91-2201', email: 'Subject\n\nBody.' })));
    render(<StatusStrip apiAvailable onOpenPackage={vi.fn()} />);

    expect(screen.getByRole('button', { name: 'Open another package' })).toBeInTheDocument();
  });

  test('a live session keeps the strip to its status: both buttons live in the log', () => {
    const session: ReviewSession = { ...createInitialState(), log: [
      { actor: 'agent', at: 1, event: { actor: 'agent', action: { type: 'propose', at: 1 } }, result: { ok: true } },
    ] };
    act(() => replaceState(session));
    render(<StatusStrip apiAvailable onOpenPackage={vi.fn()} />);

    expect(screen.queryByRole('button', { name: /package/ })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Play sample session' })).toBeNull();
  });

  test('a browser with no agent keeps its first load light: no own-package button on one column', () => {
    narrowScreen();
    render(<StatusStrip apiAvailable={false} onOpenPackage={vi.fn()} />);

    expect(screen.getByRole('button', { name: 'Play sample session' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /package$/ })).toBeNull();
    vi.unstubAllGlobals();
  });

  test('a browser with an agent keeps the button on one column', () => {
    narrowScreen();
    render(<StatusStrip apiAvailable onOpenPackage={vi.fn()} />);

    expect(screen.getByRole('button', { name: 'Open your own package' })).toBeInTheDocument();
    vi.unstubAllGlobals();
  });

  test('a package the browser had no room for says so under the orienting line', () => {
    render(<StatusStrip apiAvailable notice="Package opened for this visit only: the browser has no room to keep it" />);

    expect(screen.getByText(/no room to keep it/)).toBeInTheDocument();
  });
});
