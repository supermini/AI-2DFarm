// Board cards: a card's column, what it reads like, whether it may be handed to an agent, where it is now and the
// first lines of its body, for the card view (ui/CardView.tsx).

import type { KanbanCard, KanbanColumns } from './store';

export type Col = keyof KanbanColumns;

/** The board's columns, left to right. */
const COLUMNS: Col[] = ['backlog', 'progress', 'qa', 'ready', 'merged'];

/**
 * A sticky you may peel off and carry to an agent's desk: an issue in the Backlog (for them to build), or a PR in In QA
 * that the console would send to QA (never tested, or needing you) for them to test.
 */
export function canPeel(col: Col, card: KanbanCard) {
  if (col === 'backlog') return !card.prNumber;
  return col === 'qa' && !!card.prNumber && !card.ghost && (!card.qa || card.qa.status === 'needs-human');
}

/** What the card's number reads like: "#12" or "PR #7". */
export const cardLabel = (c: { number: number; pr?: boolean; prNumber?: number }) => `${c.pr || c.prNumber ? 'PR ' : ''}#${c.number}`;

/** The card a card view is about, wherever it is now: by key, else the same issue or PR by number. */
export function findCard(cols: KanbanColumns, key: string, number: number, pr: boolean): { col: Col; index: number; card: KanbanCard } | null {
  let byNumber: { col: Col; index: number; card: KanbanCard } | null = null;
  for (const col of COLUMNS) {
    const cards = cols[col];
    for (let index = 0; index < cards.length; index++) {
      const card = cards[index];
      if (card.key === key) return { col, index, card };
      if (!byNumber && card.number === number && !!card.prNumber === pr) byNumber = { col, index, card };
    }
  }
  return byNumber;
}

/** The first lines of an issue's body, for the card view: at most `lines` non-blank lines and `chars` characters. */
export function bodyExcerpt(body: string, lines = 8, chars = 600): { text: string; more: boolean } {
  const all = (body ?? '').split(/\r?\n/);
  const out: string[] = [];
  let kept = 0;
  let used = 0;
  let i = 0;
  for (; i < all.length && kept < lines && used < chars; i++) {
    const line = all[i];
    if (line.trim()) kept++;
    out.push(used + line.length > chars ? `${line.slice(0, Math.max(0, chars - used)).trimEnd()}…` : line);
    used += line.length + 1;
  }
  const more = all.slice(i).some((l) => l.trim()) || used > chars;
  return { text: out.join('\n').trim(), more };
}
