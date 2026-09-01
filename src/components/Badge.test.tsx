// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, test } from 'vitest';
import type { Field, FieldState, ResolutionKind } from '../state/types';
import { Badge } from './Badge';

const field = (overrides: Partial<Field> = {}): Field => ({
  id: 'material',
  state: 'empty',
  value: null,
  locked: false,
  ...overrides,
});

afterEach(cleanup);

describe('Badge', () => {
  test.each<[FieldState, string, string]>([
    ['empty', 'Not extracted', 'Not extracted'],
    ['needs_review', 'Needs review', 'Needs review'],
    ['conflict', 'Two sources disagree', 'Conflict'],
    ['missing', 'Not found', 'Missing'],
  ])('renders the %s agent state with human and short wording', (state, humanText, shortText) => {
    render(<Badge field={field({ state })} now={43_000} />);

    expect(screen.getByText(humanText)).toBeInTheDocument();
    expect(screen.getByLabelText(shortText)).toHaveClass(`field-row__badge--${state}`);
    expect(document.querySelector('.field-row__badge-dot')).toBeInTheDocument();
  });

  test.each<[ResolutionKind, string, string]>([
    ['verified', 'Verified by you · 0:42 ago', 'Verified'],
    ['edited', 'Edited by you · 0:42 ago', 'Edited'],
    ['entered', 'Entered by you · 0:42 ago', 'Entered'],
    ['picked', 'Picked by you · 0:42 ago', 'Picked'],
    ['dismissed', 'Not required · 0:42 ago', 'Not required'],
    ['applied', 'Applied by you · 0:42 ago', 'Applied'],
    ['asked_customer', 'Awaiting customer · 0:42 ago', 'Asked customer'],
  ])('renders the %s resolution with its icon and exact wording', (kind, humanText, shortText) => {
    render(
      <Badge
        field={field({
          state: 'verified',
          value: kind === 'dismissed' || kind === 'asked_customer' ? null : '6061',
          locked: true,
          resolution: { kind, at: 1_000 },
        })}
        now={43_000}
      />,
    );

    expect(screen.getByText(humanText)).toBeInTheDocument();
    const badge = screen.getByLabelText(`${shortText}, locked`);
    expect(badge.querySelector('svg')).toBeInTheDocument();
    expect(badge.querySelector('.field-row__badge-dot')).not.toBeInTheDocument();
  });

  test('includes the lock text equivalent in the badge label', () => {
    render(<Badge field={field({ state: 'needs_review', locked: true })} />);
    expect(screen.getByLabelText('Needs review, locked')).toBeInTheDocument();
  });
});
