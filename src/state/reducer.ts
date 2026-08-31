import type { AppState, DispatchedEvent } from './types';
import { reviewSession } from './session';
import type { ReviewSession } from './session';
import { transitionHuman } from './human-transitions';
import { transitionAgent } from './agent-transitions';

export function reduce(state: AppState, event: DispatchedEvent): AppState & Partial<ReviewSession> {
  if (state.confirmed && !(event.actor === 'agent' && event.action.type === 'read')) return state;
  const agent = event.actor === 'agent' ? transitionAgent(state, event.action) : undefined;
  const next = event.actor === 'human' ? transitionHuman(state, event.action) : agent!.state;
  const result = agent?.result;
  return { ...reviewSession(next),
    ...(event.actor === 'agent' && event.action.type !== 'read' && reviewSession(state).startedAt === undefined
      ? { startedAt: event.action.at ?? 0 } : {}),
    log: [...reviewSession(state).log, {
    actor: event.actor === 'human' ? 'estimator' : 'agent',
    at: 'at' in event.action ? event.action.at ?? 0 : 0,
    event: structuredClone(event),
    ...(result ? { result } : {}),
    ...(agent?.notes ? { notes: agent.notes } : {}),
    ...(next.confirmed && !state.confirmed ? { notes: state.fields.filter(f => f.suggestion).map(f => `Auto-dismissed suggestion: ${f.id}`) } : {}),
    ...(event.actor === 'human' && event.action.type === 'send' && next !== state && reviewSession(state).draft && reviewSession(next).sent
      ? { diff: { before: reviewSession(state).draft!, after: reviewSession(next).sent! } } : {}),
  }] };
}
