import { useSyncExternalStore } from 'react';
import { getSnapshot, subscribe } from '../replay/controller';

export const useReplay = () => useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
