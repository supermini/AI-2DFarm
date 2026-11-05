import type { Watch } from '../../shared/watch';
import type { Overlay } from './store';

// What this tab shows of the agents' terminals (shared/watch.ts), from the store: the agent whose panel is open and
// whether the workers list is out. net.ts sends it on change.

/**
 * The dashboard's watch. `floor` is the floor its screen is on (null: all floors, or a screen without floors): a floor
 * means every line of everyone there, so all floors watches none (-1) rather than flooding the tab in a big company;
 * the screens need only the open terminals and drawers (`shown`) and, for the workers list, everyone's latest line.
 */
export function dashboardWatch(s: { floor: number | null; overlay: Overlay | null; workersOpen: boolean; shown: readonly string[] }): Watch {
  const open = s.overlay?.kind === 'terminal' ? [s.overlay.agentId] : [];
  return { floor: s.floor ?? -1, agents: [...new Set([...open, ...s.shown])], workers: s.workersOpen };
}
