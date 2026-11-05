// Which agents the terminals grid shows and how it lays them out: pure, so the rules are tested apart from the tiles.
// The grid has 1, 2, 4 or 6 slots; the most it ever shows is MAX_TILES, since every tile is a live /ws/term socket.

export const MAX_TILES = 6;
/** Below this width (px) the grid shows one terminal at a time. */
export const NARROW_PX = 760;

export interface TileAgent {
  id: string;
  status: string;
  repoId: string;
  role?: string;
}

/** How many columns and rows hold `n` tiles: the next of 1, 2, 4, 6 slots (never more than MAX_TILES). */
export function gridShape(n: number): { slots: 1 | 2 | 4 | 6; cols: number; rows: number } {
  if (n <= 1) return { slots: 1, cols: 1, rows: 1 };
  if (n === 2) return { slots: 2, cols: 2, rows: 1 };
  if (n <= 4) return { slots: 4, cols: 2, rows: 2 };
  return { slots: 6, cols: 3, rows: 2 };
}

// Whoever is working or needs help is worth watching before whoever just finished, and they before whoever is free.
const RANK: Record<string, number> = { working: 0, preparing: 0, error: 1, done: 2 };

/** The agents a floor could show (every floor's when `repoId` is null); `busyFirst` puts the busy ones first. The CEO has her own place. */
export function tileCandidates(agents: readonly TileAgent[], repoId: string | null, busyFirst = true): string[] {
  return agents
    .filter((a) => a.role !== 'ceo' && (repoId === null || a.repoId === repoId))
    .map((a, i) => ({ id: a.id, rank: busyFirst ? (RANK[a.status] ?? 3) : 0, i }))
    .sort((x, y) => x.rank - y.rank || x.i - y.i)
    .map((a) => a.id);
}

/** The tiles on screen: the manager's picks that are still candidates (in the order picked), else the first candidates. */
export function selectTiles(candidates: readonly string[], picked: readonly string[] | null, cap = MAX_TILES): string[] {
  const here = new Set(candidates);
  const mine = [...new Set(picked ?? [])].filter((id) => here.has(id)).slice(0, cap);
  return mine.length ? mine : candidates.slice(0, cap);
}

/** Adds the agent to the picks or takes them out; a pick past the cap changes nothing. */
export function togglePick(current: readonly string[], id: string, cap = MAX_TILES): readonly string[] {
  if (current.includes(id)) return current.filter((x) => x !== id);
  return current.length >= cap ? current : [...current, id];
}

/** An expanded tile fills the grid by itself. */
export function tilesShown(ids: readonly string[], expanded: string | null): string[] {
  return expanded !== null && ids.includes(expanded) ? [expanded] : [...ids];
}

/** The one tile a narrow screen shows: the active one while it is still there, else the first. */
export function narrowTile(ids: readonly string[], active: string | null): string | null {
  return active !== null && ids.includes(active) ? active : (ids[0] ?? null);
}
