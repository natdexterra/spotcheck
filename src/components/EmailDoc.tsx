import type { KeyboardEvent } from 'react';
import { findDocument, sectionRegions, type DocumentData, type Section } from '../data/package';

// "s3" reads as "3 · TECHNICAL SPECIFICATIONS"; the uppercase is the stylesheet's.
const sectionCaption = (section: Section): string | undefined => {
  if (!section.title) return undefined;
  const number = /^s(\d+)$/.exec(section.id)?.[1];
  return number ? `${number} · ${section.title}` : section.title;
};

export interface DocumentTextProps {
  document: DocumentData;
  highlightedRef?: string;
  /** Refs a field cites: those regions stay clickable, highlighted or not. */
  linkedRefs?: ReadonlySet<string>;
  readingSectionId?: string;
  onActivateRegion: (sourceRef: string) => void;
  quiet?: boolean;
}

export function DocumentText({
  document,
  highlightedRef,
  linkedRefs,
  onActivateRegion,
  quiet = false,
  readingSectionId,
}: DocumentTextProps) {
  // The reverse direction is a property of the region, not of the flash: a region
  // that sources a field stays operable after the two seconds are up, so focus is
  // never dropped when the highlight clears.
  const activation = (sourceRef: string) => linkedRefs?.has(sourceRef) === true
    ? {
      'aria-label': `Focus field sourced from ${sourceRef}`,
      onClick: () => onActivateRegion(sourceRef),
      onKeyDown: (event: KeyboardEvent<HTMLElement>) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        onActivateRegion(sourceRef);
      },
      role: 'button',
      tabIndex: 0,
    }
    : {};

  return (
    <div className="document-text">
      {document.sections.map(section => {
        const sectionRef = `${document.id}:${section.id}`;
        const sectionHighlighted = highlightedRef === sectionRef;
        const sectionReading = readingSectionId === section.id;

        return (
          <section
            {...activation(sectionRef)}
            className={[
              'document-section',
              sectionHighlighted && 'document-section--highlighted',
              sectionReading && 'document-section--reading',
            ].filter(Boolean).join(' ')}
            data-reading={sectionReading || undefined}
            id={sectionRef}
            key={section.id}
          >
            {section.id === 'title' || !sectionCaption(section)
              ? null
              : <h4 className="document-section__caption">{sectionCaption(section)}</h4>}
            {sectionRegions(document.id, section)
              .filter(region => !region.private && !(quiet && (region.injection || region.id === 'email:note')))
              .map(region => {
                const highlighted = highlightedRef === region.id;
                return (
                  <div
                    {...activation(region.id)}
                    className={[
                      'document-region',
                      'untrusted',
                      highlighted && 'document-region--highlighted',
                    ].filter(Boolean).join(' ')}
                    id={region.id}
                    key={region.id}
                  >
                    {section.id === 'title'
                      ? <h3 className="document-text__title">{region.text}</h3>
                      : <p className="document-region__text">{region.text}</p>}
                  </div>
                );
              })}
          </section>
        );
      })}
    </div>
  );
}

export interface EmailDocProps extends Omit<DocumentTextProps, 'document'> {
  document?: DocumentData;
}

export function EmailDoc({ document = findDocument('email'), ...props }: EmailDocProps) {
  if (!document) return null;
  return <DocumentText {...props} document={document} />;
}
