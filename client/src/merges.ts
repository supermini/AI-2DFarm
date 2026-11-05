// Which PRs just merged: pure, for the store's merge chime (store.ts).
import type { PullInfo } from '../../shared/types';

/** PRs that were open before this repo update and are merged in it. */
export function newlyMerged(before: PullInfo[] | undefined, after: PullInfo[]): PullInfo[] {
  const wasOpen = new Set(before?.filter((p) => p.state === 'OPEN').map((p) => p.number));
  return after.filter((p) => p.state === 'MERGED' && wasOpen.has(p.number));
}
