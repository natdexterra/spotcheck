import { useSyncExternalStore } from 'react';
import { getState, subscribe } from './state/store';

export function App() {
  const state = useSyncExternalStore(subscribe, getState);

  return (
    <main>
      <h1>Spotcheck</h1>
      <p>{state.confirmed ? 'Confirmed' : 'Review in progress'}</p>
    </main>
  );
}
