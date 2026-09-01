// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { Button } from './Button';
import { JumpLink } from './JumpLink';
import { ProvenanceLink } from './ProvenanceLink';

afterEach(cleanup);

describe('shared controls', () => {
  test.each([
    ['primary', 'Confirm quote request'],
    ['secondary', 'Verify'],
    ['text', 'Dismiss'],
  ] as const)('renders a semantic %s button with its text', (variant, label) => {
    render(<Button variant={variant}>{label}</Button>);

    expect(screen.getByRole('button', { name: label })).toHaveClass(
      'button',
      `button--${variant}`,
    );
  });

  test('forwards native button behavior and defaults to type button', () => {
    const onClick = vi.fn();
    render(
      <Button variant="secondary" disabled onClick={onClick}>
        Verify
      </Button>,
    );

    const button = screen.getByRole('button', { name: 'Verify' });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('type', 'button');
    button.click();
    expect(onClick).not.toHaveBeenCalled();
  });

  test('renders provenance as a dotted inline link', () => {
    render(<ProvenanceLink href="#spec-s1.1">spec §1.1</ProvenanceLink>);

    expect(screen.getByRole('link', { name: 'spec §1.1' })).toHaveClass(
      'inline-link--provenance',
    );
  });

  test('renders field navigation as a solid jump link', () => {
    render(<JumpLink href="#conflicts">2 conflicts</JumpLink>);

    expect(screen.getByRole('link', { name: '2 conflicts' })).toHaveClass(
      'inline-link--jump',
    );
  });
});
