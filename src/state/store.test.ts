import { describe, expect, test, vi } from 'vitest';

vi.mock('./reducer', () => ({
  reduce: vi.fn((state: object) => ({ ...state })),
}));

import { reduce } from './reducer';
import { dispatchAgent, dispatchHuman, getState, subscribe } from './store';

const reduceMock = vi.mocked(reduce);

describe('store', () => {
  test('subscribe receives one notification per dispatch and unsubscribes cleanly', () => {
    const listener = vi.fn();
    const unsubscribe = subscribe(listener);

    dispatchAgent({ type: 'read' });
    expect(listener).toHaveBeenCalledTimes(1);

    dispatchHuman({ type: 'verify' });
    expect(listener).toHaveBeenCalledTimes(2);

    unsubscribe();
    dispatchAgent({ type: 'propose' });
    expect(listener).toHaveBeenCalledTimes(2);
  });

  test('dispatchAgent reaches the reducer tagged with the agent actor', () => {
    dispatchAgent({ type: 'report_missing' });
    expect(reduceMock).toHaveBeenLastCalledWith(expect.anything(), {
      actor: 'agent',
      action: { type: 'report_missing' },
    });
  });

  test('dispatchHuman reaches the reducer tagged with the human actor', () => {
    dispatchHuman({ type: 'confirm' });
    expect(reduceMock).toHaveBeenLastCalledWith(expect.anything(), {
      actor: 'human',
      action: { type: 'confirm' },
    });
  });

  test('getState returns the state the reducer produced last', () => {
    dispatchAgent({ type: 'draft' });
    const lastResult = reduceMock.mock.results.at(-1);
    expect(lastResult?.type).toBe('return');
    expect(getState()).toBe(lastResult?.value);
  });
});
