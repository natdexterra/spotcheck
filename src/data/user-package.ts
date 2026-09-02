import type { DocumentData, Region, RfqPackage, Section } from './package';

/**
 * Turns pasted text and one image into a package in the same shape the bundled
 * sample has, so the seven tools, the state machine and the source pane read a
 * package a person brought exactly as they read the sample. No model runs here:
 * headings, paragraphs and region ids come out of the text by rule.
 *
 * Two contracts bound the split. Every region stays within `REGION_TEXT_CAP`
 * characters, and every section is small enough that `read_document` serializes
 * under the 1,500-character result cap in `build-spec.md`. Both are measured,
 * not estimated: the packer serializes the result shape as it fills a section.
 */

/** The longest text one region may carry; longer paragraphs split at sentence ends. */
export const REGION_TEXT_CAP = 1_200;
/** Room left under the 1,500-character result cap for JSON escaping. */
const SECTION_RESULT_BUDGET = 1_450;

const SHEET_TEXT = 'Drawing sheet 1: image, no transcription. ' +
  'Values read from the image must be checked against the sheet.';
const HEADING_NUMBER = /^\d+(\.\d+)*[.)]?\s+\S/;
const SENTENCE_END = /[.!?…。]["'”’)\]]?(?=\s|$)/g;

export interface UserPackageInput {
  reference: string;
  customer?: string;
  email: string;
  spec?: string;
  /** The re-encoded image as a data URL (see `prepare-drawing.ts`). */
  drawing?: string;
}

interface BoxedRegion extends Region { box: readonly [number, number, number, number] }

const normalize = (text: string): string => text.replaceAll('\r\n', '\n').replaceAll('\r', '\n');
const paragraphsOf = (text: string): string[] =>
  text.split(/\n[ \t]*\n/).map(part => part.trim()).filter(part => part.length > 0);

/** An all-capitals line reads as a heading: it has letters and none of them are lower case. */
const isCapsHeading = (line: string): boolean =>
  line.length >= 3 && line.length <= 80 && /\p{Lu}/u.test(line) && !/\p{Ll}/u.test(line);

const isHeading = (line: string): boolean => HEADING_NUMBER.test(line) || isCapsHeading(line);

/** `email:p3`, then `email:p3b`, `email:p3c` for the parts a long paragraph splits into. */
const partSuffix = (index: number): string => {
  if (index === 0) return '';
  if (index < 26) return String.fromCharCode(97 + index);
  return `z${partSuffix(index - 25)}`;
};

/**
 * Cuts a paragraph at the last sentence end that fits the cap, and at the last
 * space when a single sentence is longer than the cap. Nothing is dropped.
 */
export function splitParagraph(text: string): string[] {
  if (text.length <= REGION_TEXT_CAP) return [text];
  SENTENCE_END.lastIndex = 0;
  let cut = 0;
  for (let match = SENTENCE_END.exec(text); match; match = SENTENCE_END.exec(text)) {
    const end = match.index + match[0].length;
    if (end > REGION_TEXT_CAP) break;
    cut = end;
  }
  if (cut === 0) {
    const space = text.lastIndexOf(' ', REGION_TEXT_CAP);
    cut = space > 0 ? space : REGION_TEXT_CAP;
  }
  return [text.slice(0, cut).trim(), ...splitParagraph(text.slice(cut).trim())];
}

const regionsFor = (baseId: string, text: string): Region[] =>
  splitParagraph(text).map((part, index) => ({ id: `${baseId}${partSuffix(index)}`, text: part }));

interface Group { regions: Region[] }

/** The serialized `read_document` result for one section (src/state/read-results.ts). */
const resultSize = (docId: string, sectionId: string, regions: Region[], sheet?: string): number =>
  JSON.stringify({
    doc_id: docId,
    section_id: sectionId,
    regions: regions.map(({ id, text }) => ({ id, text })),
    ...(sheet != null ? { sheet } : {}),
  }).length;

/**
 * Fills one section after another from a group's regions, opening a lettered
 * continuation (`s3b`, `s3c`) whenever the next region would push the section's
 * result over the budget. A single oversized region still gets its own section.
 */
function pack(docId: string, baseId: string, baseTitle: string, group: Group, sheet?: string): Section[] {
  const sections: Section[] = [];
  let regions: Region[] = [];
  const flush = () => {
    const part = sections.length;
    sections.push({
      id: `${baseId}${partSuffix(part)}`,
      title: part === 0 ? baseTitle : `${baseTitle} part ${part + 1}`,
      regions,
    });
    regions = [];
  };
  for (const region of group.regions) {
    const sectionId = `${baseId}${partSuffix(sections.length)}`;
    if (regions.length > 0 && resultSize(docId, sectionId, [...regions, region], sheet) > SECTION_RESULT_BUDGET) flush();
    regions.push(region);
  }
  if (regions.length > 0 || sections.length === 0) flush();
  return sections;
}

function emailDocument(text: string): DocumentData {
  const lines = normalize(text).split('\n');
  const subjectIndex = lines.findIndex(line => line.trim().length > 0);
  const subject = subjectIndex < 0 ? '' : lines[subjectIndex]!.trim();
  const body = subjectIndex < 0 ? '' : lines.slice(subjectIndex + 1).join('\n');
  const regions: Region[] = subject.length > 0 ? regionsFor('email:subject', subject) : [];
  paragraphsOf(body).forEach((paragraph, index) => {
    regions.push(...regionsFor(`email:p${index + 1}`, paragraph));
  });
  return { id: 'email', type: 'email', title: 'Customer email', sections: pack('email', 'body', 'Email', { regions }) };
}

/** Heading lines open sections; what stands before the first one is the title. */
function specGroups(text: string): { id: string; title: string; regions: Region[] }[] {
  const lines = normalize(text).split('\n');
  const blocks: { heading?: string; lines: string[] }[] = [{ lines: [] }];
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.length > 0 && isHeading(trimmed)) blocks.push({ heading: trimmed, lines: [] });
    else blocks[blocks.length - 1]!.lines.push(line);
  }
  const groups: { id: string; title: string; regions: Region[] }[] = [];
  const lead = blocks[0]!.lines.join('\n').trim();
  if (lead.length > 0) groups.push({ id: 'title', title: 'Title', regions: regionsFor('spec:title', lead) });
  let number = 0;
  for (const block of blocks.slice(1)) {
    number += 1;
    const id = `s${number}`;
    const regions: Region[] = regionsFor(`spec:${id}.0`, block.heading!);
    paragraphsOf(block.lines.join('\n')).forEach((paragraph, index) => {
      regions.push(...regionsFor(`spec:${id}.${index + 1}`, paragraph));
    });
    groups.push({ id, title: `Section ${number}`, regions });
  }
  return groups;
}

function specDocument(text: string): DocumentData {
  const sections = specGroups(text).flatMap(group => pack('spec', group.id, group.title, group));
  return { id: 'spec', type: 'specification', title: 'Specification', sections };
}

/**
 * One whole-sheet region, because nothing on a user drawing is transcribed: an
 * agent that can see the page may cite the sheet, and an agent that cannot gets
 * the text and reports the value missing.
 */
function drawingDocument(image: string): DocumentData {
  const sheet: BoxedRegion = { id: 'drawing:sheet', text: SHEET_TEXT, box: [0, 0, 1, 1] };
  return {
    id: 'drawing', type: 'drawing', title: 'Drawing sheet 1', image, sheet: '1 of 1',
    sections: [
      { id: 'overall', title: 'Overall dimensions', regions: [sheet] },
      { id: 'detail', title: 'Detail', regions: [] },
    ],
  };
}

export function buildPackage({ customer, drawing, email, reference, spec }: UserPackageInput): RfqPackage {
  const documents: DocumentData[] = [emailDocument(email)];
  if (spec !== undefined && spec.trim().length > 0) documents.push(specDocument(spec));
  if (drawing !== undefined && drawing.length > 0) documents.push(drawingDocument(drawing));
  return {
    reference: reference.trim(),
    ...(customer !== undefined && customer.trim().length > 0 ? { customer: customer.trim() } : {}),
    documents,
  };
}
