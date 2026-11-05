import { describe, expect, it } from 'vitest';
import type { IssueInfo, QaStatus, QaView } from '../../../shared/types';
import type { Agent, KanbanCard, KanbanColumns } from '../store';
import { dropAction, type DropAction, type DropContext } from './dnd';

// ---------- builders ----------

const agent = (over: Partial<Agent> = {}): Agent =>
  ({ id: 'ada', name: 'Ada', repoId: 'acme/app', role: 'agent', task: null, desk: 0, status: 'idle', issueNumber: null, issueTitle: null, branch: null, prNumber: null, ...over }) as Agent;

const issueCard = (n: number): KanbanCard => ({ key: `i-${n}`, number: n, title: `Issue ${n}` });

const qaRec = (n: number, status: QaStatus): QaView => ({
  repoId: 'acme/app', prNumber: n, status, round: 1, devAgentId: 'dev', qaAgentId: 'tester', summary: null, checks: [], commentUrl: null, mergeNote: null, ceoLooking: false, updatedAt: 0,
});

const prCard = (n: number, status?: QaStatus): KanbanCard => ({ key: `pr-${n}`, number: n, prNumber: n, title: `PR ${n}`, qa: status ? qaRec(n, status) : undefined });

const ctx = (issues: Pick<IssueInfo, 'number' | 'body'>[] = []): DropContext => ({ repoId: 'acme/app', issues });

const FREE = ['idle', 'done', 'error', 'stopped'] as const;
const BUSY = ['preparing', 'working'] as const;
const STATUSES = [...FREE, ...BUSY] as const;

// ---------- none: cards and agents that can't take part ----------

describe('none', () => {
  it('refuses a merged card on anyone', () => {
    for (const status of STATUSES) {
      expect(dropAction(prCard(5, 'passed'), 'merged', agent({ status }), ctx())).toEqual({ kind: 'none', reason: 'merged' });
    }
  });

  it('refuses a card already being built', () => {
    expect(dropAction(issueCard(3), 'progress', agent(), ctx())).toEqual({ kind: 'none', reason: 'in progress' });
  });

  it('refuses the CEO, whatever the card', () => {
    const ceo = agent({ role: 'ceo', repoId: 'acme/app' });
    expect(dropAction(issueCard(3), 'backlog', ceo, ctx())).toEqual({ kind: 'none', reason: 'the CEO' });
    expect(dropAction(prCard(5), 'qa', ceo, ctx())).toEqual({ kind: 'none', reason: 'the CEO' });
  });

  it('refuses an agent on another floor', () => {
    const other = agent({ repoId: 'other/floor' });
    expect(dropAction(issueCard(3), 'backlog', other, ctx())).toEqual({ kind: 'none', reason: 'another floor' });
  });

  it('refuses a cloud agent waiting for sign-in', () => {
    const waiting = agent({ host: 'box', needsSignIn: true });
    expect(dropAction(issueCard(3), 'backlog', waiting, ctx())).toEqual({ kind: 'none', reason: 'waiting for sign-in' });
    // a stale flag on a local agent doesn't matter (the 3D floor list's rule)
    expect(dropAction(issueCard(3), 'backlog', agent({ host: 'local', needsSignIn: true }), ctx())).toEqual({ kind: 'assign', agentId: 'ada', issue: 3 });
  });
});

// ---------- backlog issues ----------

describe('backlog issues', () => {
  it('assigns an open, unblocked issue to a free agent', () => {
    for (const status of FREE) {
      expect(dropAction(issueCard(3), 'backlog', agent({ status }), ctx())).toEqual({ kind: 'assign', agentId: 'ada', issue: 3 });
    }
  });

  it('asks first when the agent is busy', () => {
    const working = agent({ status: 'working', task: 'issue', issueNumber: 12 });
    expect(dropAction(issueCard(3), 'backlog', working, ctx())).toEqual({ kind: 'busy', agentId: 'ada', doing: 'working on #12' });
    const preparing = agent({ status: 'preparing', task: 'issue', issueNumber: 12 });
    expect(dropAction(issueCard(3), 'backlog', preparing, ctx())).toEqual({ kind: 'busy', agentId: 'ada', doing: 'working on #12' });
  });

  it('says what a busy agent is doing, as the 3D desk does', () => {
    expect(dropAction(issueCard(3), 'backlog', agent({ status: 'working', task: 'qa', issueNumber: null, prNumber: 7 }), ctx())).toMatchObject({ kind: 'busy', doing: 'testing PR #7' });
    expect(dropAction(issueCard(3), 'backlog', agent({ status: 'working', task: 'fix', issueNumber: null, prNumber: 7 }), ctx())).toMatchObject({ kind: 'busy', doing: 'fixing PR #7' });
    expect(dropAction(issueCard(3), 'backlog', agent({ status: 'working', task: null, issueNumber: null, prNumber: null }), ctx())).toMatchObject({ kind: 'busy', doing: 'busy' });
  });

  it('blocks an issue that still waits on open ones', () => {
    const issues = [{ number: 1, body: '' }, { number: 2, body: 'Depends on #1' }, { number: 3, body: 'Blocked by #1 and #2' }];
    expect(dropAction(issueCard(2), 'backlog', agent(), ctx(issues))).toEqual({ kind: 'blocked', waits: [1] });
    expect(dropAction(issueCard(3), 'backlog', agent(), ctx(issues))).toEqual({ kind: 'blocked', waits: [1, 2] });
  });

  it('assigns once every blocker is closed', () => {
    const issues = [{ number: 2, body: 'Depends on #1' }]; // #1 is gone
    expect(dropAction(issueCard(2), 'backlog', agent(), ctx(issues))).toEqual({ kind: 'assign', agentId: 'ada', issue: 2 });
  });

  it('says busy before it looks at the dependencies', () => {
    const issues = [{ number: 1, body: '' }, { number: 2, body: 'Depends on #1' }];
    const busy = agent({ status: 'working', task: 'issue', issueNumber: 9 });
    expect(dropAction(issueCard(2), 'backlog', busy, ctx(issues))).toEqual({ kind: 'busy', agentId: 'ada', doing: 'working on #9' });
  });
});

// ---------- PRs to test ----------

describe('PRs', () => {
  it('sends a testable QA PR to a free agent', () => {
    for (const status of FREE) {
      expect(dropAction(prCard(5), 'qa', agent({ status }), ctx())).toEqual({ kind: 'qa', agentId: 'ada', pr: 5 });
      expect(dropAction(prCard(5, 'queued'), 'qa', agent({ status }), ctx())).toEqual({ kind: 'qa', agentId: 'ada', pr: 5 });
      expect(dropAction(prCard(5, 'needs-human'), 'qa', agent({ status }), ctx())).toEqual({ kind: 'qa', agentId: 'ada', pr: 5 });
    }
  });

  it('asks first when the agent is busy', () => {
    for (const status of BUSY) {
      expect(dropAction(prCard(5), 'qa', agent({ status }), ctx())).toEqual({ kind: 'busy', agentId: 'ada', doing: 'busy' });
    }
  });

  it('refuses a PR already being tested, fixed, or failed', () => {
    expect(dropAction(prCard(5, 'testing'), 'qa', agent(), ctx())).toEqual({ kind: 'none', reason: 'being tested' });
    expect(dropAction(prCard(5, 'fixing'), 'qa', agent(), ctx())).toEqual({ kind: 'none', reason: 'being fixed' });
    expect(dropAction(prCard(5, 'failed'), 'qa', agent(), ctx())).toEqual({ kind: 'none', reason: 'failed QA' });
  });

  it('sends a Ready (passed) PR for another round', () => {
    for (const status of FREE) {
      expect(dropAction(prCard(5, 'passed'), 'ready', agent({ status }), ctx())).toEqual({ kind: 'qa', agentId: 'ada', pr: 5 });
    }
    for (const status of BUSY) {
      expect(dropAction(prCard(5, 'passed'), 'ready', agent({ status }), ctx())).toEqual({ kind: 'busy', agentId: 'ada', doing: 'busy' });
    }
  });
});

// ---------- the whole matrix ----------

describe('every column × agent status', () => {
  const card = (column: keyof KanbanColumns): KanbanCard => {
    if (column === 'backlog' || column === 'progress') return issueCard(3);
    if (column === 'ready' || column === 'merged') return prCard(5, 'passed');
    return prCard(5); // qa: untested, so it's testable
  };
  const expected = (column: keyof KanbanColumns, status: Agent['status']): DropAction['kind'] => {
    if (column === 'merged' || column === 'progress') return 'none';
    return status === 'preparing' || status === 'working' ? 'busy' : column === 'backlog' ? 'assign' : 'qa';
  };

  it.each(STATUSES.flatMap((status) => (['backlog', 'progress', 'qa', 'ready', 'merged'] as const).map((column) => [column, status] as const)))('%s on a %s agent', (column, status) => {
    expect(dropAction(card(column), column, agent({ status }), ctx()).kind).toBe(expected(column, status));
  });
});
