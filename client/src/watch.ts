import { CEO_ID } from '../../shared/types';
import type { Watch } from '../../shared/watch';
import type { Overlay } from './store';

// What this tab shows of the agents' terminals (shared/watch.ts), from the store: the floor it's on, the agent whose
// panel is open (the CEO's in the manager's console) and whether the workers list is out. net.ts sends it on change.

export function currentWatch(s: { floor: number; overlay: Overlay | null; workersOpen: boolean }): Watch {
  const o = s.overlay;
  const agents = o?.kind === 'terminal' ? [o.agentId] : o?.kind === 'manager' ? [CEO_ID] : [];
  return { floor: s.floor, agents, workers: s.workersOpen };
}

/**
 * The dashboard's watch. `floor` is the floor its screen is on (null: all floors, or a screen without floors): a floor
 * means every line of everyone there, so all floors watches none (-1) rather than flooding the tab in a big company;
 * the screens need only the open terminals and drawers (`shown`) and, for the workers list, everyone's latest line.
 */
export function dashboardWatch(s: { floor: number | null; overlay: Overlay | null; workersOpen: boolean; shown: readonly string[] }): Watch {
  const open = currentWatch({ floor: -1, overlay: s.overlay, workersOpen: s.workersOpen }).agents;
  return { floor: s.floor ?? -1, agents: [...new Set([...open, ...s.shown])], workers: s.workersOpen };
}
