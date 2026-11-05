// The CEO panel's triage list (pure): open PRs stuck in QA that the CEO is looking at before the manager hears.
import type { PullInfo, QaView, RepoView } from '../../../shared/types';
import { qaKey } from '../store';

export interface TriageRow {
  repo: RepoView;
  pr: PullInfo;
  qa: QaView;
}

/** Open PRs whose QA is `needs-human` with the CEO's triage job queued or running, by floor then PR number. */
export function ceoTriage(repos: RepoView[], qa: Record<string, QaView>): TriageRow[] {
  const rows: TriageRow[] = [];
  for (const repo of repos) {
    for (const pr of repo.pulls) {
      const q = qa[qaKey(repo.id, pr.number)];
      if (pr.state === 'OPEN' && q && q.status === 'needs-human' && q.ceoLooking) rows.push({ repo, pr, qa: q });
    }
  }
  return rows.sort((a, b) => a.repo.floor - b.repo.floor || a.pr.number - b.pr.number);
}
