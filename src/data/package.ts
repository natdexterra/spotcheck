export interface Region { id: string; text: string; injection?: boolean; private?: boolean }
export interface Section { id: string; title?: string; regions?: Region[]; strings?: string[] }
export interface DocumentData {
  id: string; type: string; title?: string; sections: Section[]; image?: string;
  sheet?: number | string | null; units_note?: string | null; material_note?: string | null;
}
export interface RfqPackage { reference?: string; customer?: string; documents: DocumentData[] }

const fixtures = import.meta.glob<RfqPackage>('../../data/package*.json', { eager: true, import: 'default' });
/** The package the page opens on, and the one `Use the sample package` restores. */
export const samplePackage = fixtures['../../data/package.json'] ?? fixtures['../../data/package.stub.json']!;

// The package is a store of one value, not a constant: a person may open their
// own, and every helper below answers for whichever package is current. Tools
// resolve documents through these helpers, so neither the tool layer nor the
// reducer has to know that the package can change under them.
let current: RfqPackage = samplePackage;
const listeners = new Set<() => void>();
export const getPackage = (): RfqPackage => current;
export const subscribePackage = (listener: () => void): () => void => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};
export const setPackage = (next: RfqPackage): void => {
  current = next;
  listeners.forEach(listener => listener());
};

// App-authored fallbacks for datasets without titles (the stub); never derived from document body content.
const titles: Record<string, string> = { email: 'Customer email', spec: 'Specification', drawing: 'Drawing sheet 1' };
const sections: Record<string, string> = { request: 'Request', s1: 'Requirements', overall: 'Overall dimensions', detail: 'Detail' };
// A section the app has no name for is listed by its id alone, under the global
// result rule in `build-spec.md` that absent members are omitted: a long package
// a person opened drops the invented titles to keep this index under its cap.
export const packageIndex = (pkg: RfqPackage) => ({ documents: pkg.documents.map(doc => ({
  id: doc.id, type: doc.type, title: doc.title ?? titles[doc.id] ?? 'Document',
  sections: doc.sections.map(section => {
    const title = section.title ?? sections[section.id];
    return title === undefined ? { id: section.id } : { id: section.id, title };
  }),
})) });
export const documentIndex = () => packageIndex(current);
export const findDocument = (id: string) => current.documents.find(doc => doc.id === id);
export const findSection = (doc: string, id: string) => findDocument(doc)?.sections.find(section => section.id === id);
export const sectionRegions = (doc: string, section: Section): Region[] => section.regions ??
  [{ id: `${doc}:${section.id}:text`, text: (section.strings ?? []).join('\n') }];
export const resolvesSource = (ref: string): boolean => current.documents.some(doc => doc.sections.some(section =>
  `${doc.id}:${section.id}` === ref || sectionRegions(doc.id, section).some(region => region.id === ref && !region.private)));
export const resolvesSearch = (ref: string): boolean => !!findDocument(ref) || current.documents.some(doc =>
  doc.sections.some(section => `${doc.id}:${section.id}` === ref));
