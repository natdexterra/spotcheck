// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { describe, expect, test } from 'vitest';
import { Header } from './Header';

describe('Header', () => {
  test('renders the product name and the package title', () => {
    render(<Header />);
    expect(screen.getByText('Spotcheck')).toBeInTheDocument();
    expect(screen.getByText('RFQ 26-0812 · Tarrowline Console Systems')).toBeInTheDocument();
  });

  // The strip carries the orienting sentence now; the header stays two labels.
  test('carries no tagline', () => {
    const { container } = render(<Header />);
    expect(screen.queryByText(/spot-check it/)).not.toBeInTheDocument();
    expect(container.querySelector('.header__tagline')).toBeNull();
  });
});
