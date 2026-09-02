// Writes the registered tool schemas to evals/tools.json for `webmcp-evals local`.
// Run: node scripts/export-tools.mjs
// Loads the tool module through Vite so `import.meta.glob` and TypeScript resolve as in the app.
import { mkdirSync, writeFileSync } from 'node:fs';
import { createServer } from 'vite';

const tools = [];
globalThis.document = {
  modelContext: {
    registerTool(tool) {
      tools.push({ name: tool.name, description: tool.description, inputSchema: tool.inputSchema, annotations: tool.annotations });
    },
  },
};

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
try {
  const { registerTools } = await server.ssrLoadModule('/src/webmcp-tools.ts');
  const { dispatchAgent } = await server.ssrLoadModule('/src/state/store.ts');
  registerTools();
  // draft_clarification registers only while an open gap exists; create one so the full roster is exported.
  dispatchAgent({ type: 'report_missing', input: { field_id: 'general_tolerance', searched: ['spec:s3'], note: 'export' } });
} finally {
  await server.close();
}

mkdirSync('evals', { recursive: true });
writeFileSync('evals/tools.json', `${JSON.stringify({ tools }, null, 2)}\n`);
console.log(`${tools.length} tools written to evals/tools.json`);
