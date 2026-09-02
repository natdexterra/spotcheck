import { useCallback, useEffect, useRef, useState } from 'react';
import { useReview } from '../hooks/useReview';
import { fieldLabel } from '../lib/format';
import type { LogEntry } from '../state/session';
import type { FieldId } from '../state/types';

const BATCH_DELAY = 3_000;
// How long one message stays in the region before the next one replaces it.
// Fifty milliseconds was below the dwell every screen reader needs to speak it.
const QUEUE_DELAY = 1_000;

export const announce = (message: string) => document.dispatchEvent(new CustomEvent('session-announcement', { detail: message }));

const inputOf = (entry: LogEntry): Record<string, unknown> => {
  if (entry.event.actor !== 'agent') return {};
  const input = entry.event.action.input;
  return typeof input === 'object' && input !== null && !Array.isArray(input) ? input as Record<string, unknown> : {};
};

const lowerFieldName = (id: unknown) => typeof id === 'string' ? fieldLabel(id as FieldId).toLowerCase() : 'field';

const humanAnnouncement = (entry: LogEntry) => {
  const action = entry.event.action;
  const name = lowerFieldName('field_id' in action ? action.field_id : undefined);
  if (action.type === 'verify') return `${name}: verified`;
  if (action.type === 'edit') return `${name}: edited`;
  if (action.type === 'edit_start') return `${name}: editing started`;
  if (action.type === 'enter') return `${name}: entered`;
  if (action.type === 'pick') return `${name}: picked`;
  if (action.type === 'dismiss') return `${name}: marked not required`;
  if (action.type === 'apply') return `${name}: agent suggestion applied`;
  if (action.type === 'dismiss_suggestion') return `${name}: agent suggestion dismissed`;
  if (action.type === 'ask_customer') return `${name}: customer question selected`;
  if (action.type === 'send') return `Clarification sent for ${action.covers?.length ?? 0} fields`;
  if (action.type === 'reopen') return `${name}: reopened`;
  return 'Quote request confirmed';
};

export const LiveRegion = () => {
  const { gaps, log } = useReview();
  const [announcement, setAnnouncement] = useState('');
  const seen = useRef(log.length);
  const draftAvailable = gaps.length > 0;
  const priorDraftAvailable = useRef(draftAvailable);
  const queue = useRef<string[]>([]);
  const queueTimer = useRef<ReturnType<typeof setTimeout>>();
  const proposalTimer = useRef<ReturnType<typeof setTimeout>>();
  const proposalCount = useRef(0);

  const pumpQueue = useCallback(() => {
    if (queueTimer.current || queue.current.length === 0) return;
    setAnnouncement(queue.current.shift()!);
    queueTimer.current = setTimeout(() => {
      setAnnouncement('');
      queueTimer.current = undefined;
      pumpQueue();
    }, QUEUE_DELAY);
  }, []);

  const enqueue = useCallback((message: string) => {
    queue.current.push(message);
    pumpQueue();
  }, [pumpQueue]);

  useEffect(() => {
    const onAnnouncement = (event: Event) => enqueue((event as CustomEvent<string>).detail);
    document.addEventListener('session-announcement', onAnnouncement);
    return () => document.removeEventListener('session-announcement', onAnnouncement);
  }, [enqueue]);

  const batchProposal = useCallback(() => {
    proposalCount.current += 1;
    if (proposalTimer.current) return;
    proposalTimer.current = setTimeout(() => {
      const count = proposalCount.current;
      proposalCount.current = 0;
      proposalTimer.current = undefined;
      enqueue(`${count} ${count === 1 ? 'field' : 'fields'} proposed`);
    }, BATCH_DELAY);
  }, [enqueue]);

  useEffect(() => {
    for (const entry of log.slice(seen.current)) {
      const action = entry.event.action;
      if (action.type === 'read') continue;
      if (entry.actor === 'estimator') {
        enqueue(humanAnnouncement(entry));
        continue;
      }

      const input = inputOf(entry);
      const name = lowerFieldName(input.field_id);
      if (action.type === 'propose' && entry.result?.ok === true) batchProposal();
      if (action.type === 'report_conflict' && entry.result?.ok === true) enqueue(`${name}: conflict reported by the agent`);
      if (action.type === 'report_missing' && entry.result?.ok === true) enqueue(`${name}: reported missing`);
      if (action.type === 'draft' && entry.result?.ok === true) {
        const covers = Array.isArray(entry.result.covers) ? entry.result.covers.length : 0;
        enqueue(`Clarification draft ready for ${covers} ${covers === 1 ? 'field' : 'fields'}`);
      }
      if (action.type === 'propose' && entry.result?.suggestion_recorded === true) {
        enqueue(`${name}: agent proposal rejected; suggestion available`);
      }
    }
    seen.current = log.length;
  }, [batchProposal, enqueue, log]);

  useEffect(() => {
    if (priorDraftAvailable.current === draftAvailable) return;
    enqueue(draftAvailable ? 'draft_clarification available, 7 tools' : 'draft_clarification unavailable, 6 tools');
    priorDraftAvailable.current = draftAvailable;
  }, [draftAvailable, enqueue]);

  useEffect(() => () => {
    if (queueTimer.current) clearTimeout(queueTimer.current);
    if (proposalTimer.current) clearTimeout(proposalTimer.current);
  }, []);

  return <div aria-atomic="true" aria-live="polite" className="live-region visually-hidden">{announcement}</div>;
};
