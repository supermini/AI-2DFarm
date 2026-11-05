// The developer board's hand-out flow, pure: running dnd.ts's dropAction (with its questions), which cards can be handed
// out, and the words and keys around it. A drag, a touch drag and the "Assign to…" menu all end in runDrop, so they
// can't disagree. Nothing here touches React or the DOM.

import { cardLabel } from '../cards';
import { assignChoices } from '../pocket/pocketData';
import type { Agent, KanbanCard, KanbanColumns } from '../store';
import type { DropAction } from './dnd';

/** What runDrop does to the world: REST calls, the manager's answers, and a refusal's message. */
export interface DropIo {
  assign(agentId: string, issue: number, waitForDeps: boolean): Promise<unknown>;
  sendToQa(pr: number, agentId: string): Promise<unknown>;
  /** "Ada is working on #9. Give them #3 anyway?" */
  askBusy(name: string, doing: string, card: string): Promise<boolean>;
  /** The dependency question: true starts now, false waits for the blockers. */
  askBlocked(issue: number, waits: number[], name: string): Promise<boolean>;
  refuse(card: string, name: string, reason: string): void;
}

/** Carries out a dropAction for `card` and `agent`. A "wait" answer still assigns, with waitForDeps: the office then refuses while a blocker is open and says why. */
export async function runDrop(action: DropAction, card: KanbanCard, agent: Pick<Agent, 'id' | 'name'>, io: DropIo): Promise<void> {
  const assignAsking = async (waits: number[] | undefined) => {
    const start = waits?.length ? await io.askBlocked(card.number, waits, agent.name) : true;
    await io.assign(agent.id, card.number, !start);
  };
  switch (action.kind) {
    case 'assign':
      await io.assign(action.agentId, action.issue, false);
      return;
    case 'qa':
      await io.sendToQa(action.pr, action.agentId);
      return;
    case 'blocked':
      await assignAsking(action.waits);
      return;
    case 'confirm-busy':
      if (!(await io.askBusy(agent.name, action.doing, cardLabel(card)))) return;
      if (card.prNumber != null) await io.sendToQa(card.prNumber, agent.id);
      else await assignAsking(action.waits);
      return;
    case 'none':
      io.refuse(cardLabel(card), agent.name, action.reason);
  }
}

/** The cards that can be handed to an agent, by key: assignChoices' ones, and any Ready PR for another round of QA. */
export function handOutKeys(cols: KanbanColumns): Set<string> {
  return new Set([...assignChoices(cols).map((c) => c.key), ...cols.ready.map((c) => c.key)]);
}

/** How an agent chip looks under a dragged card: takes it, asks first, or won't. */
export function dropHint(a: DropAction): 'go' | 'ask' | 'no' {
  if (a.kind === 'none') return 'no';
  return a.kind === 'assign' || a.kind === 'qa' ? 'go' : 'ask';
}

/** An agent's line in the "Assign to…" menu (and on their chip during a drag): what picking them leads to. */
export function pickHint(a: DropAction): string {
  switch (a.kind) {
    case 'assign':
      return 'free';
    case 'qa':
      return 'free, to test';
    case 'blocked':
      return `free · waits for #${a.waits.join(', #')}`;
    case 'confirm-busy':
      return `busy · ${a.doing}`;
    case 'none':
      return a.reason;
  }
}

/** The issue or PR on an agent's hands: "PR #7", "#3", or nothing. */
export function onHand(a: Pick<Agent, 'issueNumber' | 'prNumber'>): string {
  if (a.prNumber != null) return `PR #${a.prNumber}`;
  return a.issueNumber != null ? `#${a.issueNumber}` : '';
}

/** Where a key moves the "Assign to…" menu's focus from `at`; `enabled` is per item. -1: nothing can take focus. */
export function menuMove(key: string, at: number, enabled: readonly boolean[]): number {
  const n = enabled.length;
  const first = enabled.indexOf(true);
  if (first < 0) return -1;
  if (key === 'Home') return first;
  if (key === 'End') return enabled.lastIndexOf(true);
  const step = key === 'ArrowDown' ? 1 : key === 'ArrowUp' ? -1 : 0;
  if (!step) return at;
  for (let i = 1; i <= n; i++) {
    const j = (at + step * i + n * i) % n;
    if (enabled[j]) return j;
  }
  return at;
}
