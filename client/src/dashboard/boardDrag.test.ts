import { describe, expect, it } from 'vitest';
import type { QaStatus, QaView } from '../../../shared/types';
import type { Agent, KanbanCard, KanbanColumns } from '../store';
import { dropAction, type DropAction } from './dnd';
import { dropHint, handOutKeys, menuMove, onHand, pickHint, runDrop, type DropIo } from './boardDrag';

const agent = (over: Partial<Agent> = {}): Agent =>
  ({ id: 'ada', name: 'Ada', repoId: 'acme/app', role: 'agent', task: null, desk: 0, status: 'idle', issueNumber: null, issueTitle: null, branch: null, prNumber: null, ...over }) as Agent;

const issueCard = (n: number): KanbanCard => ({ key: `i-${n}`, number: n, title: `Issue ${n}` });

const qaRec = (n: number, status: QaStatus): QaView => ({
  repoId: 'acme/app', prNumber: n, status, round: 1, devAgentId: 'dev', qaAgentId: 'tester', summary: null, checks: [], commentUrl: null, mergeNote: null, ceoLooking: false, updatedAt: 0,
});

const prCard = (n: number, status?: QaStatus): KanbanCard => ({ key: `pr-${n}`, number: n, prNumber: n, title: `PR ${n}`, qa: status ? qaRec(n, status) : undefined });

/** Records what the flow did; `start` answers the dependency question. */
function fakeIo({ start = true } = {}) {
  const calls: unknown[][] = [];
  const io: DropIo = {
    assign: async (...a) => void calls.push(['assign', ...a]),
    sendToQa: async (...a) => void calls.push(['qa', ...a]),
    askBlocked: async (...a) => (calls.push(['askBlocked', ...a]), start),
    refuse: (...a) => void calls.push(['refuse', ...a]),
  };
  return { io, calls };
}

const run = async (action: DropAction, card: KanbanCard, opts?: { start?: boolean }) => {
  const { io, calls } = fakeIo(opts);
  await runDrop(action, card, agent(), io);
  return calls;
};

describe('runDrop', () => {
  it('assigns straight away', async () => {
    expect(await run({ kind: 'assign', agentId: 'ada', issue: 3 }, issueCard(3))).toEqual([['assign', 'ada', 3, false]]);
  });

  it('sends a PR to QA with the agent', async () => {
    expect(await run({ kind: 'qa', agentId: 'ada', pr: 7 }, prCard(7))).toEqual([['qa', 7, 'ada']]);
  });

  it('asks about blockers, and "start now" assigns without waitForDeps', async () => {
    expect(await run({ kind: 'blocked', waits: [1, 2] }, issueCard(3))).toEqual([
      ['askBlocked', 3, [1, 2], 'Ada'],
      ['assign', 'ada', 3, false],
    ]);
  });

  it('"wait" assigns with waitForDeps, so the office refuses while the blockers are open', async () => {
    expect(await run({ kind: 'blocked', waits: [1] }, issueCard(3), { start: false })).toEqual([
      ['askBlocked', 3, [1], 'Ada'],
      ['assign', 'ada', 3, true],
    ]);
  });

  it('tells the manager a busy agent cannot take it, and calls nothing: the office would refuse', async () => {
    expect(await run({ kind: 'busy', agentId: 'ada', doing: 'working on #9' }, issueCard(3))).toEqual([['refuse', '#3', 'Ada', 'busy, working on #9']]);
    expect(await run({ kind: 'busy', agentId: 'ada', doing: 'testing PR #2' }, prCard(7))).toEqual([['refuse', 'PR #7', 'Ada', 'busy, testing PR #2']]);
  });

  it('says why it refused', async () => {
    expect(await run({ kind: 'none', reason: 'being tested' }, prCard(7))).toEqual([['refuse', 'PR #7', 'Ada', 'being tested']]);
  });
});

describe('handOutKeys', () => {
  const cols = (over: Partial<KanbanColumns>): KanbanColumns => ({ backlog: [], progress: [], qa: [], ready: [], merged: [], ...over });

  it('is assignChoices plus the Ready column', () => {
    const keys = handOutKeys(cols({ backlog: [issueCard(1)], qa: [prCard(2), prCard(3, 'needs-human'), prCard(4, 'testing')], ready: [prCard(5, 'passed')], merged: [prCard(6)], progress: [issueCard(7)] }));
    expect([...keys].sort()).toEqual(['i-1', 'pr-2', 'pr-3', 'pr-5']);
  });

  it('matches dropAction: a free agent can take exactly these cards', () => {
    const board = cols({
      backlog: [issueCard(1)],
      progress: [issueCard(7)],
      qa: (['queued', 'testing', 'failed', 'fixing', 'needs-human'] as const).map((s, i) => prCard(10 + i, s)).concat(prCard(20)),
      ready: [prCard(30, 'passed')],
      merged: [prCard(40)],
    });
    const keys = handOutKeys(board);
    for (const col of ['backlog', 'progress', 'qa', 'ready', 'merged'] as const) {
      for (const card of board[col]) {
        const kind = dropAction(card, col, agent(), { repoId: 'acme/app', issues: [] }).kind;
        expect([card.key, kind !== 'none']).toEqual([card.key, keys.has(card.key)]);
      }
    }
  });
});

describe('hints', () => {
  it('dropHint: go, ask or no', () => {
    expect(dropHint({ kind: 'assign', agentId: 'a', issue: 1 })).toBe('go');
    expect(dropHint({ kind: 'qa', agentId: 'a', pr: 1 })).toBe('go');
    expect(dropHint({ kind: 'blocked', waits: [1] })).toBe('ask');
    expect(dropHint({ kind: 'busy', agentId: 'a', doing: 'busy' })).toBe('no');
    expect(dropHint({ kind: 'none', reason: 'merged' })).toBe('no');
  });

  it('pickHint says what picking them leads to', () => {
    expect(pickHint({ kind: 'assign', agentId: 'a', issue: 1 })).toBe('free');
    expect(pickHint({ kind: 'qa', agentId: 'a', pr: 1 })).toBe('free, to test');
    expect(pickHint({ kind: 'blocked', waits: [1, 2] })).toBe('free · waits for #1, #2');
    expect(pickHint({ kind: 'busy', agentId: 'a', doing: 'working on #9' })).toBe('busy · working on #9');
    expect(pickHint({ kind: 'none', reason: 'waiting for sign-in' })).toBe('waiting for sign-in');
  });
});

describe('onHand', () => {
  it('names the PR while testing or fixing, else the issue, else nothing', () => {
    expect(onHand(agent({ task: 'qa', prNumber: 7, issueNumber: 3 }))).toBe('PR #7');
    expect(onHand(agent({ task: 'fix', prNumber: 7 }))).toBe('PR #7');
    expect(onHand(agent({ task: 'issue', issueNumber: 3 }))).toBe('#3');
    expect(onHand(agent({ task: 'issue', issueNumber: 3, prNumber: 7 }))).toBe('PR #7');
    expect(onHand(agent())).toBe('');
  });
});

describe('menuMove', () => {
  const on = [false, true, false, true];

  it('steps over disabled items and wraps', () => {
    expect(menuMove('ArrowDown', 1, on)).toBe(3);
    expect(menuMove('ArrowDown', 3, on)).toBe(1);
    expect(menuMove('ArrowUp', 1, on)).toBe(3);
  });

  it('Home and End go to the first and last enabled', () => {
    expect(menuMove('Home', 3, on)).toBe(1);
    expect(menuMove('End', 1, on)).toBe(3);
  });

  it('stays put on other keys, or with nothing enabled returns -1', () => {
    expect(menuMove('a', 1, on)).toBe(1);
    expect(menuMove('ArrowDown', 0, [false, false])).toBe(-1);
  });
});
