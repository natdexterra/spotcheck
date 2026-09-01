import drawingSheetUrl from '../../data/drawing-sheet1.webp';
import { findDocument, sectionRegions, type DocumentData, type Region } from '../data/package';
import { OverlayBox, type NormalizedBox } from './OverlayBox';

type DrawingRegion = Region & { box?: NormalizedBox };
type DrawingDocument = DocumentData & { image?: string };

export interface DrawingSheetProps {
  document?: DrawingDocument;
  highlightedRef?: string;
  onActivateRegion: (sourceRef: string) => void;
  readingSectionId?: string;
}

const titleAreaCaption = 'a revision letter would live here; there is none';

export function DrawingSheet({
  document = findDocument('drawing') as DrawingDocument | undefined,
  highlightedRef,
  onActivateRegion,
  readingSectionId,
}: DrawingSheetProps) {
  if (!document) return null;
  const boxedRegions = document.sections.flatMap(section =>
    sectionRegions(document.id, section) as DrawingRegion[],
  ).filter((region): region is DrawingRegion & { box: NormalizedBox } => region.box !== undefined);

  return (
    <figure className="drawing-sheet">
      <div
        className={[
          'drawing-sheet__image-wrap',
          readingSectionId && 'drawing-sheet__image-wrap--reading',
        ].filter(Boolean).join(' ')}
        data-reading-section={readingSectionId}
      >
        <img
          alt="Drawing sheet 1 for the hanging KVM mount bracket"
          className="drawing-sheet__image"
          src={drawingSheetUrl}
        />
        <div className="drawing-sheet__overlays">
          {boxedRegions.map(region => (
            <OverlayBox
              active={highlightedRef === region.id}
              box={region.box}
              key={region.id}
              label={region.id === 'drawing:title_area' ? titleAreaCaption : region.text}
              onActivate={onActivateRegion}
              sourceRef={region.id}
            />
          ))}
        </div>
      </div>
      <figcaption className="drawing-sheet__caption">
        Sheet {String(document.sheet ?? '1 of 4')} · regions are clickable
      </figcaption>
    </figure>
  );
}
