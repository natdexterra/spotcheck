import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';

const SOURCE_ROOT = fileURLToPath(new URL('.', import.meta.url));

/* Interface copy separates fragments with a middle dot, a colon or a full stop
   (DESIGN.md § Copy grammar). The dash characters are barred from everything
   the interface renders: log sentences, strip lines, hints, captions,
   announcements, aria-labels.

   Two paths are out of the sweep. `webmcp-tools.ts` holds tool descriptions
   read by the agent, not by a person, and the module is frozen outside its own
   task. Document and fixture text lives in `data/` and is rendered verbatim.

   The one sanctioned dash is the empty-value placeholder of a field row and a
   summary line, declared once in `lib/format.ts` and referenced everywhere
   else, so the character appears in exactly one place in the tree. */
const EXEMPT = ['webmcp-tools.ts'];

const DASHES = /[–—]/;
const SANCTIONED = /^export const NO_VALUE = '—';$/;

/** Comments are not rendered; only what ships to the screen is swept. */
const withoutComments = (source: string): string =>
  source.replaceAll(/\/\*[\s\S]*?\*\//g, '').replaceAll(/(^|[^:])\/\/.*$/gm, '$1');

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    if (!/\.tsx?$/.test(entry.name) || /\.test\.tsx?$/.test(entry.name)) return [];
    if (EXEMPT.includes(entry.name)) return [];
    return [path];
  });
}

describe('interface copy', () => {
  const files = sourceFiles(SOURCE_ROOT);

  test('sweeps the whole source tree', () => {
    expect(files.length).toBeGreaterThan(30);
  });

  test.each(files.map(path => [path.slice(SOURCE_ROOT.length).replaceAll('\\', '/'), path]))(
    '%s carries no en dash or em dash',
    (_name, path) => {
      const offenders = withoutComments(readFileSync(path, 'utf8'))
        .split('\n')
        .map((line, index) => [index + 1, line] as const)
        .filter(([, line]) => DASHES.test(line) && !SANCTIONED.test(line.trim()));

      expect(offenders).toEqual([]);
    },
  );
});
