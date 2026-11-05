// The developer screen's board for one floor: its pipeline strip, the team as drop targets, and the Kanban. It holds the
// drag: a mouse drags cards natively (HTML5), touch and pen drag them by their grip with pointer events, and the
// "Assign to…" menu needs no drag at all. All three end in `hand`: dnd.ts decides, boardDrag.ts's runDrop acts.
import { useEffect, useMemo, useRef, useState, type DragEvent, type PointerEvent } from 'react';
import { api } from '../api';
import { cardLabel, findCard, type Col } from '../cards';
import { agentsOnRepo, kanbanFor, useStore, type Agent, type KanbanCard } from '../store';
import type { RepoView } from '../../../shared/types';
import { pipelineOf } from '../pocket/pocketData';
import { PipelineStrip } from '../pocket/Pocket';
import { toolVerb } from '../toolVerb';
import { announce } from '../ui/announce';
import { confirmDialog } from '../ui/Confirm';
import { StatusPill } from '../ui/TerminalView';
import { dropHint, handOutKeys, onHand, pickHint, runDrop, type DropIo } from './boardDrag';
import { dropAction, type DropAction, type DropContext } from './dnd';
import { KanbanBoard, type DragHandlers } from './KanbanBoard';
import './dev.css';

interface Dragged {
  card: KanbanCard;
  col: Col;
}

/** The office's REST and dialogs behind runDrop. api() toasts its own errors. */
function dropIo(repoId: string): DropIo {
  return {
    assign: (agentId, issue, waitForDeps) => api.assign(agentId, issue, undefined, waitForDeps),
    sendToQa: (pr, agentId) => api.sendToQa(repoId, pr, agentId),
    askBusy: (name, doing, card) => confirmDialog({ tone: 'warn', title: `${name} is busy`, body: `${name} is ${doing}. Give them ${card} anyway?`, confirm: `Give ${card} to ${name}` }),
    askBlocked: (issue, waits, name) =>
      confirmDialog({
        tone: 'warn',
        icon: '⏳',
        title: `#${issue} waits for #${waits.join(', #')}`,
        body: `Those issues are still open. ${name} can start on #${issue} now, or it can wait until they're closed.`,
        confirm: 'Start now',
        cancel: 'Wait',
      }),
    refuse: (card, name, reason) => useStore.getState().pushToast('info', `${name} can't take ${card}: ${reason}.`),
  };
}

/** The agent chip under a point, if any. */
const agentAt = (x: number, y: number) => document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-drop-agent]')?.dataset.dropAgent ?? null;

function AgentChip({ agent, action, over, onDrag }: { agent: Agent; action: DropAction | null; over: boolean; onDrag: { over: (e: DragEvent, id: string, a: DropAction | null) => void; leave: (e: DragEvent) => void; drop: (e: DragEvent, a: Agent) => void } }) {
  const openOverlay = useStore((s) => s.openOverlay);
  const working = agent.status === 'working' || agent.status === 'preparing';
  const verb = working && agent.currentTool ? toolVerb(agent.currentTool) || agent.currentTool : '';
  const hand = onHand(agent);
  const line = action ? pickHint(action) : [hand, verb && `${verb}…`].filter(Boolean).join(' · ') || 'nothing on hand';
  return (
    <button
      className={`dev-chip ${action ? `dev-chip-${dropHint(action)}` : ''} ${over ? 'dev-chip-over' : ''}`}
      data-drop-agent={agent.id}
      title={`Open ${agent.name}'s terminal`}
      onClick={() => openOverlay({ kind: 'terminal', agentId: agent.id })}
      onDragOver={(e) => onDrag.over(e, agent.id, action)}
      onDragLeave={onDrag.leave}
      onDrop={(e) => onDrag.drop(e, agent)}
    >
      <span className="avatar" style={{ background: agent.color }} aria-hidden>
        {agent.name[0]}
      </span>
      <span className="dev-chip-text">
        <span className="dev-chip-name">
          <b>{agent.name}</b> <StatusPill status={agent.status} />
        </span>
        <span className="dev-chip-line small">{line}</span>
      </span>
    </button>
  );
}

export function DevBoard({ repo }: { repo: RepoView }) {
  const allAgents = useStore((s) => s.agents);
  const qa = useStore((s) => s.qa);
  const usage = useStore((s) => s.usage.state);
  const agents = useMemo(() => agentsOnRepo(allAgents, repo.id), [allAgents, repo.id]);
  const team = useMemo(() => agents.filter((a) => a.role !== 'ceo'), [agents]);
  const cols = useMemo(() => kanbanFor(repo, agents, qa, { state: usage }), [repo, agents, qa, usage]);
  const pipeline = useMemo(() => pipelineOf(cols), [cols]);
  const canHand = useMemo(() => handOutKeys(cols), [cols]);
  const ctx: DropContext = useMemo(() => ({ repoId: repo.id, issues: repo.issues }), [repo.id, repo.issues]);

  const [drag, setDrag] = useState<Dragged | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const ghost = useRef<HTMLDivElement>(null);

  /** The card as it stands now: the office may have moved it since the drag began. */
  const live = (d: Dragged): Dragged | null => {
    const at = findCard(cols, d.card.key, d.card.number, d.card.prNumber != null);
    return at && { card: at.card, col: at.col };
  };
  const end = () => {
    setDrag(null);
    setOver(null);
  };
  // A card taken off the board mid-drag (auto-assign, a merge) never fires dragend.
  const gone = drag !== null && !findCard(cols, drag.card.key, drag.card.number, drag.card.prNumber != null);
  useEffect(() => {
    if (gone) end();
  }, [gone]);

  /** Hands a card to an agent: the one path for a drag, a touch drag and the menu. */
  const hand = (d: Dragged, agent: Agent) => {
    const now = live(d);
    end();
    if (!now) return;
    const action = dropAction(now.card, now.col, agent, ctx);
    void runDrop(action, now.card, agent, dropIo(repo.id))
      .then(() => {
        if (action.kind === 'assign' || action.kind === 'qa') announce(`${cardLabel(now.card)} goes to ${agent.name}`);
      })
      .catch(() => undefined); // toasted
  };

  const moveGhost = (x: number, y: number) => {
    if (ghost.current) ghost.current.style.transform = `translate(${x}px, ${y}px)`;
  };
  const handlers: DragHandlers = {
    start: (e, card, col) => {
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', cardLabel(card));
      setDrag({ card, col });
    },
    end,
    gripDown: (e: PointerEvent<HTMLElement>, card, col) => {
      if (e.pointerType === 'mouse') return; // a mouse drags natively
      e.currentTarget.setPointerCapture(e.pointerId);
      setDrag({ card, col });
      requestAnimationFrame(() => moveGhost(e.clientX, e.clientY));
    },
    gripMove: (e) => {
      if (!drag) return;
      moveGhost(e.clientX, e.clientY);
      setOver(agentAt(e.clientX, e.clientY));
    },
    gripUp: (e) => {
      if (!drag) return;
      const id = agentAt(e.clientX, e.clientY);
      const agent = team.find((a) => a.id === id);
      if (agent) hand(drag, agent);
      else end();
    },
    pick: (card, col, agent) => hand({ card, col }, agent),
  };

  const chipDrag = {
    over: (e: DragEvent, id: string, action: DropAction | null) => {
      if (!action || action.kind === 'none') return; // not preventing it: the browser shows "no drop" and won't drop
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      setOver(id);
    },
    leave: (e: DragEvent) => {
      if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver(null); // crossing the chip's own parts isn't leaving
    },
    drop: (e: DragEvent, agent: Agent) => {
      e.preventDefault();
      if (drag) hand(drag, agent);
    },
  };

  return (
    <div className="dev-board" style={{ ['--accent' as string]: repo.color }}>
      <PipelineStrip p={pipeline} floor={repo.floor} />
      <div className="dev-team" role="group" aria-label={`Team on floor ${repo.floor}`}>
        {team.length === 0 && <p className="muted small">Nobody works on this floor yet.</p>}
        {team.map((a) => (
          <AgentChip key={a.id} agent={a} action={drag ? dropAction(drag.card, drag.col, a, ctx) : null} over={over === a.id} onDrag={chipDrag} />
        ))}
      </div>
      <KanbanBoard repo={repo} cols={cols} team={team} ctx={ctx} canHand={canHand} dragging={drag?.card.key ?? null} drag={handlers} />
      {drag && (
        <div ref={ghost} className="dev-ghost" aria-hidden>
          {cardLabel(drag.card)} {drag.card.title}
        </div>
      )}
    </div>
  );
}
