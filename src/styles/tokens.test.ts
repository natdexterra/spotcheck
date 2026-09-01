import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';

const tokensCss = readFileSync(fileURLToPath(new URL('./tokens.css', import.meta.url)), 'utf8');

function tokenValue(name: string): string | undefined {
  const match = tokensCss.match(new RegExp(`${name}\s*:\s*([^;]+);`));
  return match?.[1]?.trim();
}

// Spot checks against the DESIGN.md tables; values must match character-for-character.
describe('tokens.css', () => {
  test.each([
    ['--bg-canvas', '#F5F7FA'],
    ['--text-lg', '1.122rem'],
    ['--leading-md', '1rem'],
    ['--radius-2', '4px'],
    ['--space-3', '0.75rem'],
    ['--border-input', '#808A99'],
    ['--page-margin', 'max(28px, calc((100% - 1760px) / 2))'],
    ['--accent-strong', '#14418F'],
    ['--bg-subtle', '#ECEFF3'],
    ['--ink-hover', '#2A313A'],
    ['--ink-active', '#1A1F26'],
    ['--highlight', '#E7F0FE'],
    ['--highlight-edge', '#1F6FEB'],
    ['--dur-1', '120ms'],
    ['--dur-2', '200ms'],
  ])('%s is %s', (name, value) => {
    expect(tokenValue(name)).toBe(value);
  });
});
