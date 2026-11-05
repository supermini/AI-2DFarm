// Which office this device gets: the 2D dashboard (client/src/dashboard/, which is also pocket mode on a phone;
// docs/pocket.md) or the 3D one. The dashboard is the default everywhere; the 3D office is an explicit opt-in:
// ?office=3d (or the old ?pocket=0) for one visit, or "Open the 3D office" in the app, remembered on this device.
// ?pocket=1 still asks for the 2D view. A device that remembered "pocket" gets the dashboard.
import { create } from 'zustand';

export type ViewMode = 'dashboard' | 'office';

const KEY = 'cubefarm:mode';

/** The mode to start in: the URL's say (?office=3d, then ?pocket), then this device's last choice, then the dashboard. */
export function pickMode(x: { office: string | null; pocket: string | null; saved: string | null }): ViewMode {
  if (x.office === '3d') return 'office';
  if (x.office === '2d') return 'dashboard';
  if (x.pocket !== null) return x.pocket === '0' || x.pocket === 'false' ? 'office' : 'dashboard';
  return x.saved === 'office' ? 'office' : 'dashboard';
}

function startMode(): ViewMode {
  let saved: string | null = null;
  try {
    saved = localStorage.getItem(KEY);
  } catch {
    // no storage: the default
  }
  const q = new URLSearchParams(location.search);
  return pickMode({ office: q.get('office'), pocket: q.get('pocket'), saved });
}

export const useMode = create<{ mode: ViewMode }>(() => ({ mode: typeof window === 'undefined' ? 'dashboard' : startMode() }));

/** Switches this device to `mode` and remembers it ('pocket' is the dashboard's old name). */
export function setMode(mode: ViewMode | 'pocket') {
  const m: ViewMode = mode === 'pocket' ? 'dashboard' : mode;
  try {
    localStorage.setItem(KEY, m);
  } catch {
    // remembered for this visit only
  }
  useMode.setState({ mode: m });
}
