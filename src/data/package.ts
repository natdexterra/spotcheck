export interface Region { id: string; text: string; injection?: boolean; private?: boolean }
export interface Section { id: string; title?: string; regions?: Region[]; strings?: string[] }
export interface DocumentData {
  id: string; type: string; title?: string; sections: Section[]; image?: string;
  sheet?: number | string | null; units_note?: string | null; material_note?: string | null;
}
export interface RfqPackage { reference?: string; customer?: string; documents: DocumentData[] }

const fixtures = import.meta.glob<RfqPackage>('../../data/package*.json', { eager: true, import: 'default' });
export const packageData = fixtures['../../data/package.json'] ?? fixtures['../../data/package.stub.json']!;
// App-authored fallbacks for datasets without titles (the stub); never derived from document body content.
const titles: Record<string, string> = { email: 'Customer email', spec: 'Specification', drawing: 'Drawing sheet 1' };
const sections: Record<string, string> = { request: 'Request', s1: 'Requirements', overall: 'Overall dimensions', detail: 'Detail' };
export const documentIndex = () => ({ documents: packageData.documents.map(doc => ({
  id: doc.id, type: doc.type, title: doc.title ?? titles[doc.id] ?? 'Document',
  sections: doc.sections.map(section => ({ id: section.id, title: section.title ?? sections[section.id] ?? 'Section' })),
})) });
export const findDocument = (id: string) => packageData.documents.find(doc => doc.id === id);
export const findSection = (doc: string, id: string) => findDocument(doc)?.sections.find(section => section.id === id);
export const sectionRegions = (doc: string, section: Section): Region[] => section.regions ??
  [{ id: `${doc}:${section.id}:text`, text: (section.strings ?? []).join('\n') }];
export const resolvesSource = (ref: string): boolean => packageData.documents.some(doc => doc.sections.some(section =>
  `${doc.id}:${section.id}` === ref || sectionRegions(doc.id, section).some(region => region.id === ref && !region.private)));
export const resolvesSearch = (ref: string): boolean => !!findDocument(ref) || packageData.documents.some(doc =>
  doc.sections.some(section => `${doc.id}:${section.id}` === ref));
