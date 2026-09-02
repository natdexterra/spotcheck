// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import { ConfirmSummary } from './ConfirmSummary';
import * as controller from '../replay/controller';
import { sampleSession } from '../replay/replay';
import { dispatchHuman } from '../state/store';

afterEach(async () => { cleanup(); await controller.leave(); localStorage.clear(); vi.restoreAllMocks(); });

test('fixture completion shows recorded duration and Start over leaves replay', async () => {
  await controller.startSample(); controller.pause();
  while (await controller.next()) { /* confirm by fixture */ }
  render(<ConfirmSummary />);
  expect(screen.getByText(/^Recorded review /)).toBeInTheDocument();
  expect(screen.queryByText(/this run/)).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Export session' })).toHaveClass('button--secondary');
  const leave = vi.spyOn(controller, 'leave');
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Start over' })); });
  expect(leave).toHaveBeenCalledOnce();
});

test('viewer completion shows recorded and this-run durations', async () => {
  await controller.startSample(); controller.pause();
  const confirmIndex = sampleSession.steps.findIndex(step => step.actor === 'estimator' && step.action.type === 'confirm');
  while (controller.getSnapshot().position < confirmIndex) await controller.next();
  dispatchHuman({ type: 'confirm' });
  render(<ConfirmSummary />);
  expect(screen.getByText(/^Recorded review .* · this run /)).toBeInTheDocument();
});
