import { findDocument, sectionRegions, type DocumentData } from '../data/package';

export interface DocumentTextProps {
  document: DocumentData;
  highlightedRef?: string;
  readingSectionId?: string;
  onActivateRegion: (sourceRef: string) => void;
  quiet?: boolean;
}

export function DocumentText({
  document,
  highlightedRef,
  onActivateRegion,
  quiet = false,
  readingSectionId,
}: DocumentTextProps) {
  return (
    <div className="document-text">
      {document.sections.map(section => {
        const sectionRef = `${document.id}:${section.id}`;
        const sectionHighlighted = highlightedRef === sectionRef;
        const sectionReading = readingSectionId === section.id;

        return (
          <section
            aria-label={sectionHighlighted ? `Focus field sourced from ${sectionRef}` : undefined}
            className={[
              'document-section',
              sectionHighlighted && 'document-section--highlighted',
              sectionReading && 'document-section--reading',
            ].filter(Boolean).join(' ')}
            data-reading={sectionReading || undefined}
            id={sectionRef}
            key={section.id}
            onClick={sectionHighlighted ? () => onActivateRegion(sectionRef) : undefined}
            onKeyDown={sectionHighlighted ? event => {
              if (event.key !== 'Enter' && event.key !== ' ') return;
              event.preventDefault();
              onActivateRegion(sectionRef);
            } : undefined}
            role={sectionHighlighted ? 'button' : undefined}
            tabIndex={sectionHighlighted ? 0 : undefined}
          >
            {section.title && <h3 className="document-section__title">{section.title}</h3>}
            {sectionRegions(document.id, section)
              .filter(region => !region.private && !(quiet && (region.injection || region.id === 'email:note')))
              .map(region => {
                const highlighted = highlightedRef === region.id;
                return (
                  <div
                    aria-label={highlighted ? `Focus field sourced from ${region.id}` : undefined}
                    className={[
                      'document-region',
                      'untrusted',
                      highlighted && 'document-region--highlighted',
                    ].filter(Boolean).join(' ')}
                    id={region.id}
                    key={region.id}
                    onClick={highlighted ? () => onActivateRegion(region.id) : undefined}
                    onKeyDown={highlighted ? event => {
                      if (event.key !== 'Enter' && event.key !== ' ') return;
                      event.preventDefault();
                      onActivateRegion(region.id);
                    } : undefined}
                    role={highlighted ? 'button' : undefined}
                    tabIndex={highlighted ? 0 : undefined}
                  >
                    <code className="document-region__id">{region.id}</code>
                    <p className="document-region__text">{region.text}</p>
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
