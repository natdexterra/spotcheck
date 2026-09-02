import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useReplay } from '../hooks/useReplay';
import { OpposingArrowsIcon } from '../icons';
import { next, pause, play, restart } from '../replay/controller';
import { describeStep } from '../replay/describe';
import { Button } from './Button';
import { announce } from './LiveRegion';

export function ReplayControls() {
  const replay = useReplay();
  const toggle = useRef<HTMLButtonElement>(null);
  const restartButton = useRef<HTMLButtonElement>(null);
  const focused = useRef(replay.focusRequest);
  const [restartFocus, setRestartFocus] = useState(0);
  useEffect(() => { if (replay.error) announce(`Replay stopped at step ${replay.position + 1}: ${replay.error}`); }, [replay.error, replay.position]);
  useLayoutEffect(() => { if (restartFocus) toggle.current?.focus(); }, [restartFocus]);
  // A focus request from outside the row lands after this render committed, so
  // the buttons it asks for exist. Ended and errored rows have Restart only.
  useLayoutEffect(() => {
    if (focused.current === replay.focusRequest) return;
    focused.current = replay.focusRequest;
    (toggle.current ?? restartButton.current)?.focus();
  }, [replay.focusRequest]);
  if (!replay.active) return null;
  return (
    <div className="replay-controls" role="group" aria-label="Replay controls">
      <div className="replay-controls__text">
        <span>{replay.label} · recorded <span className="numeric">{replay.recordedAt.slice(0, 10)}</span> · <span className="numeric">{replay.position} / {replay.total}</span></span>
        {replay.error ? <span className="session-error"><OpposingArrowsIcon />stopped at step {replay.position + 1}: {replay.error}</span>
          : <span className="replay-controls__next">{replay.ended ? 'finished' : replay.next ? `next: ${describeStep(replay.next)}` : ''}</span>}
      </div>
      <div className="replay-controls__actions">
        {!replay.ended && !replay.error && <>
          <Button ref={toggle} variant="secondary" onClick={replay.playing ? pause : play}>{replay.playing ? 'Pause' : 'Play'}</Button>
          <Button variant="text" disabled={replay.busy} onClick={() => void next()}>Next call</Button>
        </>}
        <Button ref={restartButton} variant="text" disabled={replay.busy} onClick={() => { restart(); setRestartFocus(value => value + 1); }}>Restart</Button>
      </div>
    </div>
  );
}
