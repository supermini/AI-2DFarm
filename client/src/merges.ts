// Which PRs just merged and whose desk each burst goes over: pure, for the store (store.ts) and the 3D office.
import type { AgentView, PullInfo, QaView, RepoView } from '../../shared/types';

export interface MergeBurst {
  repoId: string;
  prNumber: number;
  /** The agent whose desk gets the burst; null sends it over the floor's Kanban board. */
  agentId: string | null;
}

type Author = Pick<AgentView, 'id' | 'name' | 'role' | 'repoId'>;

/** PRs that were open before this repo update and are merged in it. */
export function newlyMerged(before: PullInfo[] | undefined, after: PullInfo[]): PullInfo[] {
  const wasOpen = new Set(before?.filter((p) => p.state === 'OPEN').map((p) => p.number));
  return after.filter((p) => p.state === 'MERGED' && wasOpen.has(p.number));
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

/**
 * Who wrote a merged PR: the QA record's author if they're still on the floor, else the agent whose name
 * matches the head branch (`swarm/issue-<n>-<name>`, any case), else nobody.
 */
export function mergeAuthor(repoId: string, pr: Pick<PullInfo, 'headRefName'>, qa: QaView | undefined, agents: Author[]): string | null {
  const team = agents.filter((a) => a.repoId === repoId && a.role !== 'ceo');
  if (qa?.devAgentId && team.some((a) => a.id === qa.devAgentId)) return qa.devAgentId;
  const m = /^swarm\/issue-\d+-(.+)$/i.exec(pr.headRefName);
  if (!m) return null;
  const name = slug(m[1]);
  return team.find((a) => slug(a.name) === name)?.id ?? null;
}

/**
 * The bursts for one `repo` event. `live` is false until the first snapshot, so page loads and
 * reconnects (which arrive as snapshots) never replay old merges.
 */
export function mergeBursts(live: boolean, before: RepoView | undefined, after: RepoView, qaFor: (prNumber: number) => QaView | undefined, agents: Author[]): MergeBurst[] {
  if (!live) return [];
  return newlyMerged(before?.pulls, after.pulls).map((p) => ({ repoId: after.id, prNumber: p.number, agentId: mergeAuthor(after.id, p, qaFor(p.number), agents) }));
}
