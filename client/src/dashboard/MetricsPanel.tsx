// The metrics screen: the manager's console as is, Mission control (usage, what needs you, the doctor's findings with
// their fixes, every floor's numbers) and the Time-lapse. While a replay plays the whole dashboard plays it back
// (replay.ts feeds store.apply), so the bar that stops it lives in the shell (Shell.tsx mounts ReplayBar).
import { useState } from 'react';
import { useStore } from '../store';
import { OpsTab } from '../ui/MissionConsole';
import { TimeLapseTab } from '../ui/TimeLapse';
import './metrics.css';

type Tab = 'ops' | 'timelapse';
const TABS: [Tab, string][] = [
  ['ops', '🛰️ Mission control'],
  ['timelapse', '📼 Time-lapse'],
];

/** Merges today and in the last hour, and the last 24 hours as bars. */
function Throughput() {
  const { mergedToday, mergedHour, spark } = useStore((s) => s.ops.total);
  const peak = Math.max(1, ...spark);
  return (
    <div className="card dash-throughput">
      <span>
        <b>{mergedToday}</b> <span className="muted small">merged today</span>
      </span>
      <span>
        <b>{mergedHour}</b> <span className="muted small">in the last hour</span>
      </span>
      <div className="dash-spark" role="img" aria-label={`Merges per hour over the last 24 hours, up to ${peak}`}>
        {spark.map((n, i) => (
          <span key={i} title={`${n} merged`} style={{ height: `${Math.max(6, (n / peak) * 100)}%`, opacity: n ? 1 : 0.25 }} />
        ))}
      </div>
    </div>
  );
}

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
      {tab === 'ops' && <Throughput />}
      {tab === 'ops' ? <OpsTab /> : <TimeLapseTab />}
    </div>
  );
}
