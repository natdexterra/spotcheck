import type { LogEntry } from '../state/session';
import type { FieldId } from '../state/types';

/** The clarification the estimator sent: when it went and which fields it asked about. */
export interface SentQuestion {
  at: number;
  covers: FieldId[];
}

const humanAction = (entry: LogEntry) =>
  entry.event.actor === 'human' ? entry.event.action : undefined;

/**
 * How a row was settled is not in the field: the reason for a dismissal and the
 * moment a question went out live in the log, so a row that shows either has to
 * read it back from there. Newest first, because a field can be reopened and
 * settled again.
 */
export function dismissReason(log: LogEntry[], fieldId: FieldId): string | undefined {
  for (let index = log.length - 1; index >= 0; index -= 1) {
    const action = humanAction(log[index]!);
    if (action?.type === 'dismiss' && action.field_id === fieldId) return action.reason;
  }
  return undefined;
}

export function lastSent(log: LogEntry[]): SentQuestion | undefined {
  for (let index = log.length - 1; index >= 0; index -= 1) {
    const entry = log[index]!;
    const action = humanAction(entry);
    if (action?.type === 'send') return { at: entry.at, covers: action.covers ?? [] };
  }
  return undefined;
}
