import { useEffect, useState, type ReactNode } from 'react';
import { agentsOnRepo, useStore, type Agent } from '../store';
import { CEO_ID, INSTALL_STEP, type LogLine, type RepoView } from '../../../shared/types';
import { dialogOpen } from './dialogFocus';
import { isKey, useKeyName } from './controls';
import { Key } from './Key';

// Who is busy with what, across the whole company: everyone working right now with their project and their latest
// thought, reply or tool call. Idle workers are left out; the floor you're on comes first. Click someone to watch
// their screen; L (Help → Controls) shows and hides the list. The 3D HUD passes `visitors` (the visitors list, which
// belongs to the 3D set); the 2D dashboard passes `embedded`: a side list that needs no start screen and no key.

const isWorking = (a: Agent) => a.status === 'working' || a.status === 'preparing';
const STORAGE_KEY = 'cubefarm:workers';

/** Their latest line worth listing (the store keeps it, shared/watch.ts), cleaned of the terminal's bullets. */
function latest(l: LogLine | undefined): { text: string; kind: LogLine['kind']; t: number } | null {
  if (!l) return null;
  const text = l.text
    .trim()
    .replace(/^[⏺●✻✔⎿▶]\s*/u, '')
    .replace(/^Manager:\s*/, 'you: ');
  return { text: l.kind === 'thinking' ? 'thinking…' : text, kind: l.kind, t: l.t };
}

function doing(a: Agent) {
  if (a.role === 'ceo') return a.issueTitle;
  if (a.task === 'qa') return `QA · PR #${a.prNumber}`;
  if (a.task === 'fix') return `fixing PR #${a.prNumber}`;
  return a.issueNumber ? `#${a.issueNumber}` : null;
}

function ago(t: number, now: number) {
  const s = Math.max(0, Math.round((now - t) / 1000));
  return s < 60 ? `${s}s` : s < 3600 ? `${Math.round(s / 60)}m` : `${Math.round(s / 3600)}h`;
}

function Row({ a, now }: { a: Agent; now: number }) {
  const openOverlay = useStore((s) => s.openOverlay);
  const line = useStore((s) => s.latest[a.id]);
  // CLIs that don't report each step (Codex, OpenCode…) have nothing new until their turn ends: show what they're on.
  const found = latest(line);
  const last = found && (!a.startedAt || found.t >= a.startedAt) ? found : null;
  const task = doing(a);
  return (
    <button className="wk-row" onClick={() => openOverlay({ kind: 'terminal', agentId: a.id })} title={`Watch ${a.name}'s screen`}>
      <span className="wk-dot" style={{ background: a.color }} />
      <span className="wk-main">
        <span className="wk-name">
          {a.name}
          {task && <span className="wk-task">{task}</span>}
        </span>
        <span className="wk-line">
          <span className={`wk-last wk-last-${last?.kind ?? 'none'}`} title={last?.text}>
            {a.status === 'preparing' ? (a.currentTool === INSTALL_STEP ? 'installing dependencies…' : 'setting up the worktree…') : (last?.text ?? (a.issueTitle ? `working on ${a.issueTitle}` : 'starting…'))}
          </span>
          {last && a.status !== 'preparing' && <span className="wk-ago">{ago(last.t, now)}</span>}
        </span>
      </span>
    </button>
  );
}

interface Group {
  key: string;
  label: string;
  title: string;
  color: string;
  list: Agent[];
}

function loadCollapsed(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(`${STORAGE_KEY}:collapsed`) ?? '[]') as string[]);
  } catch {
    return new Set();
  }
}

export function WorkersPanel({ visitors, embedded }: { visitors?: ReactNode; embedded?: boolean }) {
  const floor = useStore((s) => s.floor);
  const repos = useStore((s) => s.repos);
  const agents = useStore((s) => s.agents);
  const started = useStore((s) => s.started);
  const [open, setOpen] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) !== 'closed';
    } catch {
      return true;
    }
  });
  const [collapsed, setCollapsed] = useState(loadCollapsed);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(t);
  }, []);
  const toggleGroup = (key: string) =>
    setCollapsed((was) => {
      const next = new Set(was);
      if (!next.delete(key)) next.add(key);
      try {
        localStorage.setItem(`${STORAGE_KEY}:collapsed`, JSON.stringify([...next]));
      } catch {
        // private window: the list just doesn't remember
      }
      return next;
    });
  const toggle = () =>
    setOpen((was) => {
      try {
        localStorage.setItem(STORAGE_KEY, was ? 'closed' : 'open');
      } catch {
        // private window: the list just doesn't remember
      }
      return !was;
    });
  // Its key shows and hides it, like a game's player list. Not while a panel or question is open, while you're typing,
  // or while you're moving through the HUD's buttons with Tab (it moves focus then, as everywhere else).
  const key = useKeyName('workers');
  useEffect(() => {
    if (embedded) return;
    const onKey = (e: KeyboardEvent) => {
      if (!isKey('workers', e.code) || e.repeat || e.altKey || e.ctrlKey || e.metaKey || useStore.getState().overlay || dialogOpen()) return;
      const el = e.target as HTMLElement | null;
      if (el?.closest?.('input, textarea, select, [contenteditable="true"]')) return;
      if (e.code === 'Tab' && el && el !== document.body && el.closest?.('.hud') && el.matches(':focus-visible')) return;
      e.preventDefault();
      toggle();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [embedded]);
  // While the list is out, the office sends everyone's latest line (net.ts).
  const showing = open && (started || !!embedded);
  useEffect(() => {
    useStore.getState().setWorkersOpen(showing);
    return () => useStore.getState().setWorkersOpen(false);
  }, [showing]);
  if (!started && !embedded) return null;

  const ceo = agents[CEO_ID];
  const floors = [...repos].sort((x, y) => (x.floor === floor ? -1 : y.floor === floor ? 1 : x.floor - y.floor));
  const groups: Group[] = [
    ...(ceo && isWorking(ceo) ? [{ key: 'hq', label: 'HQ', title: 'The CEO, in the lobby', color: ceo.color, list: [ceo] }] : []),
    ...floors.map((r: RepoView) => ({
      key: r.id,
      label: `${r.floor} · ${r.fullName.split('/')[1]}`,
      title: `Floor ${r.floor}: ${r.fullName}`,
      color: r.color,
      list: agentsOnRepo(agents, r.id).filter(isWorking),
    })),
  ].filter((g) => g.list.length > 0);
  const total = groups.reduce((n, g) => n + g.list.length, 0);

  return (
    <div className={`workers ${open ? '' : 'workers-closed'} ${embedded ? 'workers-embedded' : ''}`}>
      <button className="wk-head" onClick={toggle} title={open ? `Hide the list${embedded ? '' : ` (${key})`}` : `Show who is working${embedded ? '' : ` (${key})`}`}>
        <span>
          Working <b>{total}</b>
        </span>
        <span className="wk-chevron">
          {!embedded && <Key action="workers" />} {open ? '▾' : '▸'}
        </span>
      </button>
      {open && (
        <div className="wk-list">
          {visitors}
          {total === 0 && <div className="wk-empty">Nobody is working right now.</div>}
          {groups.map((g) => {
            const shut = collapsed.has(g.key);
            return (
              <div key={g.key} className="wk-group">
                <button className="wk-group-head" onClick={() => toggleGroup(g.key)} title={`${g.title} · click to ${shut ? 'expand' : 'collapse'}`}>
                  <span className="wk-group-arrow">{shut ? '▸' : '▾'}</span>
                  <span className="wk-swatch" style={{ background: g.color }} />
                  <span className="wk-group-name">{g.label}</span>
                  <span className="wk-group-count">{g.list.length}</span>
                </button>
                {!shut && g.list.map((a) => <Row key={a.id} a={a} now={now} />)}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
