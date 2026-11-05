// The dashboard's screens, one per role, built from pocket mode's panels for now: the CEO (chat and approvals), the
// developer (the board and the team), the reviewer (ReviewPanel.tsx), metrics (each
// floor's pipeline) and settings (the manager's console sections and this device).
import { useStore } from '../store';
import { NotifySettings } from '../ui/NotifySettings';
import { AccessibilitySettings } from '../ui/AccessibilitySettings';
import { CloudSettings } from '../ui/CloudSettings';
import { VoiceSettings } from '../ui/VoiceSettings';
import { FloorsTab, IssuesTab, OfficeUpdate, SettingsCards, TeamTab } from '../ui/consoleSections';
import { OFFICE_3D, setMode } from '../pocket/mode';
import { Board } from '../pocket/Pocket';
import { Team } from '../pocket/PocketTeam';
import { CeoPanel } from './CeoPanel';
import { DevBoard } from './DevBoard';
import { MetricsPanel } from './MetricsPanel';
import { ReviewPanel } from './ReviewPanel';
import { TerminalGrid } from './TerminalGrid';
import { SETTINGS_TABS, type CeoPane, type DevView, type Route, type SettingsTab } from './route';

type Go = (r: Route) => void;

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
  return <CeoPanel pane={pane} go={go} />;
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
      {view === 'terminals' && (floor === null || repo) && <TerminalGrid key={repo?.id ?? 'all'} repoId={repo?.id ?? null} />}
    </div>
  );
}

// ---------- reviewer ----------

export function ReviewScreen({ floor, pr, go }: { floor: number | null; pr: number | null; go: Go }) {
  return <ReviewPanel floor={floor} pr={pr} go={go} />;
}

// ---------- metrics ----------

export function MetricsScreen() {
  return <MetricsPanel />;
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
          {OFFICE_3D ? (
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
          ) : (
            version && <p className="muted small">cubefarm {version}</p>
          )}
        </div>
      )}
      {tab === 'notifications' && <NotifySettings />}
      {tab === 'cloud' && <CloudSettings />}
      {tab === 'voice' && <VoiceSettings />}
      {tab === 'accessibility' && <AccessibilitySettings pocket />}
    </div>
  );
}
