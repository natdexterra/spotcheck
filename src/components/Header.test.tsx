// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { describe, expect, test } from 'vitest';
import { Header } from './Header';

describe('Header', () => {
  test('renders product, role explanation, and package title', () => {
    render(<Header />);
    expect(screen.getByText('Spotcheck')).toBeInTheDocument();
    expect(screen.getByText('Your agent reads the RFQ. You spot-check it.')).toBeInTheDocument();
    expect(screen.getByText('RFQ 26-0812 · Tarrowline Console Systems')).toBeInTheDocument();
  });
});
