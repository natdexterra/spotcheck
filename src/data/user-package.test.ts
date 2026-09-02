import { afterEach, describe, expect, test } from 'vitest';
import { buildPackage, REGION_TEXT_CAP } from './user-package';
import { documentIndex, samplePackage, setPackage, type DocumentData, type Region, type RfqPackage, type Section } from './package';

const sheetUrl = 'data:image/webp;base64,AAAA';

const doc = (pkg: { documents: DocumentData[] }, id: string): DocumentData =>
  pkg.documents.find(entry => entry.id === id) as DocumentData;
const section = (document: DocumentData, id: string): Section =>
  document.sections.find(entry => entry.id === id) as Section;
const regionIds = (document: DocumentData, id: string): string[] =>
  (section(document, id).regions ?? []).map(region => region.id);
const regionText = (document: DocumentData, regionId: string): string =>
  document.sections.flatMap(entry => entry.regions ?? []).find(region => region.id === regionId)?.text ?? '';

/** The shape `read_document` serializes for one section (src/state/read-results.ts). */
const readSize = (document: DocumentData, entry: Section): number => JSON.stringify({
  doc_id: document.id,
  section_id: entry.id,
  regions: (entry.regions ?? []).map(({ id, text }: Region) => ({ id, text })),
  ...(document.sheet != null ? { sheet: document.sheet } : {}),
}).length;

const sentences = (count: number, word = 'The bracket carries a tapped hole on the long flange. '): string =>
  word.repeat(count);

describe('buildPackage: the email', () => {
  const pkg = buildPackage({
    reference: 'RFQ 91-2201',
    customer: 'Ridgeway Panels',
    email: 'Quote request for the bay cover\n\nPlease quote 240 covers to the attached sheet.\n\nDelivery is four weeks from order.',
  });

  test('the first non-empty line becomes the subject region', () => {
    expect(regionText(doc(pkg, 'email'), 'email:subject')).toBe('Quote request for the bay cover');
  });

  test('blank lines separate the remaining paragraphs, numbered from one', () => {
    expect(regionIds(doc(pkg, 'email'), 'body')).toEqual(['email:subject', 'email:p1', 'email:p2']);
    expect(regionText(doc(pkg, 'email'), 'email:p2')).toBe('Delivery is four weeks from order.');
  });

  test('the document and its section are named by the app, not by the pasted text', () => {
    expect(doc(pkg, 'email').title).toBe('Customer email');
    expect(section(doc(pkg, 'email'), 'body').title).toBe('Email');
  });
});

describe('buildPackage: long paragraphs', () => {
  const long = sentences(40);
  const pkg = buildPackage({
    reference: 'RFQ 91-2201',
    email: `Subject line\n\nShort one.\n\n${long}`,
  });
  const email = doc(pkg, 'email');
  const parts = (email.sections.flatMap(entry => entry.regions ?? []))
    .filter(region => region.id.startsWith('email:p2'));

  test('a paragraph over the region cap splits into lettered continuations', () => {
    expect(long.length).toBeGreaterThan(REGION_TEXT_CAP);
    expect(parts.map(region => region.id)).toEqual(['email:p2', 'email:p2b']);
  });

  test('every part stays within the region cap and the text is kept whole', () => {
    for (const part of parts) expect(part.text.length).toBeLessThanOrEqual(REGION_TEXT_CAP);
    expect(parts.map(part => part.text).join(' ')).toBe(long.trim());
  });

  test('the split falls at a sentence end', () => {
    expect(parts[0]?.text.endsWith('flange.')).toBe(true);
  });
});

describe('buildPackage: the specification', () => {
  const pkg = buildPackage({
    reference: 'RFQ 91-2201',
    email: 'Subject line\n\nBody paragraph.',
    spec: [
      'Bay cover specification',
      'Issued 4 March.',
      '',
      '1. Purpose',
      '',
      'Fabricate and deliver 240 bay covers.',
      '',
      'Each cover ships flat.',
      '',
      'MATERIALS',
      '',
      'Aluminium 5052-H32, 2 mm.',
      '',
      '2.1) Finish',
    ].join('\n'),
  });
  const spec = doc(pkg, 'spec');

  test('text before the first heading becomes the title section', () => {
    expect(regionIds(spec, 'title')).toEqual(['spec:title']);
    expect(regionText(spec, 'spec:title')).toBe('Bay cover specification\nIssued 4 March.');
  });

  test('a numbered line and an all-capitals line each open a section', () => {
    expect(spec.sections.map(entry => entry.id)).toEqual(['title', 's1', 's2', 's3']);
    expect(regionText(spec, 'spec:s1.0')).toBe('1. Purpose');
    expect(regionText(spec, 'spec:s2.0')).toBe('MATERIALS');
  });

  test('the heading stands in a region and the paragraphs follow it', () => {
    expect(regionIds(spec, 's1')).toEqual(['spec:s1.0', 'spec:s1.1', 'spec:s1.2']);
    expect(regionText(spec, 'spec:s1.1')).toBe('Fabricate and deliver 240 bay covers.');
  });

  test('a section with no body still exists, carrying its heading', () => {
    expect(regionIds(spec, 's3')).toEqual(['spec:s3.0']);
    expect(regionText(spec, 'spec:s3.0')).toBe('2.1) Finish');
  });

  test('section titles are app-authored and quote nothing from the pasted text', () => {
    expect(spec.title).toBe('Specification');
    expect(spec.sections.map(entry => entry.title)).toEqual(['Title', 'Section 1', 'Section 2', 'Section 3']);
  });
});

describe('buildPackage: the drawing', () => {
  const pkg = buildPackage({
    reference: 'RFQ 91-2201',
    email: 'Subject line\n\nBody paragraph.',
    drawing: sheetUrl,
  });
  const drawing = doc(pkg, 'drawing');

  test('the whole sheet is the only region, boxed from corner to corner', () => {
    expect(regionIds(drawing, 'overall')).toEqual(['drawing:sheet']);
    expect((section(drawing, 'overall').regions?.[0] as { box?: number[] }).box).toEqual([0, 0, 1, 1]);
  });

  test('its text says the sheet was not transcribed', () => {
    expect(regionText(drawing, 'drawing:sheet')).toBe(
      'Drawing sheet 1: image, no transcription. Values read from the image must be checked against the sheet.',
    );
  });

  test('the detail section holds no regions and the sheet count is one of one', () => {
    expect(section(drawing, 'detail').regions).toEqual([]);
    expect(drawing.sheet).toBe('1 of 1');
    expect((drawing as { image?: string }).image).toBe(sheetUrl);
  });
});

describe('buildPackage: what the package holds', () => {
  test('the reference and the customer travel with the package', () => {
    const pkg = buildPackage({ reference: 'RFQ 91-2201', customer: 'Ridgeway Panels', email: 'Subject\n\nBody.' });
    expect(pkg.reference).toBe('RFQ 91-2201');
    expect(pkg.customer).toBe('Ridgeway Panels');
  });

  test('a package without a specification lists two documents', () => {
    const pkg = buildPackage({ reference: 'R', email: 'Subject\n\nBody.', drawing: sheetUrl });
    expect(pkg.documents.map(entry => entry.id)).toEqual(['email', 'drawing']);
  });

  test('a package without a drawing lists two documents', () => {
    const pkg = buildPackage({ reference: 'R', email: 'Subject\n\nBody.', spec: '1. Purpose\n\nMake it.' });
    expect(pkg.documents.map(entry => entry.id)).toEqual(['email', 'spec']);
  });
});

describe('buildPackage: tool output budgets', () => {
  // build-spec.md § Tool contract: every serialized tool result stays under
  // 1,500 characters, the section index included.
  const spec = Array.from({ length: 15 }, (_, index) =>
    `${index + 1}. Section heading ${index + 1}\n\n${sentences(25)}\n\n${sentences(25)}`).join('\n\n');
  const pkg = buildPackage({
    reference: 'RFQ 91-2201',
    customer: 'Ridgeway Panels',
    email: 'Subject line\n\nBody paragraph.',
    spec,
    drawing: sheetUrl,
  });

  test('the fixture under test is the size the dialog admits', () => {
    expect(spec.length).toBeGreaterThan(40_000);
  });

  test('every section reads back under the cap', () => {
    for (const document of pkg.documents) {
      for (const entry of document.sections) {
        expect(`${document.id}/${entry.id}: ${readSize(document, entry)}`)
          .toBe(`${document.id}/${entry.id}: ${Math.min(readSize(document, entry), 1_499)}`);
      }
    }
  });

  test('no region carries more than the region cap', () => {
    for (const document of pkg.documents) {
      for (const entry of document.sections) {
        for (const region of entry.regions ?? []) expect(region.text.length).toBeLessThanOrEqual(REGION_TEXT_CAP);
      }
    }
  });

  test('a section that outgrows the budget continues under a lettered id', () => {
    expect(doc(pkg, 'spec').sections.map(entry => entry.id)).toContain('s1b');
  });

  test('a package the index has room for names its sections', () => {
    const small = buildPackage({ reference: 'R', email: 'Subject\n\nBody.', spec: `1. Purpose\n\n${sentences(40)}` });
    const spec = doc(small, 'spec');
    expect(spec.sections.map(entry => entry.id)).toContain('s1b');
    expect(spec.sections.find(entry => entry.id === 's1b')?.title).toBe('Section 1 part 2');
  });

  test('the whole pasted specification survives the split', () => {
    const rejoined = doc(pkg, 'spec').sections
      .flatMap(entry => entry.regions ?? [])
      .map(region => region.text)
      .join('\n');
    expect(rejoined.replaceAll(/\s+/g, ' ').trim()).toBe(spec.replaceAll(/\s+/g, ' ').trim());
  });
});

describe('buildPackage: the section index', () => {
  // build-spec.md § Tool contract: `list_rfq_documents` is a tool result like
  // any other, so its serialized size is measured against the same cap as a
  // section read. A package the dialog admits is two documents of 40,000
  // characters and an image, and its index has to fit that.
  const INDEX_CAP = 1_500;
  const indexOf = (pkg: RfqPackage): string => { setPackage(pkg); return JSON.stringify(documentIndex()); };

  /** Paragraphs of the length that packs worst: over half a section's room, so no two share one. */
  const body = (total: number, size: number, word: string): string => {
    const parts: string[] = [];
    while (parts.join('\n\n').length < total) parts.push(sentences(Math.ceil(size / 52), `${word} carries a tapped hole on the long flange. `));
    return parts.join('\n\n').slice(0, total);
  };
  const longSpec = (total: number): string => {
    const parts: string[] = [];
    let number = 0;
    while (parts.join('\n\n').length < total) {
      number += 1;
      parts.push(`${number}. Heading ${number}`, body(760, 760, 'The bracket'));
    }
    return parts.join('\n\n').slice(0, total);
  };

  afterEach(() => { setPackage(samplePackage); });

  test('a specification at the size the dialog admits indexes under the cap', () => {
    const spec = longSpec(40_000);
    expect(spec.length).toBe(40_000);
    expect(indexOf(buildPackage({ reference: 'R', email: 'Subject\n\nBody.', spec })).length).toBeLessThan(INDEX_CAP);
  });

  test('a specification and an email at that size, with a drawing, index under the cap', () => {
    const pkg = buildPackage({
      reference: 'R', email: `Subject line\n\n${body(40_000, 700, 'The cover')}`, spec: longSpec(40_000), drawing: sheetUrl,
    });
    expect(indexOf(pkg).length).toBeLessThan(INDEX_CAP);
  });

  test('merging the index never pushes a section read over its own cap', () => {
    const pkg = buildPackage({
      reference: 'R', email: `Subject line\n\n${body(40_000, 700, 'The cover')}`, spec: longSpec(40_000), drawing: sheetUrl,
    });
    for (const document of pkg.documents) {
      for (const entry of document.sections) {
        expect(`${document.id}/${entry.id}: ${readSize(document, entry)}`)
          .toBe(`${document.id}/${entry.id}: ${Math.min(readSize(document, entry), 1_499)}`);
      }
    }
  });

  test('region ids stay unique across the merged sections', () => {
    const pkg = buildPackage({
      reference: 'R', email: `Subject line\n\n${body(40_000, 700, 'The cover')}`, spec: longSpec(40_000), drawing: sheetUrl,
    });
    const ids = pkg.documents.flatMap(document => document.sections.flatMap(entry => (entry.regions ?? []).map(region => region.id)));
    expect(new Set(ids).size).toBe(ids.length);
  });

  test('the whole specification survives the merge', () => {
    const spec = longSpec(40_000);
    const pkg = buildPackage({ reference: 'R', email: 'Subject\n\nBody.', spec, drawing: sheetUrl });
    const rejoined = doc(pkg, 'spec').sections.flatMap(entry => entry.regions ?? []).map(region => region.text).join('\n');
    expect(rejoined.replaceAll(/\s+/g, ' ').trim()).toBe(spec.replaceAll(/\s+/g, ' ').trim());
  });

  test('the bundled sample keeps the index it has always had', () => {
    setPackage(samplePackage);
    expect(JSON.stringify(documentIndex())).toBe('{"documents":[{"id":"email","type":"email","title":"Customer email","sections":[{"id":"body","title":"Email"}]},{"id":"spec","type":"specification","title":"Specification","sections":[{"id":"title","title":"Title"},{"id":"s1","title":"Project Objective"},{"id":"s2","title":"Scope of Work"},{"id":"s3","title":"Technical Specifications"},{"id":"s4","title":"Deliverables"},{"id":"s5","title":"Inspection and Acceptance"}]},{"id":"drawing","type":"drawing","title":"Drawing sheet 1","sections":[{"id":"overall","title":"Key callouts"},{"id":"detail","title":"All dimension callouts"}]}]}');
  });
});
