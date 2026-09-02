// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import * as controller from '../replay/controller';
import * as tools from '../webmcp-tools';
import { ReplayControls } from './ReplayControls';

afterEach(async () => { cleanup(); await controller.leave(); localStorage.clear(); vi.restoreAllMocks(); });

const row = () => document.querySelector('.replay-controls__text')!;
const buttons = () => screen.getAllByRole('button').map(button => button.textContent);

test('playing offers Pause alone and names the recording, the step and the total', async () => {
  await controller.startSample();
  render(<ReplayControls />);

  expect(row()).toHaveTextContent(`Sample session · recorded 2026-09-01 · step 0 of ${controller.getSnapshot().total}`);
  expect(row()).not.toHaveTextContent('next:');
  expect(buttons()).toEqual(['Pause']);
});

test('pausing adds the next step and the three controls, and keeps focus on the toggle', async () => {
  await controller.startSample();
  render(<ReplayControls />);
  const toggle = screen.getByRole('button', { name: 'Pause' });
  toggle.focus();
  fireEvent.click(toggle);

  expect(screen.getByRole('button', { name: 'Play' })).toHaveFocus();
  expect(buttons()).toEqual(['Play', 'Next step', 'Restart']);
  expect(row()).toHaveTextContent('next: agent lists the documents');
});

test('Restart resets the counter and focuses Play', async () => {
  await controller.startSample();
  render(<ReplayControls />);
  fireEvent.click(screen.getByRole('button', { name: 'Pause' }));
  await act(async () => { await controller.next(); });
  fireEvent.click(screen.getByRole('button', { name: 'Restart' }));

  expect(screen.getByRole('button', { name: 'Play' })).toHaveFocus();
  expect(row()).toHaveTextContent(`step 0 of ${controller.getSnapshot().total}`);
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

test('focusPause falls back to Restart when the row carries no Pause', async () => {
  await controller.startSample(); controller.pause();
  vi.spyOn(tools, 'executeTool').mockRejectedValueOnce(new Error('Tool unavailable'));
  render(<ReplayControls />);
  await act(async () => { await controller.next(); });
  expect(screen.queryByRole('button', { name: 'Pause' })).not.toBeInTheDocument();
  act(() => { controller.focusPause(); });
  expect(screen.getByRole('button', { name: 'Restart' })).toHaveFocus();
});

test('a stopped replay names the step it stopped on and offers Restart alone', async () => {
  await controller.startSample(); controller.pause();
  vi.spyOn(tools, 'executeTool').mockRejectedValueOnce(new Error('Tool unavailable'));
  render(<ReplayControls />);
  await act(async () => { await controller.next(); });

  expect(screen.getByText('stopped at step 1: Tool unavailable')).toBeInTheDocument();
  expect(buttons()).toEqual(['Restart']);
});

test('a finished replay counts the steps it ran and offers Restart alone', async () => {
  await act(async () => { await controller.startImported({ recorded_at: '2026-09-01', steps: [] }, 'Imported session'); });
  render(<ReplayControls />);

  expect(row()).toHaveTextContent('Imported session · finished · 0 steps');
  expect(buttons()).toEqual(['Restart']);
});
