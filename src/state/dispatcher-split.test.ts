import { expect, test, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { createScanner } from 'typescript/unstable/ast/scanner';
import { SyntaxKind } from 'typescript/unstable/ast';

const tokens = (source: string) => {
  const scanner = createScanner(true, undefined, source);
  const result: string[] = [];
  while (scanner.scan() !== SyntaxKind.EndOfFile) result.push(scanner.getTokenText());
  return result;
};
const unquote = (token: string) => token.slice(1, -1);
const forbidden = new Set(['dispatchHuman', 'transitionHuman', 'HumanAction']);

/** Parse static import/re-export statements, retaining imported capability names through aliases. */
function checkImports(entry: string, read: (path: string) => string = path => readFileSync(path, 'utf8')): void {
  const visited = new Set<string>();
  const visit = (file: string) => {
    if (visited.has(file)) return;
    visited.add(file);
    const ts = tokens(read(file));
    for (let i = 0; i < ts.length; i++) {
      if (ts[i] !== 'import' && ts[i] !== 'export') continue;
      if (ts[i] === 'import' && ts[i + 1] === '.') continue; // import.meta.glob: fixture data, not executable imports
      if (ts[i + 1] === '(') throw new Error('Dynamic executable imports need an explicit capability review');
      const end = ts.indexOf(';', i);
      const statement = ts.slice(i, end < 0 ? ts.length : end);
      const from = statement.indexOf('from');
      if (from < 0) {
        if (/^['"]/.test(statement[1] ?? '')) throw new Error('Side-effect imports need an explicit capability review');
        continue;
      }
      const names = statement.slice(1, from);
      if (names.some(name => forbidden.has(name))) throw new Error('Human capability imported');
      const specifier = unquote(statement[from + 1]!);
      if (!specifier.startsWith('.')) throw new Error('External executable imports need an explicit capability review');
      const target = resolve(dirname(file), specifier + '.ts');
      if (target === resolve('src/state/store.ts')) {
        // This is the actor boundary, not a module-wide exemption: namespace/default/star exports are disallowed.
        const allowed = new Set(['{', '}', ',', 'as', 'dispatchAgent', 'getState', 'subscribe']);
        if (names.some(name => !allowed.has(name))) throw new Error('Store capability is outside the agent surface');
      } else visit(target);
    }
  };
  visit(entry);
}

test('T1: finished tool module imports no human capability, including transitive aliases and re-exports', () => {
  expect(() => checkImports(resolve('src/webmcp-tools.ts'))).not.toThrow();
  for (const wrapper of [
    "import {dispatchHuman as hidden} from './state/store'; export const run = hidden;",
    "export {dispatchHuman as run} from './state/store';",
    "export * from './state/store';",
    "import * as store from './state/store'; export const run = store.dispatchHuman;",
  ]) {
    const files = new Map([[resolve('src/probe.ts'), "import {run} from './wrapper'; run();"], [resolve('src/wrapper.ts'), wrapper]]);
    expect(() => checkImports(resolve('src/probe.ts'), path => files.get(path) ?? readFileSync(path, 'utf8'))).toThrow();
  }
  const store = tokens(readFileSync('src/state/store.ts', 'utf8')).join(' ');
  expect(store).toContain("state = reduce ( state , { actor : 'agent' , action } )");
  const reducer = tokens(readFileSync('src/state/reducer.ts', 'utf8'));
  expect(reducer).not.toContain('document');
  expect(reducer).not.toContain('window');
  expect(reducer.join(' ')).not.toMatch(/from ['"]react/);
});

test('T1: AgentAction has exactly five discriminants; tool payloads cannot smuggle human actions', async () => {
  const source = tokens(readFileSync('src/state/types.ts', 'utf8'));
  const start = source.indexOf('AgentAction');
  const end = source.indexOf('HumanAction', start);
  const union = source.slice(start, end);
  const members = union.flatMap((token, i) => token === 'type' && union[i + 1] === ':' ? [unquote(union[i + 2]!)] : []);
  expect(members).toEqual(['read', 'propose', 'report_conflict', 'report_missing', 'draft']);
  vi.resetModules();
  const { executeTool } = await import('../webmcp-tools');
  const { getState } = await import('./store');
  for (const type of ['verify', 'edit', 'enter', 'pick', 'apply', 'dismiss', 'send', 'confirm']) {
    await executeTool('propose_field', { type, actor: 'human', field_id: 'material', value: 'verified', source_refs: ['spec:s1.1'], confirmed: true });
    expect(getState().confirmed).toBe(false);
    expect(getState().fields.some(f => f.state === 'verified')).toBe(false);
  }
});
