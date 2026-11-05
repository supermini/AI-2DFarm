// The 2D dashboard's drag-and-drop decision, pure: what dropping a Kanban card onto an agent should do. The developer
// panel (dashboard/KanbanBoard.tsx) calls dropAction and runs the result — api.assign, api.sendToQa, or a confirm
// dialog — so a drag does exactly what the manager's console would. Nothing here touches React or the DOM, and it never
// imports world/, so the 2D dashboard keeps its own module graph (issue #5's guard). The rules match the 3D desk
// (world/whiteboard.ts dropTarget) and the pocket's assignChoices rather than inventing new ones.

import { blockers } from '../../../shared/issues';
import type { IssueInfo } from '../../../shared/types';
import { assignChoices } from '../pocket/pocketData';
import type { Agent, KanbanCard, KanbanColumns } from '../store';

/** What dropAction needs besides the card and the agent: whose board it is, and that repo's open issues. */
export interface DropContext {
  /** The board's repo id; an agent on another repo is "on another floor". */
  repoId: string;
  /** The repo's open issues, for "Depends on #N" / "Blocked by #N" blockers (shared/issues.ts). */
  issues: readonly Pick<IssueInfo, 'number' | 'body'>[];
}

/**
 * The decision, as the developer panel acts on it. assign: api.assign. qa: api.sendToQa(repo, pr, agentId).
 * confirm-busy: the agent is busy, ask first (as the 3D desk's warning does). blocked: the issue still waits on open
 * ones, so the UI offers "wait for deps" (waitForDeps) or "start now". none: the card or agent can't take part.
 */
export type DropAction =
  | { kind: 'assign'; agentId: string; issue: number }
  | { kind: 'qa'; agentId: string; pr: number }
  /** `waits`: a backlog issue's open blockers, so after "yes" the UI still asks the dependency question. */
  | { kind: 'confirm-busy'; agentId: string; doing: string; waits?: number[] }
  | { kind: 'blocked'; waits: number[] }
  | { kind: 'none'; reason: string };

/** A short description of what a busy agent is on, as the 3D desk's warning says: "testing PR #7", "working on #12". */
function doing(a: Pick<Agent, 'task' | 'issueNumber' | 'prNumber'>): string {
  if (a.task === 'qa' && a.prNumber != null) return `testing PR #${a.prNumber}`;
  if (a.task === 'fix' && a.prNumber != null) return `fixing PR #${a.prNumber}`;
  return a.issueNumber != null ? `working on #${a.issueNumber}` : 'busy';
}

/** Whether assignChoices would hand this QA-column PR to a free agent (untested, queued, or needing a human). */
function testable(card: KanbanCard): boolean {
  const board: KanbanColumns = { backlog: [], progress: [], qa: [card], ready: [], merged: [] };
  return assignChoices(board).some((c) => c.key === card.key);
}

/** Why a PR in the QA column can't be handed out: it's already with someone, or it needs a developer, not a tester. */
function notTestable(card: KanbanCard): string {
  const status = card.qa?.status;
  if (status === 'testing') return 'being tested';
  if (status === 'fixing') return 'being fixed';
  if (status === 'failed') return 'failed QA';
  return 'not testable';
}

/**
 * What dropping `card` (from `column`) onto `agent` should do. Free agents get the issue or PR straight away; a busy
 * one asks first; an issue waiting on open ones is blocked; and merged or in-progress cards, the CEO, an agent on
 * another floor, or one waiting for sign-in return `none` with a reason.
 */
export function dropAction(card: KanbanCard, column: keyof KanbanColumns, agent: Agent, ctx: DropContext): DropAction {
  if (column === 'merged') return { kind: 'none', reason: 'merged' };
  if (column === 'progress') return { kind: 'none', reason: 'in progress' };
  if (agent.role === 'ceo') return { kind: 'none', reason: 'the CEO' };
  if (agent.repoId !== ctx.repoId) return { kind: 'none', reason: 'another floor' };
  if (agent.host === 'box' && agent.needsSignIn) return { kind: 'none', reason: 'waiting for sign-in' };

  const busy = agent.status === 'preparing' || agent.status === 'working';

  // Backlog: an issue to build. Busy first (as the 3D desk's warning does), then open blockers, then assign.
  if (column === 'backlog') {
    const issue = ctx.issues.find((i) => i.number === card.number);
    const waits = issue ? blockers(issue.body, new Set(ctx.issues.map((i) => i.number))) : [];
    if (busy) return { kind: 'confirm-busy', agentId: agent.id, doing: doing(agent), ...(waits.length ? { waits } : {}) };
    if (waits.length) return { kind: 'blocked', waits };
    return { kind: 'assign', agentId: agent.id, issue: card.number };
  }

  // QA and Ready: a PR to test — the QA column's handable ones, and any Ready one for another round of QA.
  if (column === 'qa' || column === 'ready') {
    if (column === 'qa' && !testable(card)) return { kind: 'none', reason: notTestable(card) };
    if (busy) return { kind: 'confirm-busy', agentId: agent.id, doing: doing(agent) };
    return { kind: 'qa', agentId: agent.id, pr: card.prNumber ?? card.number };
  }

  return { kind: 'none', reason: 'not testable' };
}
