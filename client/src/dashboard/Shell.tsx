// The 2D dashboard (docs/pocket.md): the office without the 3D building, on the same store, snapshot and REST. A rail
// of roles (CEO, developer, reviewer, metrics, settings) on wide screens, icons only on medium ones and pocket mode's
// bottom tab bar on phones; a top bar with the floor picker and the office's banners; the screen the hash route names
// (route.ts); a right drawer for the context item. A fresh office shows the setup wizard first.
import { Suspense, useEffect, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useStore } from '../store';
import { Banners, PocketOverlay, Toasts } from '../pocket/Pocket';
import { SetupWizard } from '../ui/SetupWizard';
import { CeoScreen, DevScreen, MetricsScreen, ReviewScreen, SettingsScreen } from './Roles';
import { ReplayBar } from '../ui/TimeLapse';
import { ActivityFeed } from './ActivityFeed';
import { roleBadges } from './badges';
import { useShowFloor } from './visible';
import { ROLES, roleRoute, routeFloor, withFloor, type Role, type Route } from './route';
import { useRoute } from './useRoute';

const ROLE_LOOK: Record<Role, [icon: string, label: string]> = {
  ceo: ['🧠', 'CEO'],
  dev: ['🔨', 'Developer'],
  review: ['🔍', 'Reviewer'],
  metrics: ['🛰️', 'Metrics'],
  settings: ['⚙️', 'Settings'],
};

/** All floors, or one: its colour and number. */
function FloorPicker({ floor, pick }: { floor: number | null; pick: (f: number | null) => void }) {
  const repos = useStore((s) => s.repos);
  const repo = floor === null ? null : repos.find((r) => r.floor === floor);
  return (
    <label className="dash-floor" title="Floor">
      <span className="dash-floor-swatch" style={{ background: repo?.color ?? 'transparent' }} aria-hidden>
        {repo ? repo.floor : '∗'}
      </span>
      <select aria-label="Floor" value={floor === null ? '' : String(floor)} onChange={(e) => pick(e.target.value ? Number(e.target.value) : null)}>
        <option value="">All floors</option>
        {repos.map((r) => (
          <option key={r.id} value={r.floor}>
            {r.floor} · {r.fullName.split('/')[1] ?? r.fullName}
          </option>
        ))}
        {floor !== null && !repo && <option value={floor}>{floor} · (no such floor)</option>}
      </select>
    </label>
  );
}

function Screen({ route, go }: { route: Route; go: (r: Route) => void }) {
  switch (route.role) {
    case 'ceo':
      return <CeoScreen pane={route.pane} go={go} />;
    case 'dev':
      return <DevScreen floor={route.floor} view={route.view} go={go} />;
    case 'review':
      return <ReviewScreen floor={route.floor} pr={route.pr} go={go} />;
    case 'metrics':
      return <MetricsScreen />;
    case 'settings':
      return <SettingsScreen tab={route.tab} go={go} />;
  }
}

export default function Shell() {
  const [route, navigate] = useRoute();
  const company = useStore((s) => s.settings.companyName);
  const loaded = useStore((s) => s.loaded);
  const setupDone = useStore((s) => s.settings.setupDone);
  const connected = useStore((s) => s.connected);
  const usage = useStore((s) => s.usage.state);
  // The floor picked last, kept while on a role without floors so the next one opens on it.
  const [floor, setFloor] = useState<number | null>(() => routeFloor(route) ?? null);
  const onFloor = routeFloor(route);
  useEffect(() => {
    if (onFloor !== undefined) setFloor(onFloor);
  }, [onFloor]);
  // The floor on screen is the one the office sends terminal lines for (watch.ts): the picker drives it through the route.
  useShowFloor(onFloor ?? null);
  const badges = useStore(
    useShallow((s) =>
      roleBadges({ repos: s.repos, qa: s.qa, requests: s.requests, messages: s.messages, readAt: s.phoneReadAt, agents: s.agents, alarms: s.ops.alarms, doctor: s.doctor }),
    ),
  );

  useEffect(() => {
    document.title = `${company || 'cubefarm'} · dashboard`;
    return () => void (document.title = 'cubefarm');
  }, [company]);

  const go = (r: Route) => navigate(r);
  const pickFloor = (f: number | null) => {
    setFloor(f);
    if (onFloor !== undefined) navigate(withFloor(route, f));
  };
  const roleButton = (role: Role, cls: string) => {
    const [icon, label] = ROLE_LOOK[role];
    const n = badges[role];
    const on = route.role === role;
    return (
      <button key={role} className={`${cls} ${on ? `${cls}-on` : ''}`} aria-current={on ? 'page' : undefined} title={label} onClick={() => navigate(roleRoute(role, floor))}>
        <span className={`${cls}-icon`} aria-hidden>
          {icon}
          {n > 0 && <span className="badge badge-dot">{n}</span>}
        </span>
        <span className={`${cls}-label`}>{label}</span>
      </button>
    );
  };

  return (
    <div className="pocket dash">
      <div className="dash-frame">
        <nav className="dash-rail" aria-label="Roles">
          <div className="dash-rail-logo" aria-hidden>
            ✻
          </div>
          {ROLES.map((r) => roleButton(r, 'dash-role'))}
        </nav>
        <div className="dash-body">
          <header className="pk-head dash-top">
            <span className="pk-logo dash-narrow-logo" aria-hidden>
              ✻
            </span>
            <b className="pk-title">{company || 'cubefarm'}</b>
            <span className={`pk-dot ${connected ? 'pk-dot-on' : ''}`} title={connected ? 'Connected' : 'Not connected'} />
            <FloorPicker floor={floor} pick={pickFloor} />
            <span className="spacer" />
            <ActivityFeed />
            {usage !== 'normal' && <span className="chip chip-warn">{usage === 'paused' ? '⏸ paused' : '🐢 pacing'}</span>}
          </header>
          <div className="dash-banners">
            <Banners />
          </div>
          <main className={`dash-main dash-main-${route.role}`}>{loaded && <Screen route={route} go={go} />}</main>
        </div>
      </div>
      <nav className="pk-tabs dash-tabs" aria-label="Roles">
        {ROLES.map((r) => roleButton(r, 'pk-tab'))}
      </nav>
      <Toasts />
      <ReplayBar />
      <Suspense fallback={null}>
        <PocketOverlay />
      </Suspense>
      {loaded && !setupDone && <SetupWizard />}
    </div>
  );
}
