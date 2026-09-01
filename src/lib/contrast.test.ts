import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';
import { contrastRatio } from './contrast';

const tokensCss = readFileSync(fileURLToPath(new URL('../styles/tokens.css', import.meta.url)), 'utf8');
const token = (name: string): string => {
  const value = tokensCss.match(new RegExp(`${name}\\s*:\\s*([^;]+);`))?.[1]?.trim();
  if (!value?.startsWith('#')) throw new Error(`Missing color token ${name}`);
  return value;
};

describe('DESIGN.md contrast ledger', () => {
  test.each([
    ['--ink', '--bg-raised', 4.5],
    ['--ink-secondary', '--bg-raised', 4.5],
    ['--ink-muted', '--bg-raised', 4.5],
    ['--accent-text', '--bg-raised', 4.5],
    ['--state-conflict', '--state-conflict-tint', 4.5],
    ['--state-missing', '--state-missing-tint', 4.5],
    ['--state-verified', '--state-verified-tint', 4.5],
    ['--highlight-edge', '--highlight', 3],
    ['--border-input', '--bg-raised', 3],
    ['--accent', '--bg-canvas', 3],
  ])('%s on %s meets %s:1', (foreground, background, minimum) => {
    expect(contrastRatio(token(foreground), token(background))).toBeGreaterThanOrEqual(minimum);
  });
});
