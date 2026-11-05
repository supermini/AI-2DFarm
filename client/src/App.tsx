import { lazy, Suspense } from 'react';
import { useMode } from './pocket/mode';
import { Captions, LiveRegions } from './ui/CaptionStrip';
import { ConfirmDialog } from './ui/Confirm';

// Each loads only when it's shown: the dashboard (the default, pocket mode on a phone) never fetches three.js; the
// 3D office loads only on ?office=3d or when chosen in the app (pocket/mode.ts).
const Office = lazy(() => import('./Office'));
const Dashboard = lazy(() => import('./dashboard/Shell'));

export function App() {
  const mode = useMode((s) => s.mode);
  return (
    <>
      <Suspense fallback={<div className="app-loading">Loading the office…</div>}>{mode === 'office' ? <Office /> : <Dashboard />}</Suspense>
      <ConfirmDialog />
      <Captions />
      <LiveRegions />
    </>
  );
}
