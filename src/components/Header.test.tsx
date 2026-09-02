// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, test } from 'vitest';
import { buildPackage } from '../data/user-package';
import { samplePackage, setPackage } from '../data/package';
import { Header } from './Header';

describe('Header', () => {
  afterEach(() => setPackage(samplePackage));

  test('renders the product name and the package title', () => {
    render(<Header />);
    expect(screen.getByText('Spotcheck')).toBeInTheDocument();
    expect(screen.getByText('RFQ 26-0812 · Tarrowline Console Systems')).toBeInTheDocument();
  });

  test('names the package a person opened, and its customer beside it', () => {
    setPackage(buildPackage({ reference: 'RFQ 91-2201', customer: 'Ridgeway Panels', email: 'S\n\nBody.' }));
    const { container } = render(<Header />);
    expect(container.querySelector('.header__package')).toHaveTextContent('RFQ 91-2201 · Ridgeway Panels');
  });

  test('a package with no customer shows the reference alone', () => {
    setPackage(buildPackage({ reference: 'RFQ 91-2201', email: 'S\n\nBody.' }));
    const { container } = render(<Header />);
    expect(container.querySelector('.header__package')).toHaveTextContent('RFQ 91-2201');
  });

  // The strip carries the orienting sentence now; the header stays two labels.
  test('carries no tagline', () => {
    const { container } = render(<Header />);
    expect(screen.queryByText(/spot-check it/)).not.toBeInTheDocument();
    expect(container.querySelector('.header__tagline')).toBeNull();
  });
});
