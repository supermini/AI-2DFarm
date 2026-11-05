// The metrics screen: the manager's console as is, Mission control (usage, what needs you, the doctor's findings with
// their fixes, every floor's numbers) and the Time-lapse. While a replay plays the whole dashboard plays it back
// (replay.ts feeds store.apply), so the bar that stops it lives in the shell (Shell.tsx mounts ReplayBar).
import { useState } from 'react';
import { OpsTab } from '../ui/MissionConsole';
import { TimeLapseTab } from '../ui/TimeLapse';
import './metrics.css';

type Tab = 'ops' | 'timelapse';
const TABS: [Tab, string][] = [
  ['ops', '🛰️ Mission control'],
  ['timelapse', '📼 Time-lapse'],
];

export function MetricsPanel() {
  const [tab, setTab] = useState<Tab>('ops');
  return (
    <div className="pk-page dash-metrics">
      <div className="pk-chips" role="tablist" aria-label="Metrics">
        {TABS.map(([k, text]) => (
          <button key={k} role="tab" aria-selected={k === tab} className={`pk-chip ${k === tab ? 'pk-chip-on' : ''}`} onClick={() => setTab(k)}>
            {text}
          </button>
        ))}
      </div>
      {tab === 'ops' ? <OpsTab /> : <TimeLapseTab dashboard />}
    </div>
  );
}
