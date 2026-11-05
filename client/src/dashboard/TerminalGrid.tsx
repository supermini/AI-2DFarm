// The terminals view (#/dev/:floor/terminals): 1, 2, 4 or 6 live terminals side by side, one per agent the manager
// picked (the busy ones to begin with), and the workers list beside them. Every tile is a /ws/term socket, so a tile
// that scrolls out of view unmounts its terminal (and closes the socket), and below 760 px only one tile shows at a time.
// Esc inside a terminal goes to the agent (it interrupts them): LiveTerminal keeps it from closing anything.
import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { api } from '../api';
import { useStore, isBusy, type Agent } from '../store';
import { LiveTerminal } from '../ui/LiveTerminal';
import { StatusPill } from '../ui/TerminalView';
import { WorkersPanel } from '../ui/WorkersPanel';
import { doing } from '../pocket/pocketData';
import { gridShape, MAX_TILES, narrowTile, NARROW_PX, selectTiles, tileCandidates, tilesShown, togglePick } from './terminalTiles';
import { useShowAgents } from './visible';
import './terminals.css';

/** True below NARROW_PX wide. */
function useNarrow() {
  const query = `(max-width: ${NARROW_PX - 1}px)`;
  const [narrow, setNarrow] = useState(() => typeof matchMedia === 'function' && matchMedia(query).matches);
  useEffect(() => {
    if (typeof matchMedia !== 'function') return;
    const mq = matchMedia(query);
    const on = () => setNarrow(mq.matches);
    on();
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [query]);
  return narrow;
}

/** Whether the element is on screen (a little before it is, so its terminal is ready when it scrolls in). */
function useInView(ref: RefObject<HTMLElement | null>) {
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver !== 'function') {
      setInView(true);
      return;
    }
    const io = new IntersectionObserver((entries) => setInView(entries[entries.length - 1]?.isIntersecting ?? false), { rootMargin: '80px' });
    io.observe(el);
    return () => io.disconnect();
  }, [ref]);
  return inView;
}

function Tile({ agent, expanded, onExpand, onView }: { agent: Agent; expanded: boolean; onExpand: () => void; onView: (id: string, on: boolean) => void }) {
  const box = useRef<HTMLElement>(null);
  const inView = useInView(box);
  const openOverlay = useStore((s) => s.openOverlay);
  const [busy, setBusy] = useState(false);
  const working = isBusy(agent);
  useEffect(() => {
    onView(agent.id, inView);
    return () => onView(agent.id, false);
  }, [agent.id, inView, onView]);
  const stop = async () => {
    setBusy(true);
    try {
      await api.stop(agent.id);
    } catch {
      // api() already toasted
    } finally {
      setBusy(false);
    }
  };
  return (
    <section ref={box} className="dash-tile" style={{ ['--accent' as string]: agent.color }} aria-label={`${agent.name}'s terminal`}>
      <header className="dash-tile-head">
        <button className="dash-tile-name" onClick={() => openOverlay({ kind: 'terminal', agentId: agent.id })} title={`Open ${agent.name} in the side drawer (message, assign, setup)`}>
          <span className="avatar" style={{ background: agent.color }}>
            {agent.name[0]}
          </span>
          <b>{agent.name}</b>
        </button>
        <StatusPill status={agent.status} />
        <span className="dash-tile-doing muted small">{doing(agent)}</span>
        <span className="spacer" />
        {working && (
          <button className="btn btn-small btn-bad" disabled={busy} onClick={() => void stop()} title={`Stop ${agent.name}`} aria-label={`Stop ${agent.name}`}>
            ■<span className="dash-tile-stop"> Stop</span>
          </button>
        )}
        <button className="btn btn-small btn-ghost" onClick={onExpand} aria-pressed={expanded} title={expanded ? 'Back to the grid' : `Fill the grid with ${agent.name}`} aria-label={expanded ? 'Back to the grid' : `Expand ${agent.name}`}>
          {expanded ? '⤡' : '⤢'}
        </button>
      </header>
      <div className="dash-tile-body">
        {!agent.terminal ? (
          <p className="muted small dash-tile-note">{agent.name} works without a terminal (the SDK runtime). Open them in the drawer to read their log.</p>
        ) : inView ? (
          <LiveTerminal agentId={agent.id} />
        ) : (
          <p className="muted small dash-tile-note">Paused while off screen.</p>
        )}
      </div>
    </section>
  );
}

export function TerminalGrid({ repoId }: { repoId: string | null }) {
  const agents = useStore((s) => s.agents);
  const narrow = useNarrow();
  const list = useMemo(() => Object.values(agents), [agents]);
  // The chips keep the team's order, so they don't shuffle as agents start and stop; the tiles begin with the busy ones.
  const candidates = useMemo(() => tileCandidates(list, repoId, false), [list, repoId]);
  const [picked, setPicked] = useState<readonly string[]>(() => selectTiles(tileCandidates(list, repoId), null));
  const [expanded, setExpanded] = useState<string | null>(null);
  const [active, setActive] = useState<string | null>(null);
  const ids = selectTiles(candidates, picked);
  const shown = narrow ? [narrowTile(candidates, active ?? ids[0] ?? null)].filter((id): id is string => id !== null) : tilesShown(ids, expanded);
  const shape = gridShape(shown.length);

  // The tiles on screen: the office sends their terminal lines (the dashboard's watch), and no one else's.
  const [seen, setSeen] = useState<ReadonlySet<string>>(new Set());
  const onView = useCallback(
    (id: string, on: boolean) =>
      setSeen((was) => {
        if (was.has(id) === on) return was;
        const next = new Set(was);
        if (on) next.add(id);
        else next.delete(id);
        return next;
      }),
    [],
  );
  useShowAgents(shown.filter((id) => seen.has(id)));

  const chipOn = (id: string) => (narrow ? shown[0] === id : ids.includes(id));
  const pick = (id: string) => {
    if (narrow) setActive(id);
    else setPicked(togglePick(ids, id));
  };
  const full = !narrow && ids.length >= MAX_TILES;

  return (
    <div className="dash-terminals">
      <div className="dash-tgrid-col">
        <div className="dash-tpick" role="group" aria-label={narrow ? 'Which terminal to show' : `Terminals to show (up to ${MAX_TILES})`}>
          {candidates.length === 0 && <span className="muted small">Nobody works here yet.</span>}
          {candidates.map((id) => {
            const a = agents[id];
            if (!a) return null;
            const on = chipOn(id);
            return (
              <button key={id} className={`pk-chip ${on ? 'pk-chip-on' : ''}`} aria-pressed={on} disabled={full && !on} onClick={() => pick(id)} title={full && !on ? `Up to ${MAX_TILES} terminals at once` : a.name}>
                <span className="dash-dot" style={{ background: a.color }} aria-hidden /> {a.name}
              </button>
            );
          })}
          <span className="dash-tpick-hint muted small">{narrow ? 'One terminal at a time on a narrow screen.' : `Up to ${MAX_TILES} at once. Click into a terminal to type; Esc there interrupts the agent.`}</span>
        </div>
        {shown.length === 0 ? (
          <p className="muted pk-page">No terminals to show. Agents appear here once the floor has a team.</p>
        ) : (
          <div className="dash-tgrid" style={{ ['--cols' as string]: shape.cols, ['--rows' as string]: shape.rows }}>
            {shown.map((id) => {
              const a = agents[id];
              return a ? <Tile key={id} agent={a} expanded={expanded === id} onExpand={() => setExpanded(expanded === id ? null : id)} onView={onView} /> : null;
            })}
          </div>
        )}
      </div>
      <aside className="dash-tworkers" aria-label="Who is working">
        <WorkersPanel />
      </aside>
    </div>
  );
}
