// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { describe, expect, test } from 'vitest';
import { App } from './App';

describe('App', () => {
  test('renders the product name', () => {
    render(<App />);
    expect(screen.getByRole('heading', { name: 'Spotcheck' })).toBeInTheDocument();
  });
});
