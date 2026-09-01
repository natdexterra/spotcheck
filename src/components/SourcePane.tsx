import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from 'react';
import { documentIndex } from '../data/package';
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

const DOCUMENT_TABS: readonly SourceTab[] = ['email', 'spec', 'drawing'];
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

const tabFromRef = (sourceRef: string | undefined): SourceTab | undefined => {
  const prefix = sourceRef?.split(':', 1)[0];
  return DOCUMENT_TABS.find(tab => tab === prefix);
};

const sourceRefsForField = (field: Field): string[] => [
  ...(field.proposal?.source_refs ?? []),
  ...(field.candidates?.flatMap(candidate => candidate.source_refs) ?? []),
  ...(field.suggestion?.source_refs ?? []),
];

const lastReadingTarget = (log: ReturnType<typeof useReview>['log']): ReadingTarget | undefined => {
  for (let index = log.length - 1; index >= 0; index -= 1) {
    const entry = log[index];
    if (!entry) continue;
    const action = entry?.event.action;
    if (action?.type !== 'read' || action.operation !== 'section') continue;
    const input = action.input;
    if (typeof input !== 'object' || input === null) continue;
    const docId = 'doc_id' in input && typeof input.doc_id === 'string' ? tabFromRef(`${input.doc_id}:`) : undefined;
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
  const sent = session.sent;
  const clarificationVisible = sent !== undefined || (draft !== undefined && gaps.length > 0);
  const reading = useMemo(() => lastReadingTarget(log), [log]);
  const initialTab = tabFromRef(target?.ref) ?? (clarificationVisible ? 'clarification' : reading?.docId ?? 'email');
  const [activeTab, setActiveTab] = useState<SourceTab>(initialTab);
  const [highlightedRef, setHighlightedRef] = useState<string | undefined>(target?.ref);
  const [readingVisible, setReadingVisible] = useState(reading !== undefined);
  const tabsRef = useRef<Record<string, HTMLButtonElement | null>>({});
  const sheetRef = useRef<HTMLElement>(null);
  const previousDraftRef = useRef(draft);
  const sourceTabs: readonly SourceTab[] = clarificationVisible
    ? [...DOCUMENT_TABS, 'clarification']
    : DOCUMENT_TABS;
  const sourceFieldMap = useMemo(() => {
    const map = new Map<string, FieldId>();
    for (const field of state.fields) {
      for (const sourceRef of sourceRefsForField(field)) map.set(sourceRef, field.id);
    }
    return map;
  }, [state.fields]);

  useEffect(() => {
    if (draft && draft !== previousDraftRef.current && gaps.length > 0) {
      setActiveTab('clarification');
    }
    previousDraftRef.current = draft;
  }, [draft, gaps.length]);

  useEffect(() => {
    if (!clarificationVisible && activeTab === 'clarification') setActiveTab('email');
  }, [activeTab, clarificationVisible]);

  useEffect(() => {
    if (!reading) return;
    setReadingVisible(true);
    if (!target && !clarificationVisible) {
      setActiveTab(reading.docId);
      setHighlightedRef(`${reading.docId}:${reading.sectionId}`);
    }
    const timeout = window.setTimeout(() => {
      setReadingVisible(false);
      setHighlightedRef(current => current === `${reading.docId}:${reading.sectionId}` ? undefined : current);
    }, 2_000);
    return () => window.clearTimeout(timeout);
  }, [clarificationVisible, reading?.key, target?.ref]);

  useEffect(() => {
    if (!target) return;
    const tab = tabFromRef(target.ref);
    if (!tab) return;
    setActiveTab(tab);
    setHighlightedRef(target.ref);
    const timeout = window.setTimeout(() => {
      setHighlightedRef(current => current === target.ref ? undefined : current);
    }, 2_000);
    return () => window.clearTimeout(timeout);
  }, [target?.fieldId, target?.ref]);

  // Scrolling waits for the tab switch to commit: until the panel is visible the
  // region has no box, so scrollIntoView would be a no-op (B1 — scroll model).
  useEffect(() => {
    if (!target) return;
    document.getElementById(target.ref)?.scrollIntoView?.({ block: 'center' });
  }, [activeTab, target?.fieldId, target?.ref]);

  useEffect(() => {
    tabsRef.current[activeTab]?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
  }, [activeTab]);

  // Narrow: the pane is a modal sheet over the field list — focus moves in, Tab
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

  const content = (
    <>
      <header className="source-pane__header">
        <h2 className="source-pane__title">{activeTitle}</h2>
        {narrow && (
          <Button variant="text" onClick={close}>
            <CrossIcon /> Close
          </Button>
        )}
      </header>
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
            ref={element => { tabsRef.current[tab] = element; }}
            role="tab"
            type="button"
          >
            {TAB_LABELS[tab]}
            {readingVisible && reading?.docId === tab && (
              <span aria-label="reading" className="source-pane__reading" role="img" />
            )}
            {tab === 'clarification' && draft && !sent && (
              <span aria-hidden="true" className="source-pane__draft-dot" />
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
      <div
        aria-labelledby="source-tab-spec"
        className="source-pane__panel"
        hidden={activeTab !== 'spec'}
        id="source-panel-spec"
        role="tabpanel"
      >
        <SpecDoc
          highlightedRef={highlightedRef}
          onActivateRegion={focusFieldForSource}
          readingSectionId={readingSectionFor('spec')}
        />
      </div>
      <div
        aria-labelledby="source-tab-drawing"
        className="source-pane__panel"
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
