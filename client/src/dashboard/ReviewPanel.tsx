// The reviewer's screen: the PR queue on the left (grouped by where each PR stands, review.ts) and the picked PR on the
// right, as tabs. Report: QA's summary, its checks and a link to the PR comment. Screenshots: QA's shots, click to
// enlarge. Below 760px it is the queue, then the detail with a way back. Later tabs (the PR's app, its actions) join
// DETAIL_TABS.
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import type { PullInfo, QaCheck, QaView } from '../../../shared/types';
import { qaCardNote } from '../qaCard';
import { recentQaRecord } from '../qaRecord';
import { qaKey, useStore, type Agent } from '../store';
import { QA_BADGE, qaShotUrl } from '../ui/channels';
import { topDialog, useDialogFocus } from '../ui/dialogFocus';
import { Markdown } from '../ui/Markdown';
import { StatusPill } from '../ui/TerminalView';
import { findReviewItem, reviewAgents, reviewCounts, reviewQueue, type ReviewItem } from './review';
import type { Route } from './route';
import './review.css';

type Go = (r: Route) => void;

const CHECKS_LABEL: Record<PullInfo['checks'], string> = { passing: '✅ CI passing', failing: '❌ CI failing', pending: '⏳ CI running', none: 'no CI' };
const CI_SHORT: Record<PullInfo['checks'], string> = { passing: '✅ CI', failing: '❌ CI', pending: '⏳ CI', none: '— CI' };
const CHECK_ICON: Record<QaCheck['result'], string> = { pass: '✅', fail: '❌', skip: '⏭️' };

/** What the row and the header say under the pill: when it merged, or the QA card's note (with QA's mergeNote). */
function prNote(item: ReviewItem): string {
  const { pr, qa, repo } = item;
  if (pr.state === 'MERGED') return pr.mergedAt ? `merged at ${new Date(pr.mergedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : 'merged';
  return qaCardNote(qa, pr, repo.autoMerge).note;
}

/** A remembered record of a PR that has merged: its screenshots are deleted with the merge, so none are offered. */
const withoutShots = (q: QaView | undefined): QaView | undefined => (q ? { ...q, shots: undefined } : undefined);

const shortName = (fullName: string) => fullName.split('/')[1] ?? fullName;

/** A PR's QA verdict as a pill (the Kanban and the app viewer's wording); a merged PR says so. */
function QaPill({ qa, merged }: { qa: Pick<QaView, 'status'> | undefined; merged?: boolean }) {
  if (merged) return <span className="qa-badge qa-badge-passed">🎉 merged</span>;
  return qa ? <span className={`qa-badge qa-badge-${qa.status}`}>{QA_BADGE[qa.status]}</span> : <span className="qa-badge">not tested yet</span>;
}

// ---------- the detail's tabs ----------

interface TabCtx {
  item: ReviewItem;
  dev: Agent | null;
  tester: Agent | null;
}
interface DetailTab {
  key: string;
  label: (item: ReviewItem) => string;
  render: (ctx: TabCtx) => ReactNode;
}

const DETAIL_TABS: DetailTab[] = [
  { key: 'report', label: () => '📋 Report', render: (c) => <ReportTab {...c} /> },
  { key: 'shots', label: (i) => `🖼 Screenshots${i.qa?.shots?.length ? ` (${i.qa.shots.length})` : ''}`, render: (c) => <ShotsTab {...c} /> },
];

function ReportTab({ item }: TabCtx) {
  const { pr, qa } = item;
  return (
    <div className="rv-report">
      {pr.failedChecks.length > 0 && (
        <ul className="qa-failed small" aria-label="Failing CI checks">
          {pr.failedChecks.map((c) => (
            <li key={c.name}>
              {c.url ? (
                <a href={c.url} target="_blank" rel="noreferrer">
                  ❌ {c.name}
                </a>
              ) : (
                `❌ ${c.name}`
              )}
            </li>
          ))}
        </ul>
      )}
      {!qa ? (
        <p className="muted">{pr.state === 'MERGED' ? "QA's report isn't kept in the office once a PR has merged. The PR on GitHub has it." : "QA hasn't tested this PR yet."}</p>
      ) : (
        <>
          {qa.summary ? <Markdown className="qa-summary" text={qa.summary} /> : <p className="muted">{qa.status === 'testing' ? 'QA is testing it now.' : 'No QA report yet.'}</p>}
          {qa.checks.length > 0 && (
            <>
              <h3 className="rv-sub">Checks</h3>
              <ul className="qa-checks">
                {qa.checks.map((c, i) => (
                  <li key={i} className={`qa-check qa-check-${c.result}`}>
                    <span role="img" aria-label={c.result}>
                      {CHECK_ICON[c.result]}
                    </span>
                    <div>
                      <b>{c.name}</b>
                      {c.details && <div className="muted small">{c.details}</div>}
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}
          {qa.commentUrl && (
            <a className="btn btn-small rv-link" href={qa.commentUrl} target="_blank" rel="noreferrer">
              Full report on GitHub ↗
            </a>
          )}
        </>
      )}
    </div>
  );
}

function ShotsTab({ item }: TabCtx) {
  const { repo, pr, qa } = item;
  const shots = qa?.shots ?? [];
  const [big, setBig] = useState<number | null>(null);
  if (!qa || shots.length === 0) {
    const why = pr.state === 'MERGED' ? "QA's screenshots aren't kept once a PR has merged." : qa?.status === 'testing' ? 'QA is testing it; screenshots appear when it is done.' : 'QA took no screenshots of this PR.';
    return <p className="muted">{why}</p>;
  }
  const src = (i: number) => qaShotUrl(repo.id, pr.number, i, qa.updatedAt);
  return (
    <>
      <ul className="rv-shots">
        {shots.map((s, i) => (
          <li key={i}>
            <button className="rv-shot" onClick={() => setBig(i)} title={s.page ?? s.caption} aria-label={`Enlarge: ${s.caption}`}>
              <img src={src(i)} alt={s.caption} loading="lazy" />
              <span className="small">{s.caption}</span>
              {s.page && <span className="muted small">{s.page}</span>}
            </button>
          </li>
        ))}
      </ul>
      {big !== null && shots[big] && (
        <Lightbox
          src={src(big)}
          caption={shots[big].caption}
          page={shots[big].page}
          position={`${big + 1} / ${shots.length}`}
          onStep={shots.length > 1 ? (d) => setBig((big + d + shots.length) % shots.length) : undefined}
          onClose={() => setBig(null)}
        />
      )}
    </>
  );
}

/** One screenshot enlarged, with its caption and page. Esc closes, arrows step through the others. */
function Lightbox({ src, caption, page, position, onStep, onClose }: { src: string; caption: string; page: string | null; position: string; onStep?: (d: -1 | 1) => void; onClose: () => void }) {
  const box = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useDialogFocus(box);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (topDialog() !== box.current) return;
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowLeft' && onStep) onStep(-1);
      else if (e.key === 'ArrowRight' && onStep) onStep(1);
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, onStep]);
  return (
    <div className="rv-lightbox" onClick={onClose}>
      <div ref={box} className="rv-lightbox-box" role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} onClick={(e) => e.stopPropagation()}>
        <div className="rv-lightbox-head">
          <b id={titleId} className="grow">
            {caption}
          </b>
          <span className="muted small">{position}</span>
          {onStep && (
            <>
              <button className="btn btn-small" onClick={() => onStep(-1)} aria-label="Previous screenshot">
                ←
              </button>
              <button className="btn btn-small" onClick={() => onStep(1)} aria-label="Next screenshot">
                →
              </button>
            </>
          )}
          <button className="panel-x" onClick={onClose} aria-label="Close (Esc)" title="Close (Esc)">
            ✕
          </button>
        </div>
        {page && <p className="muted small rv-lightbox-page">{page}</p>}
        <img src={src} alt={caption} />
      </div>
    </div>
  );
}

// ---------- the detail ----------

function Detail({ item, agents, go, floor }: { item: ReviewItem; agents: Agent[]; go: Go; floor: number | null }) {
  const { repo, pr, qa } = item;
  const [tab, setTab] = useState(DETAIL_TABS[0].key);
  const { dev, qa: tester } = reviewAgents(qa, pr, agents);
  const note = prNote(item);
  const active = DETAIL_TABS.find((t) => t.key === tab) ?? DETAIL_TABS[0];
  const base = useId();
  return (
    <div className="rv-detail-in">
      <button className="btn btn-small rv-back" onClick={() => go({ role: 'review', floor, pr: null })}>
        ← Queue
      </button>
      <header className="rv-head" style={{ ['--accent' as string]: repo.color }}>
        <h2 className="rv-title">
          <span className="floor-badge">{repo.floor}</span> <span>#{pr.number}</span> {pr.title}
        </h2>
        <div className="rv-meta small">
          <QaPill qa={qa} merged={pr.state === 'MERGED'} />
          {qa && <span className="muted">round {qa.round}</span>}
          <span>{note}</span>
        </div>
        <div className="rv-meta small muted">
          <span>
            {shortName(repo.fullName)} · <code>{pr.headRefName}</code> · +{pr.additions} −{pr.deletions}
            {pr.isDraft ? ' · draft' : ''}
          </span>
          <a href={`${pr.url}/checks`} target="_blank" rel="noreferrer">
            {CHECKS_LABEL[pr.checks]}
          </a>
          <a href={pr.url} target="_blank" rel="noreferrer">
            Open on GitHub ↗
          </a>
        </div>
        <div className="rv-meta small">
          {dev && (
            <span>
              Built by <b>{dev.name}</b> <StatusPill status={dev.status} />
            </span>
          )}
          {tester && (
            <span>
              Tested by <b>{tester.name}</b> <StatusPill status={tester.status} />
            </span>
          )}
        </div>
      </header>
      <div className="pk-chips rv-tabs" role="tablist" aria-label="PR details">
        {DETAIL_TABS.map((t) => (
          <button key={t.key} id={`${base}-${t.key}`} role="tab" aria-selected={t.key === active.key} aria-controls={`${base}-panel`} className={`pk-chip ${t.key === active.key ? 'pk-chip-on' : ''}`} onClick={() => setTab(t.key)}>
            {t.label(item)}
          </button>
        ))}
      </div>
      <section id={`${base}-panel`} role="tabpanel" aria-labelledby={`${base}-${active.key}`} className="rv-panel">
        {active.render({ item, dev, tester })}
      </section>
    </div>
  );
}

// ---------- the queue ----------

function Row({ item, on, agents, pick }: { item: ReviewItem; on: boolean; agents: Agent[]; pick: () => void }) {
  const { repo, pr, qa } = item;
  const { dev, qa: tester } = reviewAgents(qa, pr, agents);
  const note = prNote(item);
  // `note` folds in QA's mergeNote ("waiting for checks: Vercel") where it still means something.
  return (
    <li>
      <button className={`rv-row ${on ? 'rv-row-on' : ''}`} style={{ ['--accent' as string]: repo.color }} aria-current={on ? 'true' : undefined} onClick={pick}>
        <span className="rv-row-top">
          <span className="floor-badge" title={repo.fullName}>
            {repo.floor}
          </span>
          <b>#{pr.number}</b>
          <span className="rv-row-title">{pr.title}</span>
        </span>
        <span className="rv-row-mid">
          <QaPill qa={qa} merged={pr.state === 'MERGED'} />
          {qa && <span className="muted small">R{qa.round}</span>}
          <span className={`rv-ci rv-ci-${pr.checks}`}>{CI_SHORT[pr.checks]}</span>
        </span>
        <span className="rv-row-note small">{note}</span>
        {(dev || tester) && (
          <span className="rv-row-who muted small">
            {dev && <span>✍ {dev.name}</span>}
            {tester && <span>🔍 {tester.name}</span>}
          </span>
        )}
      </button>
    </li>
  );
}

export function ReviewPanel({ floor, pr, go }: { floor: number | null; pr: number | null; go: Go }) {
  const repos = useStore((s) => s.repos);
  const qa = useStore((s) => s.qa);
  const agentMap = useStore((s) => s.agents);
  const agents = Object.values(agentMap);
  // The office drops a PR's QA record, and its screenshots, when it merges; this tab remembers the last few (qaRecord.ts) so they still read.
  const sections = reviewQueue(
    repos.filter((r) => floor === null || r.floor === floor),
    qa,
  ).map((s) => (s.group === 'merged' ? { ...s, items: s.items.map((i) => (i.qa ? i : { ...i, qa: withoutShots(recentQaRecord(qaKey(i.repo.id, i.pr.number))) })) } : s));
  const counts = reviewCounts(sections);
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const picked = findReviewItem(sections, pr);
  const select = (i: ReviewItem) => go({ role: 'review', floor: floor ?? i.repo.floor, pr: i.pr.number });

  return (
    <div className={`rv ${pr !== null ? 'rv-has-pr' : ''}`}>
      <nav className="rv-queue" aria-label="PR queue">
        <h2 className="pk-h">🔍 PR queue {floor === null ? 'on every floor' : `on floor ${floor}`}</h2>
        {total === 0 && <p className="pk-empty muted">No open PRs here, and none merged today.</p>}
        {sections.map(
          (s) =>
            s.items.length > 0 && (
              <section key={s.group} className="rv-group" aria-label={s.title}>
                <h3 className={`rv-group-h rv-group-${s.group}`}>
                  {s.title} <span className="rv-count">{s.items.length}</span>
                </h3>
                <ul className="rv-list">
                  {s.items.map((i) => (
                    <Row key={`${i.repo.id}#${i.pr.number}`} item={i} on={picked === i} agents={agents} pick={() => select(i)} />
                  ))}
                </ul>
              </section>
            ),
        )}
      </nav>
      <div className="rv-detail">
        {picked ? (
          <Detail key={`${picked.repo.id}#${picked.pr.number}`} item={picked} agents={agents} go={go} floor={floor} />
        ) : pr !== null ? (
          <div className="rv-detail-in">
            <button className="btn btn-small rv-back" onClick={() => go({ role: 'review', floor, pr: null })}>
              ← Queue
            </button>
            <p className="muted">
              PR #{pr} isn't in the queue {floor === null ? '' : `on floor ${floor} `}right now: it isn't open, or it was merged before today.
            </p>
          </div>
        ) : (
          <p className="rv-none muted">Pick a PR to see QA's report and screenshots.</p>
        )}
      </div>
    </div>
  );
}
