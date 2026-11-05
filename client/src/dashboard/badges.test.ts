import { describe, expect, it, vi } from 'vitest';
import type { AgentView, DoctorFinding, HireRequestView, OpsAlarm, PhoneMessage, PullInfo, QaView, RepoView } from '../../../shared/types';

// The store (for unreadMessages) pulls in sounds, which need a browser.
vi.mock('../ui/sfx', () => ({ alarm: vi.fn(), audioUnlocked: () => false, chirp: vi.fn(), cue: vi.fn() }));
const { approvalsBadge, waitingOnYou } = await import('../pocket/pocketData');
const { unreadMessages } = await import('../store');
const { roleBadges } = await import('./badges');

const pull = (number: number): PullInfo => ({ number, title: `PR ${number}`, state: 'OPEN', checks: 'passing' }) as PullInfo;
const repo = (id: string, floor: number, pulls: PullInfo[], autoMerge = false) => ({ id, floor, pulls, autoMerge }) as unknown as RepoView;
const qa = (repoId: string, prNumber: number, status: QaView['status'], ceoLooking = false) => ({ repoId, prNumber, status, ceoLooking, updatedAt: prNumber }) as unknown as QaView;
const key = (r: string, n: number) => `${r}#${n}`;
const msg = (at: number, extra: Partial<PhoneMessage> = {}) => ({ from: 'ceo', at, text: 'hi', ...extra }) as PhoneMessage;
const agent = (id: string, status: AgentView['status']) => ({ id, status }) as unknown as Omit<AgentView, 'log'>;
const none = { repos: [], qa: {}, requests: [] as HireRequestView[], messages: [] as PhoneMessage[], readAt: 0, agents: {}, alarms: [] as OpsAlarm[], doctor: [] as DoctorFinding[] };

describe('roleBadges', () => {
  it('is empty for an idle office', () => {
    expect(roleBadges(none)).toEqual({ ceo: 0, dev: 0, review: 0, metrics: 0, settings: 0 });
  });

  it('CEO: the approvals badge (hire requests, PRs stuck on you) plus unread CEO messages, as pocket mode counts them', () => {
    const repos = [repo('r', 1, [pull(1), pull(2)])];
    const q = { [key('r', 1)]: qa('r', 1, 'needs-human'), [key('r', 2)]: qa('r', 2, 'needs-human', true) };
    const requests = [{ id: 'q', status: 'pending' }, { id: 'p', status: 'approved' }] as unknown as HireRequestView[];
    const messages = [msg(5), msg(20), msg(30, { requestId: 'q' }), msg(40, { from: 'me' as PhoneMessage['from'] })];
    const input = { ...none, repos, qa: q, requests, messages, readAt: 10 };
    const expected = approvalsBadge(waitingOnYou(repos, q, requests)) + unreadMessages(messages, 10);
    expect(expected).toBe(3);
    expect(roleBadges(input).ceo).toBe(expected);
  });

  it('Developer: agents in error', () => {
    const agents = { a: agent('a', 'error'), b: agent('b', 'working'), c: agent('c', 'error'), d: agent('d', 'idle') };
    expect(roleBadges({ ...none, agents }).dev).toBe(2);
  });

  it('Reviewer: open PRs that need you plus passed ones waiting for you to merge', () => {
    const repos = [repo('r', 1, [pull(1), pull(2), pull(3), pull(4)]), repo('auto', 2, [pull(1)], true)];
    const q = {
      [key('r', 1)]: qa('r', 1, 'needs-human'),
      [key('r', 2)]: qa('r', 2, 'passed'),
      [key('r', 3)]: qa('r', 3, 'needs-human', true), // the CEO is looking: not yours yet
      [key('r', 4)]: qa('r', 4, 'testing'),
      [key('auto', 1)]: qa('auto', 1, 'passed'), // merges on its own
    };
    expect(roleBadges({ ...none, repos, qa: q }).review).toBe(2);
  });

  it('Metrics: ops alarms plus the doctor\'s findings, like the console tab', () => {
    const alarms = [{ id: 'a' }, { id: 'b' }] as OpsAlarm[];
    const doctor = [{ id: 'd' }] as DoctorFinding[];
    expect(roleBadges({ ...none, alarms, doctor }).metrics).toBe(3);
  });
});
