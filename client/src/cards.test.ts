import { describe, expect, it } from 'vitest';
import type { QaStatus, QaView } from '../../shared/types';
import { bodyExcerpt, canPeel, cardLabel, findCard } from './cards';
import type { KanbanCard, KanbanColumns } from './store';

const board = (over: Partial<KanbanColumns> = {}): KanbanColumns => ({ backlog: [], progress: [], qa: [], ready: [], merged: [], ...over });
const issueCard = (n: number): KanbanCard => ({ key: `i-${n}`, number: n, title: `Issue ${n}` });
const qaRec = (n: number, status: QaStatus): QaView => ({
  repoId: 'o/r',
  prNumber: n,
  status,
  round: 1,
  devAgentId: 'ada',
  qaAgentId: 'marple',
  summary: null,
  checks: [],
  commentUrl: null,
  mergeNote: null,
  ceoLooking: false,
  updatedAt: 0,
});
const prCard = (n: number, status?: QaStatus, ghost = false): KanbanCard => ({ key: `pr-${n}`, number: n, prNumber: n, title: `PR ${n}`, qa: status ? qaRec(n, status) : undefined, ghost });

describe('which stickies come off the board', () => {
  it.each([
    ['backlog', issueCard(1), true],
    ['progress', issueCard(1), false],
    ['qa', prCard(9), true],
    ['qa', prCard(9, 'needs-human'), true],
    ['qa', prCard(9, 'queued'), false],
    ['qa', prCard(9, 'failed'), false],
    ['qa', prCard(9, 'testing', true), false],
    ['ready', prCard(9, 'passed'), false],
    ['merged', prCard(9), false],
  ] as const)('%s %j', (col, card, ok) => {
    expect(canPeel(col, card)).toBe(ok);
  });
});

describe('cardLabel', () => {
  it('reads "#12" for an issue and "PR #7" for a PR', () => {
    expect(cardLabel({ number: 12 })).toBe('#12');
    expect(cardLabel({ number: 7, pr: true })).toBe('PR #7');
    expect(cardLabel({ number: 7, prNumber: 7 })).toBe('PR #7');
  });
});

describe('findCard', () => {
  it('finds the card by key, or the same issue or PR wherever it went', () => {
    const cols = board({ progress: [{ key: 'a-ada', number: 12, title: 'x' }], qa: [prCard(12)] });
    expect(findCard(cols, 'i-12', 12, false)).toMatchObject({ col: 'progress', index: 0, card: { key: 'a-ada' } });
    expect(findCard(cols, 'pr-12', 12, true)).toMatchObject({ col: 'qa', index: 0 });
    expect(findCard(cols, 'm-12', 12, true)).toMatchObject({ col: 'qa' });
    expect(findCard(cols, 'i-13', 13, false)).toBeNull();
  });

  it('prefers the key over a number match in an earlier column, and reports the index', () => {
    const cols = board({ backlog: [issueCard(12)], qa: [issueCard(3), prCard(12)] });
    expect(findCard(cols, 'pr-12', 12, true)).toMatchObject({ col: 'qa', index: 1, card: { key: 'pr-12' } });
    expect(findCard(cols, 'gone', 12, false)).toMatchObject({ col: 'backlog', index: 0 });
  });

  it('finds nothing on an empty board', () => {
    expect(findCard(board(), 'i-1', 1, false)).toBeNull();
  });
});

describe('bodyExcerpt', () => {
  it('shows the first lines of a body', () => {
    expect(bodyExcerpt('One\n\nTwo\nThree', 2)).toEqual({ text: 'One\n\nTwo', more: true });
    expect(bodyExcerpt('One\nTwo', 8)).toEqual({ text: 'One\nTwo', more: false });
    expect(bodyExcerpt('x'.repeat(20), 8, 10)).toEqual({ text: `${'x'.repeat(10)}…`, more: true });
    expect(bodyExcerpt('')).toEqual({ text: '', more: false });
  });
});
