import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from 'react';
import { documentIndex } from '../data/package';
import { usePackage } from '../hooks/usePackage';
import { fieldLabel } from '../lib/format';
import { useReview } from '../hooks/useReview';
import { useSheetDialog } from '../hooks/useSheetDialog';
import { ArrowLeftIcon, CrossIcon } from '../icons';
import type { Field, FieldId } from '../state/types';
import { Button } from './Button';
import { ClarificationEditor } from './ClarificationEditor';
import { DrawingSheet } from './DrawingSheet';
import { EmailDoc } from './EmailDoc';
import { SpecDoc } from './SpecDoc';

type SourceTab = 'email' | 'spec' | 'drawing' | 'clarification';

export interface SourceTarget {
  ref: string;
  fieldId: FieldId;
}

export interface SourcePaneProps {
  narrow?: boolean;
  onClose?: () => void;
  onFocusField: (fieldId: FieldId) => void;
  open?: boolean;
  quiet?: boolean;
  returnFocusRef?: RefObject<HTMLElement | null>;
  target?: SourceTarget;
}

interface ReadingTarget {
  docId: SourceTab;
  sectionId: string;
  key: string;
}

/** The order the tabs stand in; which of them exist is the package's to say. */
const DOCUMENT_ORDER: readonly SourceTab[] = ['email', 'spec', 'drawing'];
const TAB_LABELS: Record<SourceTab, string> = {
  email: 'Email',
  spec: 'Spec',
  drawing: 'Drawing',
  clarification: 'Clarification',
};
const DRAWING_FIELD_DEFAULTS: Partial<Record<string, FieldId>> = {
  'drawing:width': 'overall_dimensions',
  'drawing:height': 'overall_dimensions',
  'drawing:thickness': 'stock_thickness',
  'drawing:title_area': 'drawing_revision',
};

const tabFromRef = (sourceRef: string | undefined, tabs: readonly SourceTab[]): SourceTab | undefined => {
  const prefix = sourceRef?.split(':', 1)[0];
  // "clarification" names the tab and no region inside it: the sent text is one
  // panel, so the settled row links to the panel rather than to a paragraph.
  // A ref into a document this package does not hold resolves to no tab, and
  // the link that carried it is a no-op.
  return tabs.find(tab => tab === prefix);
};

const sourceRefsForField = (field: Field): string[] => [
  ...(field.proposal?.source_refs ?? []),
  ...(field.candidates?.flatMap(candidate => candidate.source_refs) ?? []),
  ...(field.suggestion?.source_refs ?? []),
];

const lastReadingTarget = (
  log: ReturnType<typeof useReview>['log'],
  tabs: readonly SourceTab[],
): ReadingTarget | undefined => {
  for (let index = log.length - 1; index >= 0; index -= 1) {
    const entry = log[index];
    if (!entry) continue;
    const action = entry?.event.action;
    if (action?.type !== 'read' || action.operation !== 'section') continue;
    const input = action.input;
    if (typeof input !== 'object' || input === null) continue;
    const docId = 'doc_id' in input && typeof input.doc_id === 'string' ? tabFromRef(`${input.doc_id}:`, tabs) : undefined;
    const sectionId = 'section_id' in input && typeof input.section_id === 'string' ? input.section_id : undefined;
    if (docId && sectionId) return { docId, sectionId, key: `${index}:${entry.at}:${docId}:${sectionId}` };
  }
  return undefined;
};

export function SourcePane({
  narrow = false,
  onClose,
  onFocusField,
  open = true,
  quiet = false,
  returnFocusRef,
  target,
}: SourcePaneProps) {
  const { draft, gaps, log, session, state } = useReview();
  const pkg = usePackage();
  const sent = session.sent;
  const clarificationVisible = sent !== undefined || (draft !== undefined && gaps.length > 0);
  // A tab exists only for a document the package holds: a package with no
  // specification has no Spec tab and no Spec panel behind it.
  const documentTabs = useMemo(
    () => DOCUMENT_ORDER.filter(tab => pkg.documents.some(doc => doc.id === tab)),
    [pkg],
  );
  const knownTabs = useMemo<readonly SourceTab[]>(
    () => [...documentTabs, 'clarification'],
    [documentTabs],
  );
  const reading = useMemo(() => lastReadingTarget(log, knownTabs), [knownTabs, log]);
  const firstTab = documentTabs[0] ?? 'clarification';
  const initialTab = tabFromRef(target?.ref, knownTabs)
    ?? (clarificationVisible ? 'clarification' : reading?.docId ?? firstTab);
  const [activeTab, setActiveTab] = useState<SourceTab>(initialTab);
  const [highlightedRef, setHighlightedRef] = useState<string | undefined>(target?.ref);
  const [readingVisible, setReadingVisible] = useState(reading !== undefined);
  const tabsRef = useRef<Record<string, HTMLButtonElement | null>>({});
  const sheetRef = useRef<HTMLElement>(null);
  const previousDraftRef = useRef(draft);
  const readingContextRef = useRef({ hasTarget: false, onClarification: false });
  readingContextRef.current = { hasTarget: target !== undefined, onClarification: clarificationVisible };
  const sourceTabs: readonly SourceTab[] = clarificationVisible
    ? [...documentTabs, 'clarification']
    : documentTabs;
  const sourceFieldMap = useMemo(() => {
    const map = new Map<string, FieldId>();
    for (const field of state.fields) {
      for (const sourceRef of sourceRefsForField(field)) map.set(sourceRef, field.id);
    }
    return map;
  }, [state.fields]);
  const linkedRefs = useMemo(
    () => new Set([
      ...sourceFieldMap.keys(),
      ...Object.keys(DRAWING_FIELD_DEFAULTS),
      ...(target ? [target.ref] : []),
    ]),
    [sourceFieldMap, target?.ref],
  );

  useEffect(() => {
    if (draft && draft !== previousDraftRef.current && gaps.length > 0) {
      setActiveTab('clarification');
    }
    previousDraftRef.current = draft;
  }, [draft, gaps.length]);

  useEffect(() => {
    if (!clarificationVisible && activeTab === 'clarification') setActiveTab(firstTab);
  }, [activeTab, clarificationVisible, firstTab]);

  // A package opened under an open pane leaves the tab that was active behind.
  useEffect(() => {
    if (!sourceTabs.includes(activeTab)) setActiveTab(firstTab);
  }, [activeTab, firstTab, sourceTabs]);

  // The marker belongs to one read entry: it lights when that entry arrives and
  // clears 2 s later, whatever the reviewer is looking at. Keying the effect on
  // anything else (a provenance target, the clarification tab appearing) would
  // cancel the timeout and relight a read the agent finished long ago, so the
  // rest is read from a ref that render keeps current.
  useEffect(() => {
    if (!reading) {
      setReadingVisible(false);
      return;
    }
    setReadingVisible(true);
    const { hasTarget, onClarification } = readingContextRef.current;
    if (!hasTarget && !onClarification) {
      setActiveTab(reading.docId);
      setHighlightedRef(`${reading.docId}:${reading.sectionId}`);
    }
    const timeout = window.setTimeout(() => {
      setReadingVisible(false);
      setHighlightedRef(current => current === `${reading.docId}:${reading.sectionId}` ? undefined : current);
    }, 2_000);
    return () => window.clearTimeout(timeout);
  }, [reading?.key]);

  useEffect(() => {
    if (!target) return;
    const tab = tabFromRef(target.ref, knownTabs);
    if (!tab) return;
    setActiveTab(tab);
    setHighlightedRef(target.ref);
    const timeout = window.setTimeout(() => {
      setHighlightedRef(current => current === target.ref ? undefined : current);
    }, 2_000);
    return () => window.clearTimeout(timeout);
  }, [target?.fieldId, target?.ref]);

  // Scrolling waits for the tab switch to commit: until the panel is visible the
  // region has no box, so scrollIntoView would be a no-op (B1, scroll model).
  useEffect(() => {
    if (!target) return;
    document.getElementById(target.ref)?.scrollIntoView?.({ block: 'center' });
  }, [activeTab, target?.fieldId, target?.ref]);

  useEffect(() => {
    tabsRef.current[activeTab]?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
  }, [activeTab]);

  // Narrow: the pane is a modal sheet over the field list: focus moves in, Tab
  // stays inside, body scroll is locked, Escape closes and returns focus.
  useSheetDialog({ active: narrow && open, onClose, returnFocusRef, sheetRef });

  if (narrow && !open) return null;

  const close = () => {
    onClose?.();
    returnFocusRef?.current?.focus();
  };
  const focusFieldForSource = (sourceRef: string) => {
    const fieldId = target?.ref === sourceRef
      ? target.fieldId
      : sourceFieldMap.get(sourceRef) ?? DRAWING_FIELD_DEFAULTS[sourceRef];
    if (fieldId) onFocusField(fieldId);
  };
  const index = documentIndex().documents;
  const activeTitle = activeTab === 'clarification'
    ? 'Clarification'
    : index.find(document => document.id === activeTab)?.title ?? 'Source document';
  const readingSectionFor = (tab: SourceTab): string | undefined =>
    readingVisible && reading?.docId === tab ? reading.sectionId : undefined;

  const moveTab = (from: SourceTab, key: string) => {
    const index = sourceTabs.indexOf(from);
    const last = sourceTabs.length - 1;
    const next = key === 'ArrowRight' ? sourceTabs[index === last ? 0 : index + 1]
      : key === 'ArrowLeft' ? sourceTabs[index === 0 ? last : index - 1]
        : key === 'Home' ? sourceTabs[0]
          : key === 'End' ? sourceTabs[last]
            : undefined;
    return next;
  };

  const content = (
    <>
      {narrow && (
        <header className="source-pane__header">
          <h2 className="source-pane__title">{activeTitle}</h2>
          <Button variant="text" onClick={close}>
            <CrossIcon /> Close
          </Button>
        </header>
      )}
      <div aria-label="Source documents" className="source-pane__tabs" role="tablist">
        {sourceTabs.map(tab => (
          <button
            aria-controls={`source-panel-${tab}`}
            aria-selected={activeTab === tab}
            className={[
              'source-pane__tab',
              activeTab === tab && 'source-pane__tab--active',
            ].filter(Boolean).join(' ')}
            id={`source-tab-${tab}`}
            key={tab}
            onClick={() => setActiveTab(tab)}
            onKeyDown={event => {
              const next = moveTab(tab, event.key);
              if (!next) return;
              event.preventDefault();
              setActiveTab(next);
              tabsRef.current[next]?.focus();
            }}
            ref={element => { tabsRef.current[tab] = element; }}
            role="tab"
            tabIndex={activeTab === tab ? 0 : -1}
            type="button"
          >
            {/* Exports 07 and 13 put the unsent marker before the name. */}
            {tab === 'clarification' && draft && !sent && (
              <span aria-hidden="true" className="source-pane__draft-dot" />
            )}
            {TAB_LABELS[tab]}
            {readingVisible && reading?.docId === tab && (
              <span aria-label="reading" className="source-pane__reading" role="img" />
            )}
          </button>
        ))}
      </div>
      <div
        aria-labelledby="source-tab-email"
        className="source-pane__panel"
        hidden={activeTab !== 'email'}
        id="source-panel-email"
        role="tabpanel"
      >
        <EmailDoc
          highlightedRef={highlightedRef}
          linkedRefs={linkedRefs}
          onActivateRegion={focusFieldForSource}
          quiet={quiet}
          readingSectionId={readingSectionFor('email')}
        />
      </div>
      {clarificationVisible && (
        <div
          aria-labelledby="source-tab-clarification"
          className="source-pane__panel source-pane__panel--clarification"
          hidden={activeTab !== 'clarification'}
          id="source-panel-clarification"
          role="tabpanel"
        >
          <ClarificationEditor
            draft={draft}
            gaps={gaps}
            onFocusField={onFocusField}
            sent={sent}
          />
        </div>
      )}
      {documentTabs.includes('spec') && (
        <div
          aria-labelledby="source-tab-spec"
          className="source-pane__panel"
          hidden={activeTab !== 'spec'}
          id="source-panel-spec"
          role="tabpanel"
        >
          <SpecDoc
            highlightedRef={highlightedRef}
            linkedRefs={linkedRefs}
            onActivateRegion={focusFieldForSource}
            readingSectionId={readingSectionFor('spec')}
          />
        </div>
      )}
      {/* This panel does not scroll: the sheet carries its own scroll region
          around the drawing, so the toolbar and the caption keep the document
          lane while the drawing pans. The panel is the column that hands that
          region whatever height the toolbar and the caption leave. */}
      {documentTabs.includes('drawing') && (
        <div
          aria-labelledby="source-tab-drawing"
          className="source-pane__panel source-pane__panel--drawing"
          hidden={activeTab !== 'drawing'}
          id="source-panel-drawing"
          role="tabpanel"
        >
          <DrawingSheet
            highlightedRef={highlightedRef}
            onActivateRegion={focusFieldForSource}
            readingSectionId={readingSectionFor('drawing')}
          />
        </div>
      )}
      {narrow && target && (
        <footer className="source-pane__footer">
          <Button variant="text" onClick={() => onFocusField(target.fieldId)}>
            <ArrowLeftIcon /> Back to {fieldLabel(target.fieldId)}
          </Button>
        </footer>
      )}
    </>
  );

  if (narrow) {
    return (
      <aside
        aria-label={`${activeTitle}, source document`}
        aria-modal="true"
        className="source-pane source-pane--sheet"
        ref={sheetRef}
        role="dialog"
        tabIndex={-1}
      >
        {content}
      </aside>
    );
  }

  return <aside aria-label="Source document" className="source-pane">{content}</aside>;
}
