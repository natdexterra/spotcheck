// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import { ChangeLogDrawer } from './ChangeLogDrawer';
import { LiveRegion } from './LiveRegion';
import { createInitialState, type ReviewSession } from '../state/session';
import { replaceState } from '../state/store';
import * as controller from '../replay/controller';

afterEach(() => { cleanup(); replaceState(createInitialState()); vi.restoreAllMocks(); });

test('collapsed sentence has ellipsis class and omits notes without a title', () => {
  replaceState({ ...createInitialState(), log: [{ actor: 'agent', at: 1,
    event: { actor: 'agent', action: { type: 'propose', input: { field_id: 'material', value: 'steel' } } }, notes: ['Long rationale'] }] } as ReviewSession);
  render(<ChangeLogDrawer />);
  const sentence = screen.getByText('Agent proposed Material — steel');
  expect(sentence.closest('.change-log__entry')).toHaveClass('change-log__entry--collapsed');
  expect(sentence).not.toHaveAttribute('title');
  expect(screen.queryByText(/Long rationale/)).not.toBeInTheDocument();
});

test.each([['list', 'Agent listed the documents'], ['review', 'Agent checked the review'], ['section', 'Agent read spec §3.1']] as const)('read %s names its operation', (operation, sentence) => {
  replaceState({ ...createInitialState(), log: [{ actor: 'agent', at: 1,
    event: { actor: 'agent', action: { type: 'read', operation, input: { doc_id: 'spec', section_id: 's3.1' } } } }] } as ReviewSession);
  render(<ChangeLogDrawer />);
  expect(screen.getByText(sentence)).toBeInTheDocument();
});

test('empty export is disabled and import retains a labelled native file input', () => {
  render(<ChangeLogDrawer />);
  fireEvent.click(screen.getByRole('button', { name: 'Show change log' }));
  expect(screen.getByRole('button', { name: 'Export session' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Export session' })).toHaveClass('button--secondary', 'button--compact');
  expect(screen.getByRole('button', { name: 'Import session' })).toHaveClass('button--secondary', 'button--compact');
  expect(screen.getByLabelText('Import session')).toHaveAttribute('type', 'file');
  expect(screen.getByLabelText('Import session')).not.toHaveAttribute('tabindex', '-1');
});

test('successful import passes parsed fixture to controller and closes drawer', async () => {
  const start = vi.spyOn(controller, 'startImported').mockResolvedValue();
  render(<ChangeLogDrawer />);
  fireEvent.click(screen.getByRole('button', { name: 'Show change log' }));
  const fixture = { recorded_at: '2026-09-01', steps: [] };
  const file = { text: async () => JSON.stringify(fixture) };
  await act(async () => { fireEvent.change(screen.getByLabelText('Import session'), { target: { files: [file] } }); });
  expect(start).toHaveBeenCalledWith(fixture, 'Imported session');
  expect(screen.getByRole('button', { name: 'Show change log' })).toBeInTheDocument();
});

test('failed import is visible and announced; next attempt clears error', async () => {
  render(<><ChangeLogDrawer /><LiveRegion /></>);
  fireEvent.click(screen.getByRole('button', { name: 'Show change log' }));
  const before = document.querySelector('.change-log__entries');
  await act(async () => { fireEvent.change(screen.getByLabelText('Import session'), { target: { files: [{ text: async () => '{}' }] } }); });
  await waitFor(() => expect(document.querySelector('.session-error')).toHaveTextContent('Could not import:'));
  expect(document.querySelector('[aria-live]')).toHaveTextContent('Could not import:');
  expect(document.querySelector('.change-log__entries')).toBe(before);
  vi.spyOn(controller, 'startImported').mockResolvedValue();
  await act(async () => { fireEvent.change(screen.getByLabelText('Import session'), { target: { files: [{ text: async () => '{"recorded_at":"2026-09-01","steps":[]}' }] } }); });
  expect(document.querySelector('.session-error')).toBeNull();
});
