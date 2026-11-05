// The 2D dashboard's hash routes (pure): which role's screen is open, on which floor, and what it focuses. A floor of
// null is "all floors". Notifications link to `/?tab=<pocket tab>` (shared/notify.ts noteTab); routeFromLink maps them.

export type Role = 'ceo' | 'dev' | 'review' | 'metrics' | 'settings';
export const ROLES: Role[] = ['ceo', 'dev', 'review', 'metrics', 'settings'];

export type CeoPane = 'chat' | 'approvals';
export type DevView = 'board' | 'terminals';
export const SETTINGS_TABS = ['notifications', 'accessibility', 'office'] as const;
export type SettingsTab = (typeof SETTINGS_TABS)[number];

export type Route =
  | { role: 'ceo'; pane: CeoPane }
  | { role: 'dev'; floor: number | null; view: DevView }
  | { role: 'review'; floor: number | null; pr: number | null }
  | { role: 'metrics' }
  | { role: 'settings'; tab: SettingsTab };

export const DEFAULT_ROUTE: Route = { role: 'ceo', pane: 'chat' };

/** A positive whole number, or null. */
function positive(s: string | undefined): number | null {
  if (!s || !/^\d+$/.test(s)) return null;
  const n = Number(s);
  return n > 0 ? n : null;
}

/** The route a location hash names (`#/dev/2`); anything it can't read becomes the default, or that part's default. */
export function parseRoute(hash: string): Route {
  const [head, ...rest] = hash.replace(/^#/, '').split('/').filter(Boolean);
  switch (head) {
    case 'ceo':
      return { role: 'ceo', pane: rest[0] === 'approvals' ? 'approvals' : 'chat' };
    case 'dev':
      return { role: 'dev', floor: positive(rest[0]), view: rest[1] === 'terminals' ? 'terminals' : 'board' };
    case 'review':
      return { role: 'review', floor: positive(rest[0]), pr: positive(rest[1]) };
    case 'metrics':
      return { role: 'metrics' };
    case 'settings':
      return { role: 'settings', tab: SETTINGS_TABS.includes(rest[0] as SettingsTab) ? (rest[0] as SettingsTab) : SETTINGS_TABS[0] };
    default:
      return DEFAULT_ROUTE;
  }
}

/** The hash for a route; parseRoute(formatRoute(r)) is r. */
export function formatRoute(r: Route): string {
  const floor = (f: number | null) => (f === null ? 'all' : String(f));
  switch (r.role) {
    case 'ceo':
      return r.pane === 'chat' ? '#/ceo' : `#/ceo/${r.pane}`;
    case 'dev':
      if (r.view === 'terminals') return `#/dev/${floor(r.floor)}/terminals`;
      return r.floor === null ? '#/dev' : `#/dev/${r.floor}`;
    case 'review':
      if (r.pr !== null) return `#/review/${floor(r.floor)}/${r.pr}`;
      return r.floor === null ? '#/review' : `#/review/${r.floor}`;
    case 'metrics':
      return '#/metrics';
    case 'settings':
      return `#/settings/${r.tab}`;
  }
}

/** The route for a pocket tab (a notification's `?tab=`), on `floor` when it's about one; null for an unknown tab. */
export function routeFromTab(tab: string | null | undefined, floor: number | null = null): Route | null {
  switch (tab) {
    case 'chat':
      return { role: 'ceo', pane: 'chat' };
    case 'approvals':
      return { role: 'ceo', pane: 'approvals' };
    case 'kanban':
      return { role: 'dev', floor, view: 'board' };
    case 'team':
      return { role: 'dev', floor, view: 'terminals' };
    case 'company':
      return { role: 'metrics' };
    default:
      return null;
  }
}

/** The route a link asks for: its hash if it has a route there, else its `?tab=`; null when it asks for neither. */
export function routeFromLink(url: string | null | undefined, origin: string): Route | null {
  if (!url) return null;
  let u: URL;
  try {
    u = new URL(url, origin);
  } catch {
    return null;
  }
  if (u.hash.replace(/^#\/?/, '')) return parseRoute(u.hash);
  return routeFromTab(u.searchParams.get('tab'));
}

/** Where a role's rail button goes, on the picked floor. */
export function roleRoute(role: Role, floor: number | null): Route {
  switch (role) {
    case 'ceo':
      return { role, pane: 'chat' };
    case 'dev':
      return { role, floor, view: 'board' };
    case 'review':
      return { role, floor, pr: null };
    case 'metrics':
      return { role };
    case 'settings':
      return { role, tab: SETTINGS_TABS[0] };
  }
}

/** The route on another floor (the floor picker); a PR belongs to its floor, so it's dropped when the floor changes. */
export function withFloor(r: Route, floor: number | null): Route {
  if (r.role === 'dev') return { ...r, floor };
  if (r.role === 'review') return { ...r, floor, pr: r.floor === floor ? r.pr : null };
  return r;
}

/** The floor a route is on (null: all floors), or undefined for a role without floors. */
export function routeFloor(r: Route): number | null | undefined {
  return r.role === 'dev' || r.role === 'review' ? r.floor : undefined;
}
