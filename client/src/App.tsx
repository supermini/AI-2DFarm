import { lazy, Suspense } from 'react';
import { Captions, LiveRegions } from './ui/CaptionStrip';
import { ConfirmDialog } from './ui/Confirm';

// Loads when shown: the dashboard's own chunk, behind the small entry.
const Dashboard = lazy(() => import('./dashboard/Shell'));

export function App() {
  return (
    <>
      <Suspense fallback={<div className="app-loading">Loading the office…</div>}><Dashboard /></Suspense>
      <ConfirmDialog />
      <Captions />
      <LiveRegions />
    </>
  );
}
