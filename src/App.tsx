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
import type { FocusRequest } from './components/FieldList';
import type { FieldId } from './state/types';

export function App() {
  const { confirmed, draft, gaps } = useReview();
  const narrow = useNarrowLayout();
  const [sourceOpen, setSourceOpen] = useState(false);
  const [sourceTarget, setSourceTarget] = useState<SourceTarget>();
  const [focusRequest, setFocusRequest] = useState<FocusRequest>();
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
  // The field list owns the move: a row that has collapsed into the verified
  // group has to be expanded before it can take focus (WCAG 2.4.3).
  const focusField = (fieldId: FieldId) => {
    setSourceOpen(false);
    setFocusRequest(previous => ({ fieldId, nonce: (previous?.nonce ?? 0) + 1 }));
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
            <FieldList focusRequest={focusRequest} onSource={openSource} />
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
