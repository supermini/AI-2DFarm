// The dashboard's parts from pocket mode (docs/pocket.md): the pipeline strip, banners, the board, toasts and the
// panels opened over the page.
import { lazy } from 'react';
import { useStore } from '../store';
import { CEO_ID } from '../../../shared/types';
import { officeUpdateChip } from '../officeUpdate';
import { KanbanView } from '../ui/KanbanView';
import type { Pipeline } from './pocketData';

// Opened from the Team and Kanban tabs; loaded when first opened (the terminal brings xterm.js).
const TerminalView = lazy(() => import('../ui/TerminalView').then((m) => ({ default: m.TerminalView })));
const AppViewer = lazy(() => import('../ui/AppViewer').then((m) => ({ default: m.AppViewer })));

const name = (fullName: string) => fullName.split('/')[1] ?? fullName;

// ---------- company ----------

const STAGES: [keyof Pipeline, string, string][] = [
  ['building', '🔨', 'Building'],
  ['qa', '🔍', 'QA'],
  ['fixing', '🔧', 'Fixing'],
  ['ready', '✅', 'Ready'],
  ['needsYou', '⚠️', 'Needs you'],
];

/** A floor's pipeline as a strip of counts, at the developer board's top. */
export function PipelineStrip({ p, floor }: { p: Pipeline; floor: number }) {
  return (
    <div className="pk-pipeline" role="list" aria-label={`Floor ${floor} pipeline`}>
      {STAGES.map(([k, icon, label]) => (
        <div key={k} role="listitem" className={`pk-stage ${p[k] ? '' : 'pk-stage-zero'} ${k === 'needsYou' && p[k] ? 'pk-stage-hot' : ''}`}>
          <span className="pk-stage-n">
            <span className="pk-stage-icon" aria-hidden>
              {icon}
            </span>
            {p[k]}
          </span>
          <span className="pk-stage-label">{label}</span>
        </div>
      ))}
    </div>
  );
}

export function Banners() {
  const connected = useStore((s) => s.connected);
  const loaded = useStore((s) => s.loaded);
  const usage = useStore((s) => s.usage);
  const update = useStore((s) => (s.restarting ? '⟳ The office is restarting…' : officeUpdateChip(s.officeUpdate)));
  const until = usage.until ? new Date(usage.until).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : null;
  return (
    <>
      {!connected && <div className="pk-banner pk-banner-bad">{loaded ? '📡 Reconnecting to the office…' : '📡 Connecting to the office…'}</div>}
      {usage.state === 'paused' && <div className="pk-banner pk-banner-bad">⏸ Claude's usage limit was reached: no new work starts{until ? ` until ${until}` : ''}.</div>}
      {usage.state === 'pacing' && <div className="pk-banner">🐢 Pacing new work after a usage warning{until ? ` until ${until}` : ''}.</div>}
      {update && <div className="pk-banner">{update}</div>}
    </>
  );
}

export function Board({ repoId, pick }: { repoId: string | null; pick: (id: string) => void }) {
  const repos = useStore((s) => s.repos);
  const id = repos.some((r) => r.id === repoId) ? repoId! : repos[0]?.id;
  if (!id) return <p className="muted pk-page">No projects yet.</p>;
  return (
    <div className="pk-page">
      {repos.length > 1 && (
        <div className="pk-chips" role="tablist" aria-label="Floor">
          {repos.map((r) => (
            <button key={r.id} role="tab" aria-selected={r.id === id} className={`pk-chip ${r.id === id ? 'pk-chip-on' : ''}`} style={{ ['--accent' as string]: r.color }} onClick={() => pick(r.id)}>
              {r.floor} · {name(r.fullName)}
            </button>
          ))}
        </div>
      )}
      <KanbanView key={id} repoId={id} embedded />
    </div>
  );
}

// ---------- the shell ----------

export function Toasts() {
  const toasts = useStore((s) => s.toasts);
  const dismiss = useStore((s) => s.dismissToast);
  return (
    <div className="toasts">
      {toasts.slice(-2).map((t) => (
        <div key={t.id} className={`toast toast-${t.level}`} onClick={() => dismiss(t.id)}>
          {t.text}
        </div>
      ))}
    </div>
  );
}

/** Panels the tabs open over the page: an agent's terminal and a floor's app. */
export function PocketOverlay() {
  const overlay = useStore((s) => s.overlay);
  if (overlay?.kind === 'terminal' && overlay.agentId !== CEO_ID) return <TerminalView agentId={overlay.agentId} />;
  if (overlay?.kind === 'app') return <AppViewer repoId={overlay.repoId} />;
  return null;
}
