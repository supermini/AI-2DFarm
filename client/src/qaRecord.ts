// QA records that just left, kept for the merge: the server drops a PR's QA record (qaRemoved) just before it sends
// the repo update that shows the merge, so the store keeps the last few here to still know the author.

import type { QaView } from '../../shared/types';

const recentQa = new Map<string, QaView>();
const RECENT_KEEP = 30;

export function rememberQa(key: string, q: QaView) {
  recentQa.delete(key);
  recentQa.set(key, q);
  if (recentQa.size > RECENT_KEEP) recentQa.delete(recentQa.keys().next().value!);
}

export const recentQaRecord = (key: string) => recentQa.get(key);
