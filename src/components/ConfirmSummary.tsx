import type { ReactNode } from 'react';
import { useReview } from '../hooks/useReview';
import { displayValue, duration, fieldLabel, groupLabel } from '../lib/format';
import { dismissReason } from '../lib/log';
import { createInitialState } from '../state/session';
import { replaceState } from '../state/store';
import type { Field, FieldId, ResolutionKind } from '../state/types';
import { Button } from './Button';
import { LogLine } from './ChangeLogDrawer';
import { useReplay } from '../hooks/useReplay';
import { leave } from '../replay/controller';
import { ExportSessionButton } from './ExportSessionButton';

export interface ConfirmSummaryProps {
  logContent?: ReactNode;
}

const RESOLUTIONS: readonly ResolutionKind[] = [
  'verified',
  'edited',
  'entered',
  'picked',
  'dismissed',
  'applied',
  'asked_customer',
];

const fieldList = (fields: Field[]): string => fields.map(field => fieldLabel(field.id)).join(' · ');

export function ConfirmSummary({ logContent }: ConfirmSummaryProps) {
  const { confirmed, log, state, timer } = useReview();
  const replay = useReplay();
  if (!confirmed) return null;

  const fieldsByResolution = (kind: ResolutionKind) =>
    state.fields.filter(field => field.resolution?.kind === kind);
  const openQuestions = fieldsByResolution('asked_customer');
  const edits = fieldsByResolution('edited');
  const picks = fieldsByResolution('picked');
  const dismissals = fieldsByResolution('dismissed');
  const independentlyAgreed = log.reduce(
    (count, entry) => count + (entry.notes?.filter(note => note === 'agent independently agrees').length ?? 0),
    0,
  );
  const autoDismissed = log.flatMap(entry => entry.notes ?? [])
    .filter(note => note.startsWith('Auto-dismissed suggestion: '))
    .map(note => fieldLabel(note.slice('Auto-dismissed suggestion: '.length) as FieldId));

  return (
    <section className="confirm-summary" aria-labelledby="confirm-summary-title">
      <header className="confirm-summary__header">
        <h2 id="confirm-summary-title">
          {openQuestions.length > 0
            ? `Confirmed with ${openQuestions.length} open ${openQuestions.length === 1 ? 'question' : 'questions'}`
            : 'Confirmed'}
        </h2>
        {replay.active || timer !== null ? (
          <p className="confirm-summary__timer">
            {replay.active
              ? <>Recorded review <span className="numeric">{duration(replay.recordedMs)}</span>{replay.finishedByViewer ? <> · this run <span className="numeric">{duration(timer ?? 0)}</span></> : null}</>
              : <>Reviewed in <span className="numeric">{duration(timer!)}</span> · from the agent’s first write to confirm</>}
          </p>
        ) : null}
      </header>

      <div aria-label="Resolution counts" className="confirm-summary__counts" role="group">
        {RESOLUTIONS.map(kind => {
          const count = fieldsByResolution(kind).length;
          return count > 0 ? <span className="confirm-summary__count" key={kind}>{count} {groupLabel(kind).toLowerCase()}</span> : null;
        })}
      </div>

      {independentlyAgreed > 0 ? (
        <p className="confirm-summary__agreement">
          agent independently agreed on {independentlyAgreed} {independentlyAgreed === 1 ? 'field' : 'fields'}
        </p>
      ) : null}

      <div className="confirm-summary__details">
        {edits.length > 0 ? (
          <section className="confirm-summary__section" aria-labelledby="confirm-edits-title">
            <h3 className="confirm-summary__caption" id="confirm-edits-title">Edits</h3>
            <ul>
              {edits.map(field => (
                <li className="confirm-summary__line" key={field.id}>
                  {fieldLabel(field.id)} · agent “{displayValue(field.proposal?.value ?? null, field.proposal?.unit)}” → yours “{displayValue(field.value, field.unit)}”
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {picks.length > 0 ? (
          <section className="confirm-summary__section" aria-labelledby="confirm-picks-title">
            <h3 className="confirm-summary__caption" id="confirm-picks-title">Picks</h3>
            <ul>
              {picks.map(field => {
                const losing = field.candidates?.filter(candidate =>
                  candidate.value !== field.value || candidate.unit !== field.unit,
                ) ?? [];
                return (
                  <li className="confirm-summary__line" key={field.id}>
                    {fieldLabel(field.id)} · picked {displayValue(field.value, field.unit)}
                    {losing.length > 0 ? ` · losing ${losing.length === 1 ? 'candidate' : 'candidates'} ${losing.map(candidate => displayValue(candidate.value, candidate.unit)).join(', ')}` : null}
                  </li>
                );
              })}
            </ul>
          </section>
        ) : null}

        {dismissals.length > 0 ? (
          <section className="confirm-summary__section" aria-labelledby="confirm-dismissals-title">
            <h3 className="confirm-summary__caption" id="confirm-dismissals-title">Not required</h3>
            <ul>
              {dismissals.map(field => (
                <li className="confirm-summary__line" key={field.id}>{fieldLabel(field.id)} · {dismissReason(log, field.id) ?? 'No reason recorded'}</li>
              ))}
            </ul>
          </section>
        ) : null}

        {openQuestions.length > 0 ? (
          <section className="confirm-summary__section" aria-labelledby="confirm-pending-title">
            <h3 className="confirm-summary__caption" id="confirm-pending-title">Pending customer answer</h3>
            <p className="confirm-summary__line">{fieldList(openQuestions)}</p>
          </section>
        ) : null}

        {autoDismissed.length > 0 ? (
          <section className="confirm-summary__section" aria-labelledby="confirm-suggestions-title">
            <h3 className="confirm-summary__caption" id="confirm-suggestions-title">Suggestions auto-dismissed at confirm</h3>
            <p className="confirm-summary__line">{autoDismissed.join(' · ')}</p>
          </section>
        ) : null}
      </div>

      <section className="confirm-summary__log" aria-labelledby="confirm-log-title">
        <h3 className="confirm-summary__caption" id="confirm-log-title">Full change log</h3>
        {logContent ?? (
          <ol className="confirm-summary__log-entries">
            {log.map((entry, index) => (
              <li key={`${entry.at}-${index}`}><LogLine entry={entry} fields={state.fields} /></li>
            ))}
          </ol>
        )}
      </section>

      <div className="confirm-summary__actions">
        <ExportSessionButton />
        <Button variant="text" onClick={() => { if (replay.active) void leave(); else replaceState(createInitialState()); }}>Start over</Button>
      </div>
    </section>
  );
}
