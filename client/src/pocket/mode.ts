// Which office this device gets: the 2D dashboard (client/src/dashboard/, which is also pocket mode on a phone;
// docs/pocket.md) or the 3D one. The dashboard is the default everywhere; the 3D office is an explicit opt-in:
// ?office=3d (or the old ?pocket=0) for one visit, or "Open the 3D office" in the app, remembered on this device.
// ?pocket=1 still asks for the 2D view. A device that remembered "pocket" gets the dashboard.
// The default build has no 3D office at all (OFFICE_3D below), so every one of these resolves to the dashboard.
import { create } from 'zustand';

export type ViewMode = 'dashboard' | 'office';

/** True only in a build made with `VITE_OFFICE_3D=1`. Vite replaces the env var with a literal, so a guard on it lets the bundler drop the 3D office's chunks. */
export const OFFICE_3D = import.meta.env.VITE_OFFICE_3D === '1';

const KEY = 'cubefarm:mode';

/** The mode to start in: the URL's say (?office=3d, then ?pocket), then this device's last choice, then the dashboard. Without the 3D office in the build (`has3d` false), always the dashboard. */
export function pickMode(x: { office: string | null; pocket: string | null; saved: string | null }, has3d = OFFICE_3D): ViewMode {
  if (!has3d) return 'dashboard';
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
  const m: ViewMode = mode === 'pocket' || !OFFICE_3D ? 'dashboard' : mode;
  try {
    localStorage.setItem(KEY, m);
  } catch {
    // remembered for this visit only
  }
  useMode.setState({ mode: m });
}
