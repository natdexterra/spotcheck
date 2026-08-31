import { expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { documentIndex } from './package';

test('P1.1 data: authored titles in data/package.json reach the document index', () => {
  const authored = JSON.parse(readFileSync('data/package.json', 'utf8')) as {
    documents: { id: string; title?: string; sections: { id: string; title?: string }[] }[];
  };
  const index = documentIndex();
  const spec = index.documents.find(doc => doc.id === 'spec');
  expect(spec?.sections.find(section => section.id === 's1')?.title).toBe('Project Objective');
  for (const doc of authored.documents) {
    const indexed = index.documents.find(entry => entry.id === doc.id);
    if (doc.title !== undefined) expect(indexed?.title).toBe(doc.title);
    for (const section of doc.sections) if (section.title !== undefined)
      expect(indexed?.sections.find(entry => entry.id === section.id)?.title).toBe(section.title);
  }
});
