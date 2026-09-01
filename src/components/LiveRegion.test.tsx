// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { createInitialState } from '../state/session';
import { dispatchAgent, dispatchHuman, replaceState } from '../state/store';
import { LiveRegion } from './LiveRegion';

const proposal = (field_id: string, value: string) => ({ field_id, value, source_refs: ['spec:s1.1'] });

afterEach(() => {
  cleanup();
  act(() => replaceState(createInitialState()));
  vi.useRealTimers();
});

describe('LiveRegion', () => {
  test('batches plain proposals and flushes their count after three seconds', () => {
    vi.useFakeTimers();
    const { container } = render(<LiveRegion />);
    const region = container.querySelector('[aria-live="polite"]')!;

    act(() => {
      dispatchAgent({ type: 'propose', input: proposal('material', '6061'), at: 1 });
      dispatchAgent({ type: 'propose', input: proposal('quantity', '800'), at: 2 });
      dispatchAgent({ type: 'propose', input: proposal('delivery', '4 weeks'), at: 3 });
    });
    expect(region).toHaveTextContent('');
    act(() => vi.advanceTimersByTime(2_999));
    expect(region).toHaveTextContent('');
    act(() => vi.advanceTimersByTime(1));
    expect(region).toHaveTextContent('3 fields proposed');
  });

  test('announces flags and human actions individually while reads stay silent', () => {
    vi.useFakeTimers();
    const { container } = render(<LiveRegion />);
    const region = container.querySelector('[aria-live="polite"]')!;

    act(() => dispatchAgent({ type: 'read', operation: 'list', at: 1 }));
    expect(region).toHaveTextContent('');
    act(() => dispatchAgent({ type: 'report_conflict', at: 2, input: {
      field_id: 'quantity',
      candidates: [
        { value: '800', source_refs: ['spec:s1.1'] },
        { value: '750', source_refs: ['email:p2'] },
      ],
    } }));
    expect(region).toHaveTextContent('quantity: conflict reported by the agent');

    // Each message holds the region long enough to be spoken before the next.
    act(() => vi.advanceTimersByTime(999));
    expect(region).toHaveTextContent('quantity: conflict reported by the agent');
    act(() => vi.advanceTimersByTime(1));
    expect(region).toHaveTextContent('draft_clarification available, 7 tools');

    act(() => vi.advanceTimersByTime(1_000));
    act(() => dispatchHuman({ type: 'pick', field_id: 'quantity', index: 1, at: 3 }));
    expect(region).toHaveTextContent('quantity: picked');
  });

  test('announces a suggestion-producing rejection', () => {
    vi.useFakeTimers();
    const state = createInitialState();
    const material = state.fields.find(field => field.id === 'material')!;
    Object.assign(material, { locked: true, state: 'verified', value: '6061', resolution: { kind: 'edited', at: 1 } });
    act(() => replaceState(state));
    const { container } = render(<LiveRegion />);

    act(() => dispatchAgent({ type: 'propose', input: proposal('material', '7075'), at: 2 }));
    expect(container.querySelector('[aria-live="polite"]')).toHaveTextContent(
      'material: agent proposal rejected; suggestion available',
    );
  });
});
