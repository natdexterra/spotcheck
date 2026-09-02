// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { act, cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { createInitialState, type ReviewSession } from '../state/session';
import { replaceState } from '../state/store';
import type { Field, FieldId, FieldState, ResolutionKind } from '../state/types';
import { FieldList } from './FieldList';
import { FieldRow } from './FieldRow';

const field = (id: FieldId, state: FieldState, overrides: Partial<Field> = {}): Field => ({
  id,
  state,
  value: state === 'empty' || state === 'missing' ? null : id,
  locked: state === 'verified',
  ...(state === 'verified' ? { resolution: { kind: 'verified' as const, at: 1_000 } } : {}),
  ...overrides,
});

afterEach(() => {
  cleanup();
  act(() => replaceState(createInitialState()));
  vi.restoreAllMocks();
});

describe('FieldRow', () => {
  test('renders label, value, unit, lock, sources, agent rationale, revision, and review actions', async () => {
    const onSource = vi.fn();
    render(
      <FieldRow
        field={field('overall_dimensions', 'needs_review', {
          value: '20 × 14.5',
          unit: 'in',
          locked: true,
          proposal: {
            value: '20 × 14.5',
            unit: 'in',
            source_refs: ['spec:s2.1'],
            rationale: 'The specification states the envelope.',
          },
          revised: { was: '20 × 15', at: 1_000 },
        })}
        onSource={onSource}
      />,
    );

    expect(screen.getByText('Overall dimensions')).toBeInTheDocument();
    expect(screen.getByText('your entry: 20 × 14.5 in')).toBeInTheDocument();
    expect(document.querySelector('.icon--lock')).toBeInTheDocument();
    expect(screen.getByText('Agent: The specification states the envelope.')).toBeInTheDocument();
    expect(screen.getByText('was: 20 × 15')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Verify' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ask customer' })).toHaveAttribute('aria-pressed', 'false');

    await userEvent.click(screen.getByRole('link', { name: 'spec §2.1' }));
    expect(onSource).toHaveBeenCalledWith('spec:s2.1', 'overall_dimensions');
  });

  test('uses Add unit instead of Verify for unit-less dimensions', () => {
    render(<FieldRow field={field('overall_dimensions', 'needs_review', { value: '20 × 14.5', unit: null })} />);
    expect(screen.getByRole('button', { name: 'Add unit' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Verify' })).not.toBeInTheDocument();
  });

  test('renders the conflict panel action', () => {
    render(<FieldRow field={field('quantity', 'conflict', {
      candidates: [
        { value: '800', source_refs: ['spec:s2.1'] },
        { value: '750', source_refs: ['email:p2'] },
      ],
    })} />);
    expect(screen.getByRole('button', { name: 'Enter another value' })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Pick' })).toHaveLength(2);
  });

  test('renders missing search evidence, note, and recovery actions', () => {
    render(<FieldRow field={field('delivery', 'missing', {
      searched: { searched: ['email', 'spec:s3'], note: 'No delivery date was stated.' },
    })} />);
    expect(screen.getByText('Agent: No delivery date was stated.')).toBeInTheDocument();
    // P2 § Field pane: where the agent looked is a row of chips, not prose.
    expect([...document.querySelectorAll('.field-row__chip')].map(chip => chip.textContent))
      .toEqual(['the email', 'spec §3']);
    expect(document.querySelector('.field-row__chips')!.compareDocumentPosition(
      document.querySelector('.field-row__agent-note')!,
    ) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Enter value' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Mark not required' })).toBeInTheDocument();
  });

  test('renders empty actions', () => {
    render(<FieldRow field={field('material', 'empty')} />);
    expect(screen.getByText('—')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Enter value' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Mark not required' })).toBeInTheDocument();
  });

  test.each<[ResolutionKind, string]>([
    ['verified', '6061'],
    ['edited', '6061'],
    ['entered', '6061'],
    ['picked', '6061'],
    ['dismissed', '—'],
    ['applied', '6061'],
    ['asked_customer', '—'],
  ])('renders the %s resolution and Reopen action', (kind, expected) => {
    const value = kind === 'dismissed' || kind === 'asked_customer' ? null : '6061';
    render(<FieldRow field={field('material', 'verified', {
      value,
      resolution: { kind, at: Date.now() },
      proposal: { value: 'original', source_refs: ['spec:s1.1'] },
    })} />);
    expect(screen.getByText(expected)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reopen' })).toBeInTheDocument();
  });
});

describe('FieldList', () => {
  test('renders groups in risk order and collapses verified rows newest first', async () => {
    act(() => replaceState({
      confirmed: false,
      fields: [
        field('part_name', 'empty'),
        field('drawing_number', 'verified', { resolution: { kind: 'verified', at: 10 } }),
        field('delivery', 'missing'),
        field('quantity', 'conflict'),
        field('material', 'needs_review'),
        field('customer_rfq_ref', 'verified', { resolution: { kind: 'edited', at: 20 } }),
      ],
    }));
    render(<FieldList />);

    expect(screen.getByText('2 of 11 verified')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: '2 of 11 verified' })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '1 conflict' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '1 missing' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '1 to review' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '1 not extracted' })).toBeInTheDocument();

    const rowIds = [...document.querySelectorAll<HTMLElement>('.field-row')].map(row => row.dataset.fieldId);
    expect(rowIds).toEqual(['quantity', 'delivery', 'material', 'part_name']);
    expect(document.querySelector('.field-list__verified-count')).toHaveTextContent('2 more verified');
    expect(document.querySelector('.field-list__verified-names')).toHaveTextContent('Customer RFQ ref · Drawing number');

    await userEvent.click(screen.getByRole('button', { name: 'Show' }));
    const verifiedGroup = document.querySelector('.field-list__group--verified');
    expect(verifiedGroup).not.toBeNull();
    const verifiedRows = within(verifiedGroup as HTMLElement)
      .getAllByRole('article')
      .map(row => row.getAttribute('data-field-id'));
    expect(verifiedRows).toEqual(['customer_rfq_ref', 'drawing_number']);
    expect(screen.getByRole('button', { name: 'Hide' })).toHaveAttribute('aria-expanded', 'true');
  });

  test('names a report the agent made after the estimator had already set the field', async () => {
    const session: ReviewSession = {
      confirmed: false,
      fields: [field('material', 'verified', { value: '6061-T6' })],
      log: [{
        actor: 'agent',
        at: 2_000,
        event: {
          actor: 'agent',
          action: {
            type: 'report_conflict',
            at: 2_000,
            input: { field_id: 'material', candidates: [] },
          },
        },
        result: { ok: false, code: 'FIELD_LOCKED' },
      }],
    };
    act(() => replaceState(session));
    render(<FieldList />);
    await userEvent.click(screen.getByRole('button', { name: 'Show' }));

    expect(screen.getByText(
      /Agent: reported a conflict on this field after you set it/,
    )).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'see log' })).toHaveAttribute('href', '#change-log');
  });

  test('reveals a verified row when it receives a pending suggestion', () => {
    act(() => replaceState({
      confirmed: false,
      fields: [field('material', 'verified', {
        suggestion: { value: 'Steel', source_refs: ['email:p3'], rationale: 'The email names steel.' },
      })],
    }));
    render(<FieldList />);

    expect(screen.getByText('Steel')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Apply' })).toBeInTheDocument();
  });
});

describe('FieldRow value slot', () => {
  const resolved = (kind: ResolutionKind, value: string | null) => field('surface_finish', 'verified', {
    value,
    resolution: { kind, at: 1_000 },
  });

  test.each<[ResolutionKind, string]>([
    ['dismissed', 'Not required'],
    ['asked_customer', 'Awaiting customer'],
  ])('a %s row with no value shows a dash, and the wording stays in the badge', kind => {
    render(<FieldRow field={resolved(kind, null)} now={1_000} />);

    expect(document.querySelector('.field-row__value')).toHaveTextContent('—');
    expect(document.querySelector('.field-row__badge')).toHaveTextContent(`${kind === 'dismissed' ? 'Not required' : 'Awaiting customer'} · 0:00 ago`);
  });

  test('an asked-customer row that had a value keeps it', () => {
    render(<FieldRow field={resolved('asked_customer', 'Black powder coat')} now={1_000} />);

    expect(document.querySelector('.field-row__value')).toHaveTextContent('Black powder coat');
  });
});

describe('FieldRow with an open editor', () => {
  const editing = field('overall_dimensions', 'needs_review', {
    value: '20 × 14.5',
    unit: null,
    locked: true,
    proposal: {
      value: '20 × 14.5',
      source_refs: ['drawing:width'],
      rationale: 'The drawing names no unit.',
    },
    revised: { was: '20 × 15', at: 1_000 },
  });

  test('the editor replaces the value line and the row keeps its label and badge', async () => {
    render(<FieldRow field={editing} />);
    await userEvent.click(screen.getByRole('button', { name: 'Add unit' }));

    expect(screen.getByText('Overall dimensions')).toBeInTheDocument();
    expect(screen.getByText('Unit missing')).toBeInTheDocument();
    expect(document.querySelector('.icon--lock')).toBeInTheDocument();

    expect(document.querySelector('.field-row__value')).toBeNull();
    expect(document.querySelector('.field-row__sources')).toBeNull();
    expect(document.querySelector('.field-row__revision')).toBeNull();
    expect(document.querySelector('.field-row__agent-original')).toBeNull();
    expect(screen.queryByText(/The drawing names no unit/)).not.toBeInTheDocument();
    expect(document.querySelector('.field-row__actions')).toBeNull();
  });

  test('closing the editor gives focus back to the button that opened it', async () => {
    render(<FieldRow field={editing} />);
    await userEvent.click(screen.getByRole('button', { name: 'Add unit' }));
    await userEvent.keyboard('{Escape}');

    expect(screen.getByRole('button', { name: 'Add unit' })).toHaveFocus();
  });

  test('the reason picker leaves the row actions in place and gives focus back on Cancel', async () => {
    render(<FieldRow field={field('delivery', 'empty')} />);
    await userEvent.click(screen.getAllByRole('button', { name: 'Mark not required' })[0]!);

    expect(document.querySelector('.field-row__actions')).not.toBeNull();

    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.getByRole('button', { name: 'Mark not required' })).toHaveFocus();
  });
});

describe('the verified group header', () => {
  const allVerified = () => act(() => replaceState({
    confirmed: false,
    fields: (['customer_rfq_ref', 'part_name', 'quantity'] as FieldId[]).map(id => field(id, 'verified')),
  }));

  test('says "more" only while another group is still open', () => {
    act(() => replaceState({
      confirmed: false,
      fields: [field('material', 'needs_review'), field('part_name', 'verified')],
    }));
    render(<FieldList />);

    expect(document.querySelector('.field-list__verified-count')).toHaveTextContent('1 more verified');
  });

  test('drops "more" once every field is verified', () => {
    allVerified();
    render(<FieldList />);

    expect(document.querySelector('.field-list__verified-count')).toHaveTextContent('3 verified');
  });

  test('keeps the names on one line and the disclosure on its chevron', () => {
    allVerified();
    render(<FieldList />);

    const names = document.querySelector('.field-list__verified-names');
    expect(names).toHaveTextContent('Customer RFQ ref · Part · Quantity');
    const disclosure = screen.getByRole('button', { name: 'Show' });
    expect(disclosure.querySelector('svg')).not.toBeNull();
    // The disclosure names the region it opens, and the region is there to be
    // named whether it holds rows or not.
    expect(disclosure).toHaveAttribute('aria-controls', 'verified-fields');
    expect(document.getElementById('verified-fields')).not.toBeNull();
  });
});

describe('FieldRow consequence lines', () => {
  test('a row marked for the clarification email says what that means', () => {
    render(<FieldRow field={field('surface_finish', 'needs_review', { ask_customer: true })} />);

    expect(screen.getByRole('button', { name: 'Ask customer' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText(
      'Marked for the clarification email. This field still counts as open.',
    )).toBeInTheDocument();
  });

  test('an untouched row says nothing about the clarification email', () => {
    render(<FieldRow field={field('surface_finish', 'needs_review')} />);

    expect(screen.queryByText(/Marked for the clarification email/)).not.toBeInTheDocument();
  });
});

describe('the sentence under a verified value', () => {
  const verified = (kind: ResolutionKind, value: string | null = '750') => field('quantity', 'verified', {
    value,
    resolution: { kind, at: 1_000 },
    proposal: { value: '800', source_refs: ['spec:s1.1'] },
  });

  test('a field verified as proposed says the value is the agent’s', () => {
    render(<FieldRow field={verified('verified', '800')} />);

    expect(document.querySelector('.field-row__resolution')).toHaveTextContent(
      'the agent’s value, kept as proposed · spec §1.1',
    );
  });

  test.each<ResolutionKind>(['edited', 'picked', 'applied'])('a %s field names both values', kind => {
    render(<FieldRow field={verified(kind)} />);

    expect(document.querySelector('.field-row__resolution')).toHaveTextContent(
      'agent 800 → yours 750 · spec §1.1',
    );
    // The bare agent line is gone: the sentence carries it.
    expect(document.querySelector('.field-row__agent-original')).toBeNull();
  });

  test('a unit-bearing field keeps its unit on both sides of the arrow', () => {
    render(<FieldRow field={field('overall_dimensions', 'verified', {
      value: '20.000 × 14.600',
      unit: 'in',
      resolution: { kind: 'edited', at: 1_000 },
      proposal: { value: '20.000 × 14.500', unit: 'in', source_refs: ['drawing:width'] },
    })} />);

    expect(document.querySelector('.field-row__resolution')).toHaveTextContent(
      'agent 20.000 × 14.500 in → yours 20.000 × 14.600 in · drawing width',
    );
  });

  test('a picked candidate names the reading it was taken over', () => {
    render(<FieldRow field={field('quantity', 'verified', {
      value: '750',
      resolution: { kind: 'picked', at: 1_000 },
      candidates: [
        { value: '800', source_refs: ['spec:s1.1'], note: 'stated twice in the specification' },
        { value: '750', source_refs: ['email:p2'], note: 'the email asks for 750' },
      ],
    })} />);

    // A conflict row carries candidates, never a proposal, so the sentence has
    // to be built from them.
    expect(document.querySelector('.field-row__resolution')).toHaveTextContent(
      'agent 800 → yours 750 · email ¶2',
    );
  });

  test('a settled row prints its provenance once, inside the sentence', () => {
    render(<FieldRow field={verified('verified', '800')} />);

    // Export 11: the links live in the sentence, so the row keeps no line of
    // its own for them.
    expect(document.querySelector('.field-row__sources')).toBeNull();
    expect(document.querySelectorAll('.field-row__resolution a')).toHaveLength(1);
  });

  test('a field the estimator typed says there was nothing to compare against', () => {
    render(<FieldRow field={field('quantity', 'verified', {
      value: '750',
      resolution: { kind: 'entered', at: 1_000 },
    })} />);

    expect(document.querySelector('.field-row__resolution')).toHaveTextContent(
      'no agent proposal · you typed this one',
    );
  });

  test('a reopened row keeps the bare agent line instead', () => {
    render(<FieldRow field={field('quantity', 'needs_review', {
      value: '750',
      locked: true,
      proposal: { value: '800', source_refs: ['spec:s1.1'] },
    })} />);

    expect(document.querySelector('.field-row__agent-original')).toHaveTextContent('agent 800 · spec §1.1');
    expect(document.querySelector('.field-row__resolution')).toBeNull();
  });
});

describe('a row settled without a value of its own', () => {
  test('a not-required row gives the reason you chose', () => {
    render(<FieldRow
      dismissReason="covered by our shop standard"
      field={field('general_tolerance', 'verified', {
        value: null,
        resolution: { kind: 'dismissed', at: 1_000 },
      })}
    />);

    expect(document.querySelector('.field-row__resolution')).toHaveTextContent(
      'your reason: covered by our shop standard',
    );
  });

  test('an asked-customer row says when the question went and what it covers', () => {
    render(<FieldRow
      field={field('surface_finish', 'verified', {
        value: 'Black powder coat',
        resolution: { kind: 'asked_customer', at: 1_000 },
      })}
      sent={{ at: new Date(2026, 8, 2, 14, 36).getTime(), covers: ['surface_finish', 'general_tolerance'] }}
    />);

    expect(document.querySelector('.field-row__resolution')).toHaveTextContent(
      'sent 14:36 · covers this field and General tolerance · see the sent text',
    );
  });

  test('the list reads both out of the log', async () => {
    const at = new Date(2026, 8, 2, 14, 36).getTime();
    const state = createInitialState();
    act(() => replaceState({
      ...state,
      fields: [
        field('general_tolerance', 'verified', { value: null, resolution: { kind: 'dismissed', at } }),
        field('surface_finish', 'verified', { value: 'Black powder coat', resolution: { kind: 'asked_customer', at } }),
      ],
      log: [
        {
          actor: 'estimator',
          at,
          event: {
            actor: 'human',
            action: { type: 'dismiss', field_id: 'general_tolerance', reason: 'covered by our shop standard' },
          },
        },
        {
          actor: 'estimator',
          at,
          event: { actor: 'human', action: { type: 'send', covers: ['surface_finish'] } },
        },
      ],
    } as never));
    render(<FieldList />);
    await userEvent.click(screen.getByRole('button', { name: 'Show' }));

    expect(document.body).toHaveTextContent('your reason: covered by our shop standard');
    expect(document.body).toHaveTextContent('sent 14:36 · covers this field · see the sent text');
  });
});

describe('empty rows', () => {
  test('an empty row says why it is empty once the agent has started', () => {
    render(<FieldRow field={field('delivery', 'empty')} />);

    expect(document.querySelector('.field-row__resolution')).toHaveTextContent(
      'The agent has proposed nothing here. It may still be reading, or it skipped the field.',
    );
    expect(screen.getByRole('button', { name: 'Enter value' })).toBeInTheDocument();
  });

  test('before the first tool call the row is one line: label, dash, badge', () => {
    act(() => replaceState(createInitialState()));
    render(<FieldList />);

    const rows = [...document.querySelectorAll('.field-row')];
    expect(rows).toHaveLength(11);
    for (const row of rows) {
      expect(row).toHaveClass('field-row--bare');
      expect(row.querySelector('.field-row__resolution')).toBeNull();
      expect(row.querySelector('.field-row__actions')).toBeNull();
      expect(row.querySelector('.field-row__value')).toHaveTextContent('—');
      expect(row.querySelector('.field-row__badge')).toHaveTextContent('Not extracted');
    }
  });
});
