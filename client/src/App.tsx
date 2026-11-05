import { lazy, Suspense } from 'react';
import { useMode } from './pocket/mode';
import { Captions, LiveRegions } from './ui/CaptionStrip';
import { ConfirmDialog } from './ui/Confirm';

// Each loads only when it's shown: the dashboard (the default, pocket mode on a phone) never fetches three.js. The 3D
// office is built only with VITE_OFFICE_3D=1: keep the comparison written out here, because the bundler drops the
// import (and the whole 3D chunk graph) only when it sees the env literal in the same expression, not through a
// shared constant like OFFICE_3D. With the flag, it loads on ?office=3d or when chosen in the app (pocket/mode.ts).
const Office = import.meta.env.VITE_OFFICE_3D === '1' ? lazy(() => import('./Office')) : null;
const Dashboard = lazy(() => import('./dashboard/Shell'));

export function App() {
  const mode = useMode((s) => s.mode);
  return (
    <>
      <Suspense fallback={<div className="app-loading">Loading the office…</div>}>{Office && mode === 'office' ? <Office /> : <Dashboard />}</Suspense>
      <ConfirmDialog />
      <Captions />
      <LiveRegions />
    </>
  );
}
