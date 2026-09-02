import { useSyncExternalStore } from 'react';
import { getPackage, subscribePackage } from '../data/package';

/** The package the page currently holds: the bundled sample, or the one a person opened. */
export const usePackage = () => useSyncExternalStore(subscribePackage, getPackage, getPackage);
