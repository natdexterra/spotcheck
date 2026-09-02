import { expect, test } from 'vitest';
import { exportSession, importSession } from './serialization';
import { dispatchHuman, getState } from '../state/store';

test('pretty export uses two spaces and round-trips identically to compact storage', async () => {
  dispatchHuman({ type: 'enter', field_id: 'material', value: 'steel', at: 50 });
  const compact = exportSession('2026-09-01');
  const pretty = exportSession('2026-09-01', true);
  expect(pretty).toContain('\n  "recorded_at":');
  expect(JSON.parse(pretty)).toEqual(JSON.parse(compact));
  const state = structuredClone(getState());
  await importSession(pretty);
  expect(getState()).toEqual(state);
});
