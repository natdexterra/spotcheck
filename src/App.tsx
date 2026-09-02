import { useEffect, useRef, useState } from 'react';
import { Button } from './components/Button';
import { ChangeLogDrawer } from './components/ChangeLogDrawer';
import { ConfirmFooter } from './components/ConfirmFooter';
import { ConfirmSummary } from './components/ConfirmSummary';
import { FieldList } from './components/FieldList';
import { Header } from './components/Header';
import { announce, LiveRegion } from './components/LiveRegion';
import { OpenPackageDialog, type OpenPackageFields } from './components/OpenPackageDialog';
import { SourcePane, type SourceTarget } from './components/SourcePane';
import { StatusStrip } from './components/StatusStrip';
import { samplePackage, setPackage } from './data/package';
import { saveUserPackage, restoreSamplePackage } from './data/package-storage';
import { buildPackage } from './data/user-package';
import { useKeyboardMap } from './hooks/useKeyboardMap';
import { useNarrowLayout } from './hooks/useNarrowLayout';
import { usePackage } from './hooks/usePackage';
import { useReplay } from './hooks/useReplay';
import { useReview } from './hooks/useReview';
import { clearReview, leave } from './replay/controller';
import { createInitialState } from './state/session';
import { replaceState } from './state/store';
import type { FocusRequest } from './components/FieldList';
import type { FieldId } from './state/types';

const VISIT_ONLY = 'Package opened for this visit only: the browser has no room to keep it';

export function App() {
  const { confirmed, draft, gaps, log } = useReview();
  const pkg = usePackage();
  const replay = useReplay();
  const narrow = useNarrowLayout();
  const [sourceOpen, setSourceOpen] = useState(false);
  const [sourceTarget, setSourceTarget] = useState<SourceTarget>();
  const [focusRequest, setFocusRequest] = useState<FocusRequest>();
  const [packageDialogOpen, setPackageDialogOpen] = useState(false);
  const [notice, setNotice] = useState<string>();
  const sourceReturnRef = useRef<HTMLElement | null>(null);
  useKeyboardMap();

  useEffect(() => () => { void leave(); }, []);
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
  // The injection line belongs to the sample, so the flag that hides it does too.
  const bundled = pkg === samplePackage;
  const quiet = bundled && typeof location !== 'undefined' && new URLSearchParams(location.search).get('quiet') === '1';
  const apiAvailable = typeof document.modelContext?.registerTool === 'function';
  const live = log.length > 0 || replay.active;
  // The way into a package of your own stands in one place at a time: the strip
  // before a session starts, the expanded log once it has, and the log alone on
  // a one-column browser with no agent, whose first load stays light.
  const inStrip = !live && !confirmed && !(narrow && !apiAvailable);
  const openDialog = () => setPackageDialogOpen(true);

  const openPackage = async (fields: OpenPackageFields) => {
    setPackageDialogOpen(false);
    // One replay owner: a replay attached to the page lets go before the
    // package under it changes.
    if (replay.active) await leave();
    clearReview();
    const opened = buildPackage(fields);
    setPackage(opened);
    replaceState(createInitialState());
    const kept = saveUserPackage(opened);
    setNotice(kept ? undefined : VISIT_ONLY);
    announce(kept ? `Package opened: ${fields.reference}` : VISIT_ONLY);
  };

  const openSample = async () => {
    setPackageDialogOpen(false);
    if (replay.active) await leave();
    clearReview();
    restoreSamplePackage();
    replaceState(createInitialState());
    setNotice(undefined);
    announce(`Package opened: ${samplePackage.reference ?? 'the sample'}`);
  };

  return (
    <div className="app-shell">
      <Header />
      <StatusStrip notice={notice} onOpenPackage={openDialog} />
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
      <ChangeLogDrawer onOpenPackage={inStrip ? undefined : openDialog} />
      <OpenPackageDialog
        onCancel={() => setPackageDialogOpen(false)}
        onOpenPackage={fields => void openPackage(fields)}
        onUseSample={bundled ? undefined : () => void openSample()}
        open={packageDialogOpen}
        sampleReference={samplePackage.reference ?? ''}
        sessionInProgress={log.length > 0}
      />
      <LiveRegion />
    </div>
  );
}
