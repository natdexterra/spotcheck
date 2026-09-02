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
    ['edited', 'agent original'],
    ['entered', '6061'],
    ['picked', 'agent original'],
    ['dismissed', '—'],
    ['applied', 'agent original'],
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
