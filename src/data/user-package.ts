import { packageIndex, type DocumentData, type Region, type RfqPackage, type Section } from './package';

/**
 * Turns pasted text and one image into a package in the same shape the bundled
 * sample has, so the seven tools, the state machine and the source pane read a
 * package a person brought exactly as they read the sample. No model runs here:
 * headings, paragraphs and region ids come out of the text by rule.
 *
 * Three contracts bound the split. Every region stays within `REGION_TEXT_CAP`
 * characters; every section is small enough that `read_document` serializes
 * under the 1,500-character result cap in `build-spec.md`; and the index that
 * `list_rfq_documents` returns is a tool result under the same cap, so a long
 * package may not name more sections than that index can carry. All three are
 * measured, not estimated: the packer serializes the result shape as it fills a
 * section, and the builder serializes the index before it accepts a split.
 */

/** The longest text one region may carry; longer paragraphs split at sentence ends. */
export const REGION_TEXT_CAP = 1_200;
/** Room left under the 1,500-character result cap for JSON escaping. */
const SECTION_RESULT_BUDGET = 1_450;
/** The same room for the section index, which is a tool result like any other. */
const INDEX_RESULT_BUDGET = 1_450;
/** No section is opened for less room than this; the next one starts instead. */
const MIN_SECTION_ROOM = 240;
/** Documents whose section titles the app invents, and may therefore leave out. */
const SYNTHETIC_TITLES = ['email', 'spec'];

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

/** One paragraph, or one heading line, with the region id it will be read under. */
interface Unit { id: string; text: string }
/** The regions of one heading and its body, or of the whole email. */
interface Group { id: string; title: string; units: Unit[] }
/**
 * How hard the splitter is pressing to make the index fit: how many consecutive
 * heading groups share a section, which documents still name their sections, and
 * whether a paragraph may be cut to fill the section it starts in.
 */
interface Plan { merge: number; tight: boolean; titled: ReadonlySet<string> }

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
 * Where to cut a paragraph that does not fit: the last sentence end within the
 * cap, else the last space, else the cap itself. Nothing is dropped.
 */
function cutIndex(text: string, cap: number): number {
  if (text.length <= cap) return text.length;
  SENTENCE_END.lastIndex = 0;
  let cut = 0;
  for (let match = SENTENCE_END.exec(text); match; match = SENTENCE_END.exec(text)) {
    const end = match.index + match[0].length;
    if (end > cap) break;
    cut = end;
  }
  if (cut === 0) {
    const space = text.lastIndexOf(' ', cap);
    cut = space > 0 ? space : cap;
  }
  return cut;
}

export function splitParagraph(text: string): string[] {
  const cut = cutIndex(text, REGION_TEXT_CAP);
  if (cut >= text.length) return [text];
  return [text.slice(0, cut).trim(), ...splitParagraph(text.slice(cut).trim())];
}

/** The serialized `read_document` result for one section (src/state/read-results.ts). */
const resultSize = (docId: string, sectionId: string, regions: Region[], sheet?: string): number =>
  JSON.stringify({
    doc_id: docId,
    section_id: sectionId,
    regions: regions.map(({ id, text }) => ({ id, text })),
    ...(sheet != null ? { sheet } : {}),
  }).length;

/**
 * The longest prefix of `text` a section still has room for, in characters of
 * the source. Escaping is counted, not guessed: a region's serialized cost is
 * its escaped text plus a fixed frame, so the frame is measured empty and the
 * prefix is searched against what is left.
 */
function roomFor(docId: string, sectionId: string, regions: Region[], id: string, text: string, sheet?: string): number {
  const frame = resultSize(docId, sectionId, [...regions, { id, text: '' }], sheet);
  const available = SECTION_RESULT_BUDGET - frame;
  if (available <= 0) return 0;
  let low = 0;
  let high = Math.min(available, REGION_TEXT_CAP, text.length);
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (JSON.stringify(text.slice(0, middle)).length - 2 <= available) low = middle;
    else high = middle - 1;
  }
  return low;
}

/**
 * Fills one section after another from a group's units, opening a lettered
 * continuation (`s3b`, `s3c`) whenever the next region would push the section's
 * result over the budget. A single oversized region still gets its own section.
 * Under `tight` the paragraph that does not fit is cut at a sentence end so the
 * section it started in is filled: fewer sections, and an index that fits.
 */
function pack(docId: string, group: Group, plan: { titled: boolean; tight: boolean }, sheet?: string): Section[] {
  const sections: Section[] = [];
  let regions: Region[] = [];
  const sectionId = (index: number) => `${group.id}${partSuffix(index)}`;
  const flush = () => {
    const part = sections.length;
    sections.push({
      id: sectionId(part),
      ...(plan.titled ? { title: part === 0 ? group.title : `${group.title} part ${part + 1}` } : {}),
      regions,
    });
    regions = [];
  };
  for (const unit of group.units) {
    let rest = unit.text;
    let part = 0;
    while (rest.length > 0) {
      const id = `${unit.id}${partSuffix(part)}`;
      const cut = cutIndex(rest, REGION_TEXT_CAP);
      const piece = rest.slice(0, cut).trim();
      const overflows =
        resultSize(docId, sectionId(sections.length), [...regions, { id, text: piece }], sheet) > SECTION_RESULT_BUDGET;
      if (overflows && regions.length > 0) {
        const room = plan.tight ? roomFor(docId, sectionId(sections.length), regions, id, rest, sheet) : 0;
        const filled = room < MIN_SECTION_ROOM ? 0 : cutIndex(rest, room);
        if (rest.slice(0, filled).trim().length === 0) { flush(); continue; }
        regions.push({ id, text: rest.slice(0, filled).trim() });
        rest = rest.slice(filled).trim();
        part += 1;
        continue;
      }
      regions.push({ id, text: piece });
      rest = rest.slice(cut).trim();
      part += 1;
    }
  }
  if (regions.length > 0 || sections.length === 0) flush();
  return sections;
}

function emailGroup(text: string): Group {
  const lines = normalize(text).split('\n');
  const subjectIndex = lines.findIndex(line => line.trim().length > 0);
  const subject = subjectIndex < 0 ? '' : lines[subjectIndex]!.trim();
  const body = subjectIndex < 0 ? '' : lines.slice(subjectIndex + 1).join('\n');
  const units: Unit[] = subject.length > 0 ? [{ id: 'email:subject', text: subject }] : [];
  paragraphsOf(body).forEach((paragraph, index) => units.push({ id: `email:p${index + 1}`, text: paragraph }));
  return { id: 'body', title: 'Email', units };
}

/** Heading lines open sections; what stands before the first one is the title. */
function specGroups(text: string): Group[] {
  const lines = normalize(text).split('\n');
  const blocks: { heading?: string; lines: string[] }[] = [{ lines: [] }];
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.length > 0 && isHeading(trimmed)) blocks.push({ heading: trimmed, lines: [] });
    else blocks[blocks.length - 1]!.lines.push(line);
  }
  const groups: Group[] = [];
  const lead = blocks[0]!.lines.join('\n').trim();
  if (lead.length > 0) groups.push({ id: 'title', title: 'Title', units: [{ id: 'spec:title', text: lead }] });
  let number = 0;
  for (const block of blocks.slice(1)) {
    number += 1;
    const id = `s${number}`;
    const units: Unit[] = [{ id: `spec:${id}.0`, text: block.heading! }];
    paragraphsOf(block.lines.join('\n')).forEach((paragraph, index) => {
      units.push({ id: `spec:${id}.${index + 1}`, text: paragraph });
    });
    groups.push({ id, title: `Section ${number}`, units });
  }
  return groups;
}

/**
 * Puts `factor` consecutive heading groups into one section. The section takes
 * the id and the title of the first of them, and every heading it now carries
 * stays where it was, as its own `sN.0` region: the ids an agent cites do not
 * move when the index has to get shorter.
 */
function mergeGroups(groups: Group[], factor: number): Group[] {
  if (factor <= 1) return groups;
  const merged: Group[] = [];
  for (let index = 0; index < groups.length; index += factor) {
    const chunk = groups.slice(index, index + factor);
    merged.push({ id: chunk[0]!.id, title: chunk[0]!.title, units: chunk.flatMap(group => group.units) });
  }
  return merged;
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

function documentsFor(input: UserPackageInput, plan: Plan): DocumentData[] {
  const documents: DocumentData[] = [{
    id: 'email', type: 'email', title: 'Customer email',
    sections: pack('email', emailGroup(input.email), { titled: plan.titled.has('email'), tight: plan.tight }),
  }];
  if (input.spec !== undefined && input.spec.trim().length > 0) {
    const groups = mergeGroups(specGroups(input.spec), plan.merge);
    documents.push({
      id: 'spec', type: 'specification', title: 'Specification',
      sections: groups.flatMap(group => pack('spec', group, { titled: plan.titled.has('spec'), tight: plan.tight })),
    });
  }
  if (input.drawing !== undefined && input.drawing.length > 0) documents.push(drawingDocument(input.drawing));
  return documents;
}

const indexSize = (documents: DocumentData[]): number => JSON.stringify(packageIndex({ documents })).length;
const emptyIndexSize = (documents: DocumentData[]): number => indexSize(documents.map(doc => ({ ...doc, sections: [] })));

/**
 * Which document gives up its invented section titles first: the one whose share
 * of the index stands furthest above the share its section count entitles it to.
 */
function titleDropOrder(documents: DocumentData[]): string[] {
  const total = Math.max(documents.reduce((sum, doc) => sum + doc.sections.length, 0), 1);
  const budget = INDEX_RESULT_BUDGET - emptyIndexSize(documents);
  return documents
    .filter(doc => SYNTHETIC_TITLES.includes(doc.id))
    .map(doc => ({ id: doc.id, over: indexSize([doc]) - emptyIndexSize([doc]) - budget * (doc.sections.length / total) }))
    .sort((first, second) => second.over - first.over)
    .map(entry => entry.id);
}

/**
 * Splits the package, and when the index it produces is over the cap, splits it
 * again under more pressure: first fewer sections per heading, then without the
 * invented section titles (an id is what an agent cites, and "Section 12" tells
 * it nothing the id does not), then with paragraphs cut to fill the section they
 * start in. The first plan whose index fits is the one that ships, so a package
 * of ordinary length is split exactly as it was before any of this.
 */
function fittedDocuments(input: UserPackageInput): DocumentData[] {
  const both = new Set(SYNTHETIC_TITLES);
  let documents = documentsFor(input, { merge: 1, tight: false, titled: both });
  if (indexSize(documents) <= INDEX_RESULT_BUDGET) return documents;

  const headings = input.spec === undefined ? 1 : Math.max(specGroups(input.spec).length, 1);
  const merges = [...new Set([1, 2, 4, 8, 16, 32, headings])].filter(step => step <= headings).sort((a, b) => a - b);
  const order = titleDropOrder(documents);
  const titled: ReadonlySet<string>[] = [both, new Set(SYNTHETIC_TITLES.filter(id => id !== order[0])), new Set()];
  for (const tight of [false, true]) {
    for (const titles of titled) {
      for (const merge of merges) {
        documents = documentsFor(input, { merge, tight, titled: titles });
        if (indexSize(documents) <= INDEX_RESULT_BUDGET) return documents;
      }
    }
  }
  // Nothing further the splitter can do: text this dense cannot be both read in
  // 1,500-character sections and named in a 1,500-character index.
  return documents;
}

export function buildPackage(input: UserPackageInput): RfqPackage {
  const { customer, reference } = input;
  return {
    reference: reference.trim(),
    ...(customer !== undefined && customer.trim().length > 0 ? { customer: customer.trim() } : {}),
    documents: fittedDocuments(input),
  };
}
