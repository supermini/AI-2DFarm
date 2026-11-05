// The dashboard's screens, one per role, built from pocket mode's panels for now: the CEO (chat and approvals), the
// developer (the board and the team), the reviewer (the floor's PRs; the real review panel comes later), metrics (each
// floor's pipeline) and settings (the manager's console sections and this device).
import { useEffect } from 'react';
import { qaKey, useStore } from '../store';
import { CEO_ID, type PullInfo, type QaView, type RepoView } from '../../../shared/types';
import { qaCardNote } from '../qaCard';
import { NotifySettings } from '../ui/NotifySettings';
import { AccessibilitySettings } from '../ui/AccessibilitySettings';
import { CloudSettings } from '../ui/CloudSettings';
import { VoiceSettings } from '../ui/VoiceSettings';
import { FloorsTab, IssuesTab, OfficeUpdate, SettingsCards, TeamTab } from '../ui/consoleSections';
import { Chat } from '../ui/Phone';
import { setMode } from '../pocket/mode';
import { Board, Company, type PocketTab } from '../pocket/Pocket';
import { Approvals } from '../pocket/PocketApprovals';
import { Team } from '../pocket/PocketTeam';
import { DevBoard } from './DevBoard';
import { Drawer } from './Drawer';
import { routeFromTab, SETTINGS_TABS, type CeoPane, type DevView, type Route, type SettingsTab } from './route';

type Go = (r: Route) => void;

const shortName = (fullName: string) => fullName.split('/')[1] ?? fullName;

export function openOffice() {
  useStore.getState().openOverlay(null);
  setMode('office');
}

/** Sub-screens of a role, as chips (on narrow screens the CEO's panes, always the developer's and settings' views). */
function Chips<T extends string>({ items, on, pick, label, className }: { items: [T, string][]; on: T; pick: (k: T) => void; label: string; className?: string }) {
  return (
    <div className={`pk-chips ${className ?? ''}`} role="tablist" aria-label={label}>
      {items.map(([k, text]) => (
        <button key={k} role="tab" aria-selected={k === on} className={`pk-chip ${k === on ? 'pk-chip-on' : ''}`} onClick={() => pick(k)}>
          {text}
        </button>
      ))}
    </div>
  );
}

// ---------- CEO ----------

export function CeoScreen({ pane, go }: { pane: CeoPane; go: Go }) {
  const ceoName = useStore((s) => s.agents[CEO_ID]?.name ?? 'CEO');
  // While the chat is on screen, new CEO messages don't toast (the store reads this as the phone's chat being open).
  useEffect(() => {
    const s = useStore.getState();
    s.openOverlay({ kind: 'phone', tab: 'chat' });
    return () => {
      if (useStore.getState().overlay?.kind === 'phone') useStore.getState().openOverlay(null);
    };
  }, []);
  return (
    <div className="dash-ceo">
      <Chips
        className="dash-narrow-only dash-chips-pad"
        label="CEO"
        items={[
          ['chat', `💬 ${ceoName}`],
          ['approvals', '✋ Approvals'],
        ]}
        on={pane}
        pick={(p) => go({ role: 'ceo', pane: p })}
      />
      <section className={`dash-ceo-chat ${pane === 'chat' ? '' : 'dash-pane-off'}`} aria-label={`Chat with ${ceoName}`}>
        <Chat autoFocus={false} />
      </section>
      <section className={`dash-ceo-side ${pane === 'approvals' ? '' : 'dash-pane-off'}`} aria-label="Approvals">
        <Approvals />
      </section>
    </div>
  );
}

// ---------- developer ----------

export function DevScreen({ floor, view, go }: { floor: number | null; view: DevView; go: Go }) {
  const repos = useStore((s) => s.repos);
  const repo = floor === null ? null : (repos.find((r) => r.floor === floor) ?? null);
  const views: [DevView, string][] = [
    ['board', '📋 Board'],
    ['terminals', '👥 Team & terminals'],
  ];
  return (
    <div className="dash-dev">
      <Chips className="dash-chips-pad" label="Developer view" items={views} on={view} pick={(v) => go({ role: 'dev', floor, view: v })} />
      {floor !== null && !repo && <p className="muted pk-page">There's no floor {floor}. Pick another floor above.</p>}
      {view === 'board' && repo && <DevBoard key={repo.id} repo={repo} />}
      {view === 'board' && floor === null && (
        <div className="dash-dev-split">
          <div className="dash-dev-board">
            <Board repoId={null} pick={(id) => go({ role: 'dev', floor: repos.find((r) => r.id === id)?.floor ?? null, view })} />
          </div>
          <div className="dash-dev-team">
            <Team focusRepo={null} />
          </div>
        </div>
      )}
      {/* The terminals grid is a later issue: for now the team, each agent with its terminal. */}
      {view === 'terminals' && (floor === null || repo) && <Team focusRepo={repo?.id ?? null} />}
    </div>
  );
}

// ---------- reviewer ----------

interface PrRow {
  repo: RepoView;
  pr: PullInfo;
  qa: QaView | undefined;
}

function openPrs(repos: RepoView[], qa: Record<string, QaView>, floor: number | null): PrRow[] {
  return repos
    .filter((r) => floor === null || r.floor === floor)
    .flatMap((repo) => repo.pulls.filter((pr) => pr.state === 'OPEN').map((pr) => ({ repo, pr, qa: qa[qaKey(repo.id, pr.number)] })));
}

const QA_TEXT: Record<QaView['status'], string> = {
  queued: '⏳ waiting for QA',
  testing: '🔍 in QA',
  passed: '✅ passed QA',
  failed: '❌ failed QA',
  fixing: '🔧 being fixed',
  'needs-human': '⚠️ needs you',
};

function PrDetails({ row }: { row: PrRow }) {
  const { repo, pr, qa } = row;
  const { note } = qaCardNote(qa, pr, repo.autoMerge);
  return (
    <div className="dash-pr">
      <p>
        <b>{pr.title}</b>
      </p>
      <p className="muted small">
        Floor {repo.floor} · {shortName(repo.fullName)} · <code>{pr.headRefName}</code> · +{pr.additions} −{pr.deletions}
      </p>
      <p className="small">
        {qa ? `${QA_TEXT[qa.status]} (round ${qa.round})` : 'Not tested yet'} · checks {pr.checks}
        {pr.isDraft ? ' · draft' : ''}
      </p>
      {note && <p className="small">{note}</p>}
      {qa?.summary && <p className="small pk-pr-summary">{qa.summary}</p>}
      <a className="btn btn-small" href={pr.url} target="_blank" rel="noreferrer">
        Open on GitHub ↗
      </a>
    </div>
  );
}

/** A placeholder until the review panel: the open PRs from the snapshot, one opening in the drawer. */
export function ReviewScreen({ floor, pr, go }: { floor: number | null; pr: number | null; go: Go }) {
  const repos = useStore((s) => s.repos);
  const qa = useStore((s) => s.qa);
  const rows = openPrs(repos, qa, floor);
  const open = pr === null ? null : (rows.find((r) => r.pr.number === pr) ?? null);
  return (
    <div className="pk-page">
      <h2 className="pk-h">🔍 Open PRs {floor === null ? 'on every floor' : `on floor ${floor}`}</h2>
      {rows.length === 0 && <p className="pk-empty muted">No open PRs here.</p>}
      {rows.map(({ repo, pr: p, qa: q }) => (
        <button
          key={`${repo.id}#${p.number}`}
          className={`pk-card dash-pr-row ${open?.repo.id === repo.id && open.pr.number === p.number ? 'dash-pr-row-on' : ''}`}
          style={{ ['--accent' as string]: repo.color }}
          onClick={() => go({ role: 'review', floor: floor ?? repo.floor, pr: p.number })}
        >
          <span className="floor-badge">{repo.floor}</span>
          <span className="grow">
            <b>#{p.number}</b> {p.title}
            <span className="muted small dash-pr-sub">{q ? QA_TEXT[q.status] : 'not tested yet'} · checks {p.checks}</span>
          </span>
        </button>
      ))}
      {pr !== null && (
        <Drawer title={`PR #${pr}`} onClose={() => go({ role: 'review', floor, pr: null })}>
          {open ? <PrDetails row={open} /> : <p className="muted">PR #{pr} isn't open {floor === null ? 'on any floor' : `on floor ${floor}`} right now.</p>}
        </Drawer>
      )}
    </div>
  );
}

// ---------- metrics ----------

export function MetricsScreen({ go }: { go: Go }) {
  const repos = useStore((s) => s.repos);
  const fromPocket = (tab: PocketTab, repoId?: string) => {
    const r = routeFromTab(tab, repos.find((x) => x.id === repoId)?.floor ?? null);
    if (r) go(r);
  };
  return <Company go={fromPocket} banners={false} />;
}

// ---------- settings ----------

const SETTINGS_LABELS: Record<SettingsTab, string> = {
  floors: '🏢 Floors & repos',
  team: '👩‍💻 Team',
  issues: '📝 Issues',
  office: '⚙️ Office',
  notifications: '🔔 Notifications',
  cloud: '☁ Cloud',
  voice: '🔊 Voice',
  accessibility: '♿ Accessibility',
};

/** Settings: the manager's console sections the dashboard keeps, one per chip (ui/consoleSections.tsx), and this device's. */
export function SettingsScreen({ tab, go }: { tab: SettingsTab; go: Go }) {
  const version = useStore((s) => s.version);
  const visit = (floor: number) => go({ role: 'dev', floor, view: 'board' });
  return (
    <div className="pk-page dash-settings">
      <Chips label="Settings" items={SETTINGS_TABS.map((t) => [t, SETTINGS_LABELS[t]])} on={tab} pick={(t) => go({ role: 'settings', tab: t })} />
      {tab === 'floors' && <FloorsTab onVisit={visit} withOffice={false} />}
      {tab === 'team' && <TeamTab />}
      {tab === 'issues' && <IssuesTab />}
      {tab === 'office' && (
        <div className="tab-grid">
          <OfficeUpdate />
          <SettingsCards />
          <div className="card">
            <h3>🏢 The 3D office</h3>
            <p className="muted small">
              This dashboard is the office without the 3D building. The 3D office is still here: open it below, or add <code>?office=3d</code> to the address. This device remembers what you last chose.
            </p>
            <button className="btn" onClick={openOffice}>
              🏢 Open the 3D office
            </button>
            {version && <p className="muted small">cubefarm {version}</p>}
          </div>
        </div>
      )}
      {tab === 'notifications' && <NotifySettings />}
      {tab === 'cloud' && <CloudSettings />}
      {tab === 'voice' && <VoiceSettings />}
      {tab === 'accessibility' && <AccessibilitySettings pocket />}
    </div>
  );
}
