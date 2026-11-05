import { describe, expect, it, vi } from 'vitest';
import type { PullInfo, QaStatus, QaView, RepoView } from '../../../shared/types';

// The store (for qaKey) pulls in sounds, which need a browser.
vi.mock('../ui/sfx', () => ({ alarm: vi.fn(), audioUnlocked: () => false, chirp: vi.fn(), cue: vi.fn() }));
const { qaKey } = await import('../store');
const { findReviewItem, reviewAgents, reviewCounts, reviewQueue } = await import('./review');
type ReviewGroup = import('./review').ReviewGroup;

const NOW = new Date('2026-05-10T15:00:00').getTime();
const TODAY = new Date('2026-05-10T09:30:00').toISOString();
const YESTERDAY = new Date('2026-05-09T23:30:00').toISOString();

const pull = (number: number, over: Partial<PullInfo> = {}): PullInfo => ({
  number,
  title: `PR ${number}`,
  url: `https://example.test/pull/${number}`,
  headRefName: `branch-${number}`,
  state: 'OPEN',
  isDraft: false,
  mergeable: 'MERGEABLE',
  reviewDecision: null,
  closesIssues: [],
  createdAt: TODAY,
  mergedAt: null,
  additions: 1,
  deletions: 1,
  checks: 'passing',
  headSha: 'abc',
  mergeState: 'CLEAN',
  failedChecks: [],
  pendingChecks: [],
  ...over,
});
const repo = (floor: number, pulls: PullInfo[]) => ({ id: `o/r${floor}`, floor, fullName: `o/r${floor}`, pulls }) as unknown as RepoView;
const rec = (r: RepoView, n: number, status: QaStatus, over: Partial<QaView> = {}): [string, QaView] => [
  qaKey(r.id, n),
  { repoId: r.id, prNumber: n, status, round: 1, devAgentId: null, qaAgentId: null, summary: null, checks: [], commentUrl: null, mergeNote: null, ceoLooking: false, updatedAt: 1, ...over },
];

/** Group -> PR numbers. */
const shape = (sections: ReturnType<typeof reviewQueue>) => Object.fromEntries(sections.map((s) => [s.group, s.items.map((i) => i.pr.number)]));

describe('reviewQueue', () => {
  it('always has the five groups, in order, even when empty', () => {
    const s = reviewQueue([], {}, NOW);
    expect(s.map((x) => x.group)).toEqual<ReviewGroup[]>(['testing', 'failed', 'needs-you', 'passed', 'merged']);
    expect(s.every((x) => x.items.length === 0)).toBe(true);
  });

  it('groups open PRs by their QA state', () => {
    const r = repo(1, [pull(1), pull(2), pull(3), pull(4), pull(5), pull(6), pull(7)]);
    const qa = Object.fromEntries([rec(r, 2, 'queued'), rec(r, 3, 'testing'), rec(r, 4, 'failed'), rec(r, 5, 'fixing'), rec(r, 6, 'needs-human'), rec(r, 7, 'passed')]);
    expect(shape(reviewQueue([r], qa, NOW))).toEqual({ testing: [1, 2, 3], failed: [4, 5], 'needs-you': [6], passed: [7], merged: [] });
  });

  it('a PR QA has not seen yet, or a draft, is testing (waiting)', () => {
    const r = repo(1, [pull(1, { isDraft: true })]);
    expect(shape(reviewQueue([r], {}, NOW)).testing).toEqual([1]);
  });

  it('a needs-human PR the CEO is triaging is not yet "needs you"', () => {
    const r = repo(1, [pull(1), pull(2)]);
    const qa = Object.fromEntries([rec(r, 1, 'needs-human', { ceoLooking: true }), rec(r, 2, 'needs-human')]);
    expect(shape(reviewQueue([r], qa, NOW))).toMatchObject({ failed: [1], 'needs-you': [2] });
  });

  it('merged shows only PRs merged since local midnight, newest first', () => {
    const r = repo(1, [
      pull(1, { state: 'MERGED', mergedAt: new Date('2026-05-10T08:00:00').toISOString() }),
      pull(2, { state: 'MERGED', mergedAt: YESTERDAY }),
      pull(3, { state: 'MERGED', mergedAt: new Date('2026-05-10T11:00:00').toISOString() }),
      pull(4, { state: 'MERGED', mergedAt: null }),
      pull(5, { state: 'CLOSED' }),
    ]);
    expect(shape(reviewQueue([r], {}, NOW))).toEqual({ testing: [], failed: [], 'needs-you': [], passed: [], merged: [3, 1] });
  });

  it('keeps floors apart: floor order, then PR number', () => {
    const a = repo(2, [pull(9), pull(4)]);
    const b = repo(1, [pull(7)]);
    const [testing] = reviewQueue([a, b], {}, NOW);
    expect(testing.items.map((i) => [i.repo.floor, i.pr.number])).toEqual([
      [1, 7],
      [2, 4],
      [2, 9],
    ]);
  });

  it('carries each PR with its repo and QA record', () => {
    const r = repo(1, [pull(1)]);
    const qa = Object.fromEntries([rec(r, 1, 'testing')]);
    const [item] = reviewQueue([r], qa, NOW)[0].items;
    expect(item.repo).toBe(r);
    expect(item.qa?.status).toBe('testing');
  });

  it('moves a PR between groups as its QA record changes', () => {
    const r = repo(1, [pull(1)]);
    const at = (status: QaStatus) => shape(reviewQueue([r], Object.fromEntries([rec(r, 1, status)]), NOW));
    expect(at('testing').testing).toEqual([1]);
    expect(at('passed').passed).toEqual([1]);
    const merged = repo(1, [pull(1, { state: 'MERGED', mergedAt: TODAY })]);
    expect(shape(reviewQueue([merged], Object.fromEntries([rec(merged, 1, 'passed')]), NOW)).merged).toEqual([1]);
  });
});

describe('reviewCounts / findReviewItem', () => {
  const r = repo(1, [pull(1), pull(2)]);
  const qa = Object.fromEntries([rec(r, 2, 'passed')]);
  const sections = reviewQueue([r], qa, NOW);

  it('counts each group', () => {
    expect(reviewCounts(sections)).toEqual({ testing: 1, failed: 0, 'needs-you': 0, passed: 1, merged: 0 });
  });

  it('finds a PR by number (and floor), or nothing', () => {
    expect(findReviewItem(sections, 2)?.group).toBe('passed');
    expect(findReviewItem(sections, 99)).toBeNull();
    expect(findReviewItem(sections, null)).toBeNull();
  });
});

describe('reviewAgents', () => {
  const agent = (id: string, over: Record<string, unknown> = {}) => ({ id, name: id.toUpperCase(), role: 'worker', task: 'issue', prNumber: null, branch: null, ...over });
  const r = repo(1, [pull(5, { headRefName: 'fix-5' })]);

  it('names the author and the QA agent from the QA record', () => {
    const [, q] = rec(r, 5, 'testing', { devAgentId: 'a', qaAgentId: 'b' });
    expect(reviewAgents(q, r.pulls[0], [agent('a'), agent('b')] as never)).toMatchObject({ dev: { id: 'a' }, qa: { id: 'b' } });
  });

  it('falls back to the worker who has the PR, by number then by branch, never to a tester', () => {
    const pr = r.pulls[0];
    expect(reviewAgents(undefined, pr, [agent('x', { prNumber: 5 }), agent('t', { prNumber: 5, task: 'qa' })] as never).dev?.id).toBe('x');
    expect(reviewAgents(undefined, pr, [agent('y', { branch: 'fix-5' })] as never).dev?.id).toBe('y');
    expect(reviewAgents(undefined, pr, [agent('t', { prNumber: 5, task: 'qa' })] as never)).toEqual({ dev: null, qa: null });
  });
});
