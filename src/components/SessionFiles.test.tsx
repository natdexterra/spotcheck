// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import { ChangeLogDrawer } from './ChangeLogDrawer';
import { LiveRegion } from './LiveRegion';
import { ExportSessionButton } from './ExportSessionButton';
import { ReplayControls } from './ReplayControls';
import { createInitialState, type ReviewSession } from '../state/session';
import { replaceState } from '../state/store';
import * as controller from '../replay/controller';

afterEach(async () => { cleanup(); await controller.leave(); replaceState(createInitialState()); localStorage.clear(); vi.restoreAllMocks(); });

const importFile = async (text: string) => {
  await act(async () => { fireEvent.change(screen.getByLabelText('Import session'), { target: { files: [{ text: async () => text }] } }); });
};

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

test('empty export is disabled and import is one tab stop on the native file input', () => {
  render(<ChangeLogDrawer />);
  fireEvent.click(screen.getByRole('button', { name: 'Show change log' }));
  expect(screen.getByRole('button', { name: 'Export session' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Export session' })).toHaveClass('button--secondary', 'button--compact');
  const input = screen.getByLabelText('Import session');
  expect(input).toHaveAttribute('type', 'file');
  expect(input).not.toHaveAttribute('tabindex', '-1');
  // The visible trigger only forwards the click, so "Import session" names
  // exactly one focusable control: the input, which carries the focus ring.
  const trigger = document.querySelector('.session-import .button')!;
  expect(trigger).toHaveClass('button--secondary', 'button--compact');
  expect(trigger).toHaveAttribute('aria-hidden', 'true');
  expect(trigger).toHaveAttribute('tabindex', '-1');
  expect(screen.queryByRole('button', { name: 'Import session' })).not.toBeInTheDocument();
  const tabStops = [...document.querySelectorAll<HTMLElement>('.change-log__header button, .change-log__header input')]
    .filter(element => element.tabIndex >= 0 && element.getAttribute('aria-hidden') !== 'true');
  expect(tabStops.map(element => element === input ? 'Import session' : element.textContent))
    .toEqual(['Export session', 'Import session', 'Close']);
});

test('a live session can start the sample from the expanded log without losing its fields', async () => {
  replaceState({ ...createInitialState(), log: [{ actor: 'agent', at: 1,
    event: { actor: 'agent', action: { type: 'read', operation: 'list' } } }] } as ReviewSession);
  const start = vi.spyOn(controller, 'startSample').mockResolvedValue();
  render(<ChangeLogDrawer />);
  fireEvent.click(screen.getByRole('button', { name: 'Show change log' }));
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Play sample session' })); });
  expect(start).toHaveBeenCalledOnce();
  expect(screen.getByRole('button', { name: 'Show change log' })).toBeInTheDocument();
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

test('Export session announces "Session exported" through the live region', () => {
  vi.useFakeTimers();
  vi.stubGlobal('URL', { createObjectURL: () => 'blob:session', revokeObjectURL: vi.fn() });
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  replaceState({ ...createInitialState(), log: [{ actor: 'agent', at: 1,
    event: { actor: 'agent', action: { type: 'read', operation: 'list' } } }] } as ReviewSession);
  render(<><ExportSessionButton /><LiveRegion /></>);
  act(() => { fireEvent.click(screen.getByRole('button', { name: 'Export session' })); });
  expect(document.querySelector('[aria-live]')).toHaveTextContent('Session exported');
  vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllGlobals();
});

test('a successful import hands focus to Pause on the replay row', async () => {
  render(<><ChangeLogDrawer /><ReplayControls /></>);
  fireEvent.click(screen.getByRole('button', { name: 'Show change log' }));
  await importFile(JSON.stringify({ recorded_at: '2026-09-01', steps: [{ actor: 'agent', at: 0, call: { tool: 'list_rfq_documents', input: {} } }] }));
  expect(screen.getByRole('button', { name: 'Pause' })).toHaveFocus();
});

test('an imported fixture that ends at once hands focus to Restart, the row it has', async () => {
  render(<><ChangeLogDrawer /><ReplayControls /></>);
  fireEvent.click(screen.getByRole('button', { name: 'Show change log' }));
  await importFile('{"recorded_at":"2026-09-01","steps":[]}');
  expect(screen.queryByRole('button', { name: 'Pause' })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Restart' })).toHaveFocus();
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
