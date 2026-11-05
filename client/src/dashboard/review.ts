// The reviewer's queue (pure): every PR on the screen's floors grouped by where it stands in build → QA → merge.
// Testing (QA hasn't given a verdict yet), Failed / fixing (back with an agent, or the CEO is triaging it), Needs you,
// Passed (waiting on the merge gate) and Merged today. The "needs you" test is the one the role badges and the Kanban
// board use (qaCard.ts needsManager), so the counts agree.
import type { PullInfo, QaView, RepoView } from '../../../shared/types';
import { needsManager } from '../qaCard';
import { qaKey, type Agent } from '../store';

export type ReviewGroup = 'testing' | 'failed' | 'needs-you' | 'passed' | 'merged';

export const REVIEW_GROUPS: { group: ReviewGroup; title: string }[] = [
  { group: 'testing', title: 'Testing' },
  { group: 'failed', title: 'Failed / fixing' },
  { group: 'needs-you', title: 'Needs you' },
  { group: 'passed', title: 'Passed' },
  { group: 'merged', title: 'Merged today' },
];

export interface ReviewItem {
  repo: RepoView;
  pr: PullInfo;
  qa: QaView | undefined;
  group: ReviewGroup;
}

export interface ReviewSection {
  group: ReviewGroup;
  title: string;
  items: ReviewItem[];
}

/** The group an open PR is in, from its QA record (none: QA hasn't seen it yet). */
export function openGroup(qa: Pick<QaView, 'status' | 'ceoLooking'> | undefined): ReviewGroup {
  if (needsManager(qa)) return 'needs-you';
  switch (qa?.status) {
    case 'failed':
    case 'fixing':
    case 'needs-human': // the CEO is triaging it first
      return 'failed';
    case 'passed':
      return 'passed';
    default:
      return 'testing';
  }
}

/**
 * The queue of `repos` (the floors on screen), always the five groups in order. Open PRs sit by floor then number;
 * merged ones are today's (since local midnight before `now`), the newest first.
 */
export function reviewQueue(repos: RepoView[], qa: Record<string, QaView>, now: number = Date.now()): ReviewSection[] {
  const dayStart = new Date(now).setHours(0, 0, 0, 0);
  const sections: ReviewSection[] = REVIEW_GROUPS.map((g) => ({ ...g, items: [] }));
  const into = (group: ReviewGroup) => sections.find((s) => s.group === group)!.items;
  const merged: { item: ReviewItem; at: number }[] = [];
  for (const repo of [...repos].sort((a, b) => a.floor - b.floor)) {
    for (const pr of [...repo.pulls].sort((a, b) => a.number - b.number)) {
      const rec = qa[qaKey(repo.id, pr.number)];
      if (pr.state === 'OPEN') {
        const group = openGroup(rec);
        into(group).push({ repo, pr, qa: rec, group });
      } else if (pr.state === 'MERGED') {
        const at = pr.mergedAt ? Date.parse(pr.mergedAt) : NaN;
        if (Number.isFinite(at) && at >= dayStart && at <= now) merged.push({ item: { repo, pr, qa: rec, group: 'merged' }, at });
      }
    }
  }
  into('merged').push(...merged.sort((a, b) => b.at - a.at).map((m) => m.item));
  return sections;
}

/** How many PRs each group holds. */
export const reviewCounts = (sections: ReviewSection[]): Record<ReviewGroup, number> =>
  Object.fromEntries(sections.map((s) => [s.group, s.items.length])) as Record<ReviewGroup, number>;

/** The PR the route names, if it is in the queue. */
export function findReviewItem(sections: ReviewSection[], pr: number | null): ReviewItem | null {
  if (pr === null) return null;
  for (const s of sections) {
    const hit = s.items.find((i) => i.pr.number === pr);
    if (hit) return hit;
  }
  return null;
}

/**
 * Who wrote a PR and who tested it. The QA record names them; for a PR opened before QA saw it, the worker (not a
 * tester: while testing, an agent's prNumber is the PR under test) whose PR number or branch it is.
 */
export function reviewAgents(qa: Pick<QaView, 'devAgentId' | 'qaAgentId'> | undefined, pr: Pick<PullInfo, 'number' | 'headRefName'>, agents: Agent[]): { dev: Agent | null; qa: Agent | null } {
  const byId = (id: string | null | undefined) => (id ? (agents.find((a) => a.id === id) ?? null) : null);
  const authors = agents.filter((a) => a.role !== 'ceo' && a.task !== 'qa');
  const dev = byId(qa?.devAgentId) ?? authors.find((a) => a.prNumber === pr.number) ?? authors.find((a) => a.branch && a.branch === pr.headRefName) ?? null;
  return { dev, qa: byId(qa?.qaAgentId) };
}
