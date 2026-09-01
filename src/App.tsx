import { useEffect, useRef, useState } from 'react';
import { Button } from './components/Button';
import { ChangeLogDrawer } from './components/ChangeLogDrawer';
import { ConfirmFooter } from './components/ConfirmFooter';
import { ConfirmSummary } from './components/ConfirmSummary';
import { FieldList } from './components/FieldList';
import { Header } from './components/Header';
import { LiveRegion } from './components/LiveRegion';
import { SourcePane, type SourceTarget } from './components/SourcePane';
import { StatusStrip } from './components/StatusStrip';
import { useKeyboardMap } from './hooks/useKeyboardMap';
import { useNarrowLayout } from './hooks/useNarrowLayout';
import { useReview } from './hooks/useReview';
import { createReplay } from './replay/replay';
import type { FieldId } from './state/types';

export function App() {
  const { confirmed, draft, gaps } = useReview();
  const narrow = useNarrowLayout();
  const [sourceOpen, setSourceOpen] = useState(false);
  const [sourceTarget, setSourceTarget] = useState<SourceTarget>();
  const sourceReturnRef = useRef<HTMLElement | null>(null);
  const replayRef = useRef<ReturnType<typeof createReplay>>();
  useKeyboardMap();

  useEffect(() => () => replayRef.current?.dispose(), []);

  const playSample = () => {
    replayRef.current?.dispose();
    replayRef.current = createReplay();
    replayRef.current.play();
  };
  const openSource = (ref: string, fieldId: FieldId) => {
    sourceReturnRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setSourceTarget({ ref, fieldId });
    setSourceOpen(true);
  };
  const focusField = (fieldId: FieldId) => {
    setSourceOpen(false);
    const row = document.querySelector<HTMLElement>(`[data-field-id="${fieldId}"]`);
    row?.scrollIntoView?.({ block: 'center' });
    (row?.querySelector<HTMLElement>('[data-field-badge]') ?? row)?.focus();
  };
  const quiet = typeof location !== 'undefined' && new URLSearchParams(location.search).get('quiet') === '1';

  return (
    <div className="app-shell">
      <Header />
      <StatusStrip onPlaySample={playSample} />
      {confirmed ? (
        <main className="summary-main">
          <ConfirmSummary />
        </main>
      ) : (
        <main className="workspace">
          <section className="field-pane" aria-label="Quote request review">
            {narrow && draft && gaps.length > 0 ? (
              <div className="field-pane__draft-entry">
                <span>Clarification draft · {draft.covers.length} fields</span>
                <Button variant="text" onClick={() => { setSourceTarget(undefined); setSourceOpen(true); }}>Open</Button>
              </div>
            ) : null}
            <FieldList onSource={openSource} />
            <ConfirmFooter />
          </section>
          {!narrow ? <SourcePane onFocusField={focusField} quiet={quiet} target={sourceTarget} /> : null}
          {narrow && sourceOpen ? (
            <SourcePane
              narrow
              onClose={() => setSourceOpen(false)}
              onFocusField={focusField}
              open
              quiet={quiet}
              returnFocusRef={sourceReturnRef}
              target={sourceTarget}
            />
          ) : null}
        </main>
      )}
      <ChangeLogDrawer />
      <LiveRegion />
    </div>
  );
}
