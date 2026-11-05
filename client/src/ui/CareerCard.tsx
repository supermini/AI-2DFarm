// Careers (#226) in the 3D office: an agent's career card (portrait, rank, badges, stats, last merged PRs and what
// they're known for) and the card that pops up when you look at a desk for a moment. 3D-only (the portrait reaches
// world/): the 2D views get the Team tab's table from TeamStats.tsx.
import { useEffect, useRef, useState } from 'react';
import { avgFixRounds, knownFor, passRate, rank } from '../../../shared/careers';
import { useStore, type Agent } from '../store';
import { drawPortrait } from './portrait';
import { fixed1, pct, tenureText } from './TeamStats';

const PEEK_MS = 700;
const LAST = 5;

function ago(at: number, now: number) {
  const m = Math.max(0, Math.round((now - at) / 60_000));
  if (m < 60) return m <= 1 ? 'just now' : `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  return `${Math.round(h / 24)} d ago`;
}

function Portrait({ agent, size }: { agent: Agent; size: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const ctx = ref.current?.getContext('2d');
    if (ctx) drawPortrait(ctx, size * 2, agent);
  }, [agent.id, agent.look, agent.role, agent.color, agent.hair, agent.skin, size]); // eslint-disable-line react-hooks/exhaustive-deps
  return <canvas ref={ref} className="career-portrait" width={size * 2} height={size * 2} style={{ width: size, height: size }} aria-label={`${agent.name}'s portrait`} />;
}

function Stat({ label, value, title }: { label: string; value: string | number; title?: string }) {
  return (
    <div className="career-stat" title={title}>
      <b>{value}</b>
      <span>{label}</span>
    </div>
  );
}

export function CareerCard({ agent, compact = false }: { agent: Agent; compact?: boolean }) {
  const repo = useStore((s) => s.repos.find((r) => r.id === agent.repoId));
  const now = Date.now();
  const c = agent.career;
  if (!c) return <div className="career-card muted small">{agent.name} runs the company; their record is the whole office.</div>;
  return (
    <div className={`career-card ${compact ? 'career-compact' : ''}`} style={{ ['--accent' as string]: agent.color }}>
      <div className="career-head">
        <Portrait agent={agent} size={compact ? 44 : 88} />
        <div className="career-who">
          <div className="career-name">{agent.name}</div>
          <div className="career-title">
            {rank(c)}
            {repo ? ` · floor ${repo.floor}` : ''}
          </div>
          {c.firstPass >= 10 && (
            <div className="career-badges">
              <span className="career-badge career-star">⭐ 10 first-time passes</span>
            </div>
          )}
          <div className="career-known">“{knownFor(c)}”</div>
        </div>
      </div>
      <div className="career-stats">
        <Stat label="PRs merged" value={c.merged} />
        <Stat label="PRs opened" value={c.opened} />
        <Stat label="first-time QA" value={c.firstPass} title="PRs that passed QA on their first round" />
        <Stat label="QA pass rate" value={pct(passRate(c))} title={`${c.qaPass} of ${c.qaPass + c.qaFail} QA rounds on their PRs passed`} />
        <Stat label="fix rounds / PR" value={fixed1(avgFixRounds(c))} />
        <Stat label="QA reviews" value={c.reviews} />
        <Stat label="longest streak" value={c.best} title="PRs in a row that passed QA first time" />
        <Stat label="on the team" value={tenureText(c, now)} />
        {!compact && <Stat label="est. cost" value={`$${c.costUsd.toFixed(2)}`} title="What the coding agents report, API-equivalent; subscription usage is billed by plan" />}
        {!compact && <Stat label="turns" value={c.turns} />}
      </div>
      {c.recent.length > 0 && (
        <div className="career-recent">
          {!compact && <div className="muted small">Last merged</div>}
          {c.recent.slice(0, compact ? 1 : LAST).map((r) => (
            <div key={r.n} className="career-pr">
              {compact && <span className="muted">Last merged </span>}
              {repo ? (
                <a href={`https://github.com/${repo.fullName}/pull/${r.n}`} target="_blank" rel="noreferrer">
                  #{r.n}
                </a>
              ) : (
                <b>#{r.n}</b>
              )}{' '}
              <span className="career-pr-title">{r.title || 'untitled'}</span> <span className="muted">{ago(r.at, now)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** Look at someone's desk for a moment and their card pops up at the left edge, under the hover card. */
export function CareerPeek() {
  const id = useStore((s) => (s.focus?.id.startsWith('agent-') ? s.focus.id.slice(6) : null));
  const agent = useStore((s) => (id ? s.agents[id] : undefined));
  const overlay = useStore((s) => s.overlay);
  const [shown, setShown] = useState<string | null>(null);
  useEffect(() => {
    if (!id) return setShown(null);
    const t = setTimeout(() => setShown(id), PEEK_MS);
    return () => clearTimeout(t);
  }, [id]);
  if (!agent || shown !== agent.id || overlay || !agent.career) return null;
  return (
    <div className="career-peek" aria-live="polite">
      <CareerCard agent={agent} compact />
    </div>
  );
}
