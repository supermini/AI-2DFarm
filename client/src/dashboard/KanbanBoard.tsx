// The developer board's five columns, side by side. A card that can be handed out drags (DevBoard.tsx holds the drag),
// has a grip for touch, and an "Assign to…" menu for the keyboard and for anyone who'd rather not drag; a click opens it
// in the right drawer. Every other action is the console's own (ui/KanbanView.tsx).
import { useEffect, useRef, useState, type DragEvent, type KeyboardEvent, type MouseEvent, type PointerEvent } from 'react';
import { cardLabel, type Col } from '../cards';
import type { Agent, KanbanCard, KanbanColumns } from '../store';
import type { RepoView } from '../../../shared/types';
import { CardFoot, KanbanToolbar, useCardActions } from '../ui/KanbanView';
import { CardView } from '../ui/CardView';
import { menuMove, pickHint } from './boardDrag';
import { dropAction, type DropContext } from './dnd';
import { Drawer } from './Drawer';
import './dev.css';

export interface DragHandlers {
  start: (e: DragEvent, card: KanbanCard, col: Col) => void;
  end: () => void;
  gripDown: (e: PointerEvent<HTMLElement>, card: KanbanCard, col: Col) => void;
  gripMove: (e: PointerEvent<HTMLElement>) => void;
  gripUp: (e: PointerEvent<HTMLElement>) => void;
  pick: (card: KanbanCard, col: Col, agent: Agent) => void;
}

const COLUMNS: [Col, string, string, string][] = [
  ['backlog', '📋 Backlog', 'kcol-backlog', 'No open issues. File one above!'],
  ['progress', '🔨 In progress', 'kcol-progress', 'Nobody is coding right now.'],
  ['qa', '🔍 QA', 'kcol-qa', 'Nothing waiting for testing.'],
  ['ready', '✅ Ready', 'kcol-review', 'No tested pull requests yet.'],
  ['merged', '🎉 Merged', 'kcol-merged', 'Nothing merged yet.'],
];

/** "Assign to…": the team, each with what picking them leads to. The same decision as a drop, so the same questions follow. */
function AssignMenu({ card, col, team, ctx, pick }: { card: KanbanCard; col: Col; team: Agent[]; ctx: DropContext; pick: (a: Agent) => void }) {
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const rows = team.map((agent) => ({ agent, action: dropAction(card, col, agent, ctx) }));
  const enabled = rows.map((r) => r.action.kind !== 'none');
  const focusItem = (i: number) => menu.current?.querySelectorAll<HTMLElement>('[role="menuitem"]')[i]?.focus();
  useEffect(() => {
    if (open) focusItem(menuMove('Home', 0, enabled));
    // Only when it opens: the team changing under the menu mustn't move the focus.
  }, [open]);
  const close = () => {
    setOpen(false);
    button.current?.focus();
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      close();
    } else if (e.key === 'Tab') setOpen(false);
    else if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) {
      e.preventDefault();
      const items = [...(menu.current?.querySelectorAll('[role="menuitem"]') ?? [])];
      focusItem(menuMove(e.key, items.indexOf(document.activeElement as Element), enabled));
    }
  };
  return (
    <div
      className="dev-assign"
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setOpen(false);
      }}
    >
      <button ref={button} className="btn btn-small" aria-haspopup="menu" aria-expanded={open} aria-label={`Assign ${cardLabel(card)} to…`} onClick={() => setOpen(!open)}>
        Assign to…
      </button>
      {open && (
        <div ref={menu} className="dev-menu" role="menu" aria-label={`Assign ${cardLabel(card)} to`} onKeyDown={onKey}>
          {rows.length === 0 && <div className="muted small">Nobody works on this floor yet.</div>}
          {rows.map(({ agent, action }) => (
            <button
              key={agent.id}
              role="menuitem"
              tabIndex={-1}
              className="dev-menu-item"
              aria-disabled={action.kind === 'none'}
              onClick={() => {
                if (action.kind === 'none') return;
                close();
                pick(agent);
              }}
            >
              <span className="dot" style={{ background: agent.color }} aria-hidden />
              <b>{agent.name}</b>
              <span className="muted small">{pickHint(action)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

interface OpenCard {
  key: string;
  number: number;
  pr: boolean;
  label: string;
  title: string;
}

export function KanbanBoard({ repo, cols, team, ctx, canHand, dragging, drag }: { repo: RepoView; cols: KanbanColumns; team: Agent[]; ctx: DropContext; canHand: Set<string>; dragging: string | null; drag: DragHandlers }) {
  const actions = useCardActions(repo.id, repo.defaultBranch);
  const [opened, setOpened] = useState<OpenCard | null>(null);
  const open = (c: KanbanCard) => setOpened({ key: c.key, number: c.number, pr: c.prNumber != null, label: cardLabel(c), title: c.title });
  /** A click anywhere on a card opens it, except on what has its own click. */
  const clickCard = (e: MouseEvent, c: KanbanCard) => {
    if (!(e.target as Element).closest('a, button, select, input, .dev-grip')) open(c);
  };

  const cardEl = (c: KanbanCard, col: Col) => {
    const can = canHand.has(c.key);
    return (
      <div
        key={c.key}
        className={`kcard dev-card ${c.tone ? `kcard-${c.tone}` : ''} ${can ? 'dev-card-can' : ''} ${dragging === c.key ? 'dev-card-dragging' : ''} ${opened?.key === c.key ? 'dev-card-on' : ''}`}
        draggable={can}
        onDragStart={can ? (e) => drag.start(e, c, col) : undefined}
        onDragEnd={can ? drag.end : undefined}
        onClick={(e) => clickCard(e, c)}
      >
        <div className="dev-card-top">
          {can && (
            <span
              className="dev-grip"
              aria-hidden
              title="Drag to an agent"
              onPointerDown={(e) => drag.gripDown(e, c, col)}
              onPointerMove={drag.gripMove}
              onPointerUp={drag.gripUp}
              onPointerCancel={drag.end}
            >
              ⠿
            </span>
          )}
          <div
            className="kcard-title dev-card-title"
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key !== 'Enter' && e.key !== ' ') return;
              e.preventDefault();
              open(c);
            }}
          >
            <b>{cardLabel(c)}</b> {c.title}
          </div>
        </div>
        {col === 'backlog' ? (
          <div className="kcard-foot kcard-foot-wrap">{c.note && <span className="muted small">{c.note}</span>}</div>
        ) : (
          <CardFoot repo={repo} col={col} card={c} actions={actions} />
        )}
        {can && (
          <div className="dev-card-assign">
            <AssignMenu card={c} col={col} team={team} ctx={ctx} pick={(a) => drag.pick(c, col, a)} />
          </div>
        )}
      </div>
    );
  };

  return (
    <>
      <KanbanToolbar repo={repo} workers={team} actions={actions} />
      <div className="dev-kanban">
        {COLUMNS.map(([col, title, cls, empty]) => (
          <section key={col} className={`kcol ${cls}`} aria-label={title}>
            <div className="kcol-head">
              {title} <span className="count">{cols[col].length}</span>
            </div>
            <div className="kcol-body">
              {cols[col].length === 0 && <div className="muted small kempty">{empty}</div>}
              {cols[col].map((c) => cardEl(c, col))}
            </div>
          </section>
        ))}
      </div>
      {opened && (
        <div style={{ ['--accent' as string]: repo.color }}>
          <Drawer title={`📌 ${opened.label} ${opened.title}`} onClose={() => setOpened(null)}>
            <CardView repoId={repo.id} cardKey={opened.key} number={opened.number} pr={opened.pr} embedded />
          </Drawer>
        </div>
      )}
    </>
  );
}
