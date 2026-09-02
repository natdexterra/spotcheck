import { expect, test, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  documentIndex, findDocument, findSection, getPackage, resolvesSearch, resolvesSource,
  samplePackage, sectionRegions, setPackage, subscribePackage,
} from './package';
import { buildPackage } from './user-package';

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

test('P5 store: the package opens on the bundled sample and every helper reads the current one', () => {
  expect(getPackage()).toBe(samplePackage);
  expect(documentIndex().documents.map(doc => doc.id)).toEqual(['email', 'spec', 'drawing']);

  const user = buildPackage({ reference: 'RFQ 91-2201', email: 'Subject\n\nOne paragraph.' });
  const changes = vi.fn();
  const unsubscribe = subscribePackage(changes);
  try {
    setPackage(user);

    expect(changes).toHaveBeenCalledOnce();
    expect(getPackage()).toBe(user);
    expect(documentIndex().documents.map(doc => doc.id)).toEqual(['email']);
    expect(findDocument('spec')).toBeUndefined();
    expect(findSection('email', 'body')?.title).toBe('Email');
    expect(sectionRegions('email', findSection('email', 'body')!).map(region => region.id))
      .toEqual(['email:subject', 'email:p1']);
    expect(resolvesSource('email:p1')).toBe(true);
    // A ref that belonged to the package before this one no longer resolves.
    expect(resolvesSource('spec:s1.1')).toBe(false);
    expect(resolvesSearch('email')).toBe(true);
    expect(resolvesSearch('spec')).toBe(false);
  } finally {
    unsubscribe();
    setPackage(samplePackage);
  }
});

test('P5 data: the sample package names its reference and its customer separately', () => {
  expect(samplePackage.reference).toBe('RFQ 26-0812');
  expect(samplePackage.customer).toBe('Tarrowline Console Systems');
  expect(samplePackage).not.toHaveProperty('title');
});
