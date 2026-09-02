// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import * as controller from '../replay/controller';
import * as tools from '../webmcp-tools';
import { ReplayControls } from './ReplayControls';

afterEach(async () => { cleanup(); await controller.leave(); localStorage.clear(); vi.restoreAllMocks(); });

test('playing and paused controls preserve focus; restart focuses Play and resets the counter', async () => {
  await controller.startSample();
  render(<ReplayControls />);
  const toggle = screen.getByRole('button', { name: 'Pause' }); toggle.focus();
  fireEvent.click(toggle);
  expect(screen.getByRole('button', { name: 'Play' })).toHaveFocus();
  await act(async () => { await controller.next(); });
  fireEvent.click(screen.getByRole('button', { name: 'Restart' }));
  expect(screen.getByRole('button', { name: 'Play' })).toHaveFocus();
  expect(screen.getByText(`0 / ${controller.getSnapshot().total}`)).toBeInTheDocument();
});

test('Next call is disabled during an in-flight step', async () => {
  await controller.startSample(); controller.pause();
  let release!: () => void;
  vi.spyOn(tools, 'executeTool').mockImplementationOnce(() => new Promise(resolve => { release = () => resolve({}); }));
  render(<ReplayControls />);
  let pending!: Promise<boolean>;
  act(() => { pending = controller.next(); });
  expect(screen.getByRole('button', { name: 'Next call' })).toBeDisabled();
  await act(async () => { release(); await pending; });
  expect(screen.getByRole('button', { name: 'Next call' })).toBeEnabled();
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

test('error and ended rows show Restart only with their status text', async () => {
  await controller.startSample(); controller.pause();
  vi.spyOn(tools, 'executeTool').mockRejectedValueOnce(new Error('Tool unavailable'));
  render(<ReplayControls />);
  await act(async () => { await controller.next(); });
  expect(screen.getByText('stopped at step 1: Tool unavailable')).toBeInTheDocument();
  expect(screen.getAllByRole('button')).toHaveLength(1);
  await act(async () => { await controller.startImported({ recorded_at: '2026-09-01', steps: [] }); });
  expect(screen.getByText('finished')).toBeInTheDocument();
  expect(screen.getAllByRole('button')).toHaveLength(1);
});
