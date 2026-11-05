import { describe, expect, it, vi } from 'vitest';
import type { PullInfo, QaView, RepoView } from '../../../shared/types';
// The store (for qaKey) pulls in sounds, which need a browser.
vi.mock('../ui/sfx', () => ({ alarm: vi.fn(), audioUnlocked: () => false, chirp: vi.fn(), cue: vi.fn() }));
const { ceoTriage } = await import('./ceoTriage');

const pull = (number: number, state = 'OPEN') => ({ number, title: `PR ${number}`, state }) as PullInfo;
const repo = (id: string, floor: number, pulls: PullInfo[]) => ({ id, floor, pulls }) as unknown as RepoView;
const qa = (repoId: string, prNumber: number, status: QaView['status'], ceoLooking: boolean) => ({ repoId, prNumber, status, ceoLooking, round: 1 }) as unknown as QaView;
const key = (r: string, n: number) => `${r}#${n}`;

describe('ceoTriage', () => {
  it('is empty when the CEO is looking at nothing', () => {
    expect(ceoTriage([repo('a', 1, [pull(1)])], {})).toEqual([]);
    expect(ceoTriage([repo('a', 1, [pull(1)])], { [key('a', 1)]: qa('a', 1, 'needs-human', false) })).toEqual([]);
  });

  it('lists open PRs the CEO has a triage job for, by floor then PR number', () => {
    const repos = [repo('b', 2, [pull(7), pull(3)]), repo('a', 1, [pull(9)])];
    const q = {
      [key('b', 7)]: qa('b', 7, 'needs-human', true),
      [key('b', 3)]: qa('b', 3, 'needs-human', true),
      [key('a', 9)]: qa('a', 9, 'needs-human', true),
    };
    expect(ceoTriage(repos, q).map((r) => [r.repo.floor, r.pr.number])).toEqual([[1, 9], [2, 3], [2, 7]]);
  });

  it('skips PRs that are no longer open, or that QA has moved on from', () => {
    const repos = [repo('a', 1, [pull(1, 'MERGED'), pull(2), pull(3)])];
    const q = {
      [key('a', 1)]: qa('a', 1, 'needs-human', true),
      [key('a', 2)]: qa('a', 2, 'testing', true),
      [key('a', 3)]: qa('a', 3, 'needs-human', true),
    };
    expect(ceoTriage(repos, q).map((r) => r.pr.number)).toEqual([3]);
  });
});
