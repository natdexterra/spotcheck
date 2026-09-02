import { afterEach, expect, test, vi } from 'vitest';

afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); vi.resetModules(); });

test('end exposes fixture total and recorded duration and keeps persistence suspended', async () => {
  const { createReplay } = await import('./replay');
  const { startPersistence } = await import('./persistence');
  const storage = { getItem: () => null, setItem: vi.fn() };
  const persistence = await startPersistence(storage);
  const replay = createReplay({ recorded_at: '2026-09-01', steps: [
    { actor: 'agent', at: 100, call: { tool: 'list_rfq_documents', input: {} } },
    { actor: 'agent', at: 200, call: { tool: 'draft_clarification', input: { subject: 'Question', body: 'Please clarify', covers: [] } } },
    { actor: 'agent', at: 500, call: { tool: 'propose_field', input: { field_id: 'material', value: 'steel', source_refs: ['spec:s1.1'] } } },
    { actor: 'estimator', at: 2500, action: { type: 'verify', field_id: 'material' } },
  ] });
  expect(replay.total).toBe(4);
  expect(replay.ended).toBe(false);
  expect(replay.recordedMs).toBe(2000);
  while (await replay.next()) { /* finish */ }
  expect(replay.ended).toBe(true);
  expect(replay.playing).toBe(false);
  expect(replay.finishedByViewer).toBe(false);
  expect(storage.setItem).not.toHaveBeenCalled();
  replay.dispose(); persistence.stop();
});

test('throwing step pauses without advancing or releasing persistence; restart clears error', async () => {
  const tools = await import('../webmcp-tools');
  const { createReplay } = await import('./replay');
  const { startPersistence } = await import('./persistence');
  const storage = { getItem: () => null, setItem: vi.fn() };
  const persistence = await startPersistence(storage);
  const replay = createReplay({ recorded_at: '2026-09-01', steps: [
    { actor: 'agent', at: 0, call: { tool: 'list_rfq_documents', input: {} } },
  ] });
  vi.spyOn(tools, 'executeTool').mockRejectedValueOnce(new Error('Tool unavailable'));
  replay.play();
  await expect(replay.next()).resolves.toBe(false);
  expect(replay.position).toBe(0);
  expect(replay.playing).toBe(false);
  expect(replay.error).toBe('Tool unavailable');
  expect(storage.setItem).not.toHaveBeenCalled();
  replay.restart();
  expect(replay.error).toBeUndefined();
  await replay.next();
  expect(replay.ended).toBe(true);
  replay.dispose(); persistence.stop();
});

test('viewer confirmation ends replay; fixture confirmation does not count as viewer completion', async () => {
  const { createReplay, sampleSession } = await import('./replay');
  const { dispatchHuman } = await import('../state/store');
  const confirmIndex = sampleSession.steps.findIndex(step => step.actor === 'estimator' && step.action.type === 'confirm');
  const replay = createReplay();
  while (replay.position < confirmIndex) await replay.next();
  dispatchHuman({ type: 'confirm' });
  expect(replay.finishedByViewer).toBe(true);
  expect(replay.ended).toBe(true);
  expect(await replay.next()).toBe(false);
  replay.restart();
  while (await replay.next()) { /* fixture confirmation */ }
  expect(replay.finishedByViewer).toBe(false);
  const firstWrite = sampleSession.steps.find(step => step.actor === 'agent' && ['propose_field', 'report_conflict', 'report_missing'].includes(step.call.tool))!;
  expect(replay.recordedMs).toBe(sampleSession.steps[confirmIndex]!.at - firstWrite.at);
  replay.dispose();
});
