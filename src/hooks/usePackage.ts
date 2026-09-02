import { useSyncExternalStore } from 'react';
import { getPackage, samplePackage, subscribePackage } from '../data/package';

/** The package the page currently holds: the bundled sample, or the one a person opened. */
export const usePackage = () => useSyncExternalStore(subscribePackage, getPackage, getPackage);

/**
 * The one label for the way into a package of your own. The strip carries it
 * before a session starts and the expanded change log once one has, and neither
 * may disagree with the other about which package the page is holding.
 */
export const useOpenPackageLabel = (): string =>
  usePackage() === samplePackage ? 'Open your own package' : 'Open another package';
