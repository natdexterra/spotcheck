import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useNarrowLayout } from '../hooks/useNarrowLayout';
import { useReplay } from '../hooks/useReplay';
import { OpposingArrowsIcon } from '../icons';
import { plural } from '../lib/format';
import { next, pause, play, restart } from '../replay/controller';
import { describeStep } from '../replay/describe';
import { Button } from './Button';
import { announce } from './LiveRegion';

/**
 * The replay serves one purpose: a person without an agent watches the recorded
 * session at a human pace, stops to look, tries an action and starts again. The
 * row says where the recording is and offers only the controls that state has.
 */
export function ReplayControls() {
  const replay = useReplay();
  const narrow = useNarrowLayout();
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

  const running = !replay.ended && !replay.error;
  // "Sample session" narrows to "Sample": the lane below 1024 has no room for
  // the recording date either, so the short line keeps the step count instead.
  const short = replay.label.split(' ')[0];
  const counter = <span className="numeric">{replay.position} of {replay.total}</span>;

  return (
    <div className="replay-controls" role="group" aria-label="Replay controls">
      <div className="replay-controls__text">
        {replay.error ? (
          <span className="session-error"><OpposingArrowsIcon />stopped at step {replay.position + 1}: {replay.error}</span>
        ) : replay.ended ? (
          <span>{narrow ? `${short} · finished` : <>{replay.label} · finished · <span className="numeric">{plural(replay.total, 'step', 'steps')}</span></>}</span>
        ) : (
          <span>
            {narrow
              ? <>{short} · {counter}</>
              : <>{replay.label} · recorded <span className="numeric">{replay.recordedAt.slice(0, 10)}</span> · step {counter}</>}
          </span>
        )}
        {running && !replay.playing && replay.next ? (
          <span className="replay-controls__next">next: {describeStep(replay.next)}</span>
        ) : null}
      </div>
      <div className="replay-controls__actions">
        {running && (
          <Button ref={toggle} variant="secondary" onClick={replay.playing ? pause : play}>
            {replay.playing ? 'Pause' : 'Play'}
          </Button>
        )}
        {running && !replay.playing && (
          <Button variant="text" disabled={replay.busy} onClick={() => void next()}>Next step</Button>
        )}
        {!replay.playing && (
          <Button ref={restartButton} variant="text" disabled={replay.busy} onClick={() => { restart(); setRestartFocus(value => value + 1); }}>
            Restart
          </Button>
        )}
      </div>
    </div>
  );
}
