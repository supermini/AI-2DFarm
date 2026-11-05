// The Team tab's table of everyone's career numbers (Careers, #226), and the text helpers the career card shares.
import { useState } from 'react';
import { avgFixRounds, mergesThisWeek, passRate, tenureDays, type CareerView } from '../../../shared/careers';
import { useStore, type Agent } from '../store';

export const pct = (x: number | null) => (x === null ? '—' : `${Math.round(x * 100)}%`);
export const fixed1 = (x: number | null) => (x === null ? '—' : x.toFixed(1));

/** "3 days", "5 hours", "12 minutes" on the team. */
export function tenureText(c: CareerView, now: number) {
  const d = tenureDays(c, now);
  if (d >= 1) return `${Math.floor(d)} day${Math.floor(d) === 1 ? '' : 's'}`;
  const h = d * 24;
  if (h >= 1) return `${Math.floor(h)} hour${Math.floor(h) === 1 ? '' : 's'}`;
  const m = Math.max(1, Math.round(h * 60));
  return `${m} minute${m === 1 ? '' : 's'}`;
}

// ---------- the Team tab ----------

type Col = { key: string; label: string; title?: string; value: (a: Agent, c: CareerView, now: number) => number | string; show?: (a: Agent, c: CareerView, now: number) => string };

const COLS: Col[] = [
  { key: 'merged', label: 'Merged', value: (_a, c) => c.merged },
  { key: 'opened', label: 'Opened', value: (_a, c) => c.opened },
  { key: 'firstPass', label: '1st-time QA', title: 'PRs that passed QA on their first round', value: (_a, c) => c.firstPass },
  { key: 'rate', label: 'Pass rate', value: (_a, c) => passRate(c) ?? -1, show: (_a, c) => pct(passRate(c)) },
  { key: 'fixes', label: 'Fixes / PR', title: 'Fix rounds per merged PR', value: (_a, c) => avgFixRounds(c) ?? -1, show: (_a, c) => fixed1(avgFixRounds(c)) },
  { key: 'reviews', label: 'Reviews', title: 'QA reviews done', value: (_a, c) => c.reviews },
  { key: 'best', label: 'Streak', title: 'Longest run of PRs passing QA first time', value: (_a, c) => c.best },
  { key: 'week', label: 'This week', value: (_a, c, now) => mergesThisWeek(c, now) },
  { key: 'since', label: 'On the team', value: (_a, c) => -c.since, show: (_a, c, now) => tenureText(c, now) },
  { key: 'cost', label: 'Cost', title: 'Estimated, as the coding agents report it', value: (_a, c) => c.costUsd, show: (_a, c) => `$${c.costUsd.toFixed(2)}` },
  { key: 'turns', label: 'Turns', value: (_a, c) => c.turns },
];

/** Everyone's stats in one sortable table (click a heading; again to flip it). */
export function TeamStats() {
  const agents = useStore((s) => s.agents);
  const repos = useStore((s) => s.repos);
  const openOverlay = useStore((s) => s.openOverlay);
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 }>({ key: 'merged', dir: -1 });
  const now = Date.now();
  const col = COLS.find((c) => c.key === sort.key);
  const floor = (a: Agent) => repos.find((r) => r.id === a.repoId)?.floor ?? 0;
  const rows = Object.values(agents)
    .filter((a): a is Agent & { career: CareerView } => a.role !== 'ceo' && !!a.career)
    .sort((a, b) => {
      if (sort.key === 'name') return a.name.localeCompare(b.name) * sort.dir;
      if (sort.key === 'floor') return (floor(a) - floor(b)) * sort.dir;
      const va = col!.value(a, a.career, now);
      const vb = col!.value(b, b.career, now);
      const d = typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb));
      return d * sort.dir || a.name.localeCompare(b.name);
    });
  if (!rows.length) return null;
  const head = (key: string, label: string, title?: string) => (
    <th key={key} title={title} aria-sort={sort.key === key ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none'}>
      <button className="sort-btn" onClick={() => setSort({ key, dir: sort.key === key ? (-sort.dir as 1 | -1) : key === 'name' || key === 'floor' ? 1 : -1 })}>
        {label}
        {sort.key === key ? (sort.dir === 1 ? ' ▲' : ' ▼') : ''}
      </button>
    </th>
  );
  return (
    <div className="card team-stats">
      <div className="row">
        <b className="grow">🏅 Careers</b>
        <span className="muted small">Counted from what the office sees: PRs, QA rounds, fixes and merges. Look at a desk for a moment to see its card.</span>
      </div>
      <div className="team-stats-scroll">
        <table className="team stats-table">
          <thead>
            <tr>
              {head('name', 'Name')}
              {head('floor', 'Floor')}
              {COLS.map((c) => head(c.key, c.label, c.title))}
            </tr>
          </thead>
          <tbody>
            {rows.map((a) => (
              <tr key={a.id}>
                <td className="nowrap">
                  <span className="dot" style={{ background: a.color }} />{' '}
                  <button className="link-btn" title="Open their desk" onClick={() => openOverlay({ kind: 'terminal', agentId: a.id })}>
                    {a.name}
                  </button>
                </td>
                <td>{repos.find((r) => r.id === a.repoId)?.floor ?? '—'}</td>
                {COLS.map((c) => (
                  <td key={c.key} className="num">
                    {c.show ? c.show(a, a.career, now) : c.value(a, a.career, now)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
