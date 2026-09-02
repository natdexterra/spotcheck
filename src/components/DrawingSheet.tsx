import { useEffect, useRef, useState } from 'react';
import drawingSheetUrl from '../../data/drawing-sheet1.webp';
import { findDocument, sectionRegions, type DocumentData, type Region } from '../data/package';
import { OverlayBox, type NormalizedBox } from './OverlayBox';

type DrawingRegion = Region & { box?: NormalizedBox };
type DrawingDocument = DocumentData & { image?: string };
type Zoom = 1 | 2;

export interface DrawingSheetProps {
  document?: DrawingDocument;
  highlightedRef?: string;
  onActivateRegion: (sourceRef: string) => void;
  readingSectionId?: string;
}

const titleAreaCaption = 'a revision letter would live here; there is none';
const ZOOM_LEVELS: readonly Zoom[] = [1, 2];

export function DrawingSheet({
  document = findDocument('drawing') as DrawingDocument | undefined,
  highlightedRef,
  onActivateRegion,
  readingSectionId,
}: DrawingSheetProps) {
  // Zoom is UI state for this session only: it never reaches the reducer and it
  // is never stored, so the sheet always opens at 1×.
  const [zoom, setZoom] = useState<Zoom>(1);
  const wrapRef = useRef<HTMLDivElement>(null);

  // A box is positioned in percentages of the wrap, so at 2× it can sit outside
  // the scroll region's viewport. A provenance link, a region click and a zoom
  // change all end with the active box centered in that region — instantly: the
  // flash is the motion, and smooth scrolling here would fight reduced motion.
  useEffect(() => {
    if (!highlightedRef) return;
    wrapRef.current
      ?.querySelector<HTMLElement>('.drawing-overlay--active')
      ?.scrollIntoView?.({ behavior: 'auto', block: 'center', inline: 'center' });
  }, [highlightedRef, zoom]);

  if (!document) return null;
  const boxedRegions = document.sections.flatMap(section =>
    sectionRegions(document.id, section) as DrawingRegion[],
  ).filter((region): region is DrawingRegion & { box: NormalizedBox } => region.box !== undefined);

  return (
    <figure
      className={[
        'drawing-sheet',
        zoom === 2 && 'drawing-sheet--zoom-2',
      ].filter(Boolean).join(' ')}
    >
      <div className="drawing-sheet__toolbar">
        <p className="drawing-sheet__name">Sheet {String(document.sheet ?? '1 of 4')}</p>
        <div className="drawing-sheet__zoom">
          <span className="drawing-sheet__zoom-label" id="drawing-zoom-label">Zoom</span>
          <div aria-labelledby="drawing-zoom-label" className="segmented" role="radiogroup">
            {ZOOM_LEVELS.map(level => (
              <label className="segmented__option" key={level}>
                <input
                  aria-label={`Zoom ${level}x`}
                  checked={zoom === level}
                  className="visually-hidden"
                  name="drawing-zoom"
                  onChange={() => setZoom(level)}
                  type="radio"
                  value={level}
                />
                <span>{level}×</span>
              </label>
            ))}
          </div>
        </div>
      </div>
      {/* The sheet scrolls inside this wrapper, never in the tab panel: the
          toolbar and the caption stay on the document lane while only the
          drawing pans. A scroll container needs a tab stop of its own to be
          reachable from the keyboard, and its own name says what it moves —
          which needs a role, because a name on a generic element is dropped. */}
      <div
        aria-label="Drawing sheet, scrollable"
        className="drawing-sheet__scroll"
        role="group"
        tabIndex={0}
      >
        <div
          className={[
            'drawing-sheet__image-wrap',
            readingSectionId && 'drawing-sheet__image-wrap--reading',
          ].filter(Boolean).join(' ')}
          data-reading-section={readingSectionId}
          ref={wrapRef}
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
      </div>
      <figcaption className="drawing-sheet__caption">
        <span>{titleAreaCaption}</span>
        <span>regions are clickable</span>
      </figcaption>
    </figure>
  );
}
