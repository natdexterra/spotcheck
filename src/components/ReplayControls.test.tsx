// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import * as controller from '../replay/controller';
import * as tools from '../webmcp-tools';
import { sampleSession } from '../replay/replay';
import { ReplayControls } from './ReplayControls';

afterEach(async () => { cleanup(); await controller.leave(); localStorage.clear(); vi.restoreAllMocks(); });

const row = () => document.querySelector('.replay-controls__text')!;
const buttons = () => screen.getAllByRole('button').map(button => button.textContent);

test('playing offers Pause and the way out, and names the recording, the step and the total', async () => {
  await controller.startSample();
  render(<ReplayControls />);

  // The row reads the fixture's own recording date, the way ReplayControls formats it (its first 10 chars).
  expect(row()).toHaveTextContent(`Sample session · recorded ${sampleSession.recorded_at.slice(0, 10)} · step 0 of ${controller.getSnapshot().total}`);
  expect(row()).not.toHaveTextContent('next:');
  expect(buttons()).toEqual(['Pause', 'Leave sample']);
});

test('pausing adds the next step and the three controls, and keeps focus on the toggle', async () => {
  await controller.startSample();
  render(<ReplayControls />);
  const toggle = screen.getByRole('button', { name: 'Pause' });
  toggle.focus();
  fireEvent.click(toggle);

  expect(screen.getByRole('button', { name: 'Play' })).toHaveFocus();
  expect(buttons()).toEqual(['Play', 'Next step', 'Leave sample']);
  expect(row()).toHaveTextContent('next: agent lists the documents');
});

test('Leave sample detaches the replay and clears a page that was empty before it', async () => {
  const { getState } = await import('../state/store');
  const { createInitialState } = await import('../state/session');
  await controller.startSample();
  render(<ReplayControls />);
  fireEvent.click(screen.getByRole('button', { name: 'Pause' }));
  await act(async () => { await controller.next(); });
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Leave sample' })); });

  expect(controller.getSnapshot().active).toBe(false);
  expect(getState()).toEqual(createInitialState());
  expect(document.querySelector('.replay-controls')).toBeNull();
});

test('leaving a session a person had work in gives that work back', async () => {
  const { dispatchHuman, getState } = await import('../state/store');
  const { startPersistence } = await import('../replay/persistence');
  const persistence = await startPersistence();
  dispatchHuman({ type: 'enter', field_id: 'material', value: 'live steel', at: 40 });
  await controller.startSample();
  render(<ReplayControls />);
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Leave sample' })); });

  expect(getState().fields.find(entry => entry.id === 'material')?.value).toBe('live steel');
  persistence.stop();
});

test('Next step is disabled during an in-flight step', async () => {
  await controller.startSample(); controller.pause();
  let release!: () => void;
  vi.spyOn(tools, 'executeTool').mockImplementationOnce(() => new Promise(resolve => { release = () => resolve({}); }));
  render(<ReplayControls />);
  let pending!: Promise<boolean>;
  act(() => { pending = controller.next(); });
  expect(screen.getByRole('button', { name: 'Next step' })).toBeDisabled();
  await act(async () => { release(); await pending; });
  expect(screen.getByRole('button', { name: 'Next step' })).toBeEnabled();
});

test('focusPause falls back to the leave button when the row carries no Pause', async () => {
  await controller.startSample(); controller.pause();
  vi.spyOn(tools, 'executeTool').mockRejectedValueOnce(new Error('Tool unavailable'));
  render(<ReplayControls />);
  await act(async () => { await controller.next(); });
  expect(screen.queryByRole('button', { name: 'Pause' })).not.toBeInTheDocument();
  act(() => { controller.focusPause(); });
  expect(screen.getByRole('button', { name: 'Leave sample' })).toHaveFocus();
});

test('a stopped replay names the step it stopped on and offers Restart alone', async () => {
  await controller.startSample(); controller.pause();
  vi.spyOn(tools, 'executeTool').mockRejectedValueOnce(new Error('Tool unavailable'));
  render(<ReplayControls />);
  await act(async () => { await controller.next(); });

  expect(screen.getByText('stopped at step 1: Tool unavailable')).toBeInTheDocument();
  expect(buttons()).toEqual(['Leave sample']);
});

test('a finished replay counts the steps it ran and offers Restart alone', async () => {
  await act(async () => { await controller.startImported({ recorded_at: '2026-09-01', steps: [] }, 'Imported session'); });
  render(<ReplayControls />);

  expect(row()).toHaveTextContent('Imported session · finished · 0 steps');
  // A session a person imported is theirs, not the sample's: it leaves by name.
  expect(buttons()).toEqual(['Leave session']);
});

test('the leave button stands in every state, and Restart stands in none', async () => {
  await controller.startSample();
  render(<ReplayControls />);
  expect(buttons()).toEqual(['Pause', 'Leave sample']);
  expect(screen.queryByRole('button', { name: 'Restart' })).toBeNull();
});
