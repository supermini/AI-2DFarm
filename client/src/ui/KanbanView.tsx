import { useMemo, useState } from 'react';
import { api } from '../api';
import { agentsOnRepo, kanbanFor, useStore, type Agent, type KanbanCard, type KanbanColumns } from '../store';
import type { RepoView } from '../../../shared/types';
import { confirmDialog } from './Confirm';
import { Panel } from './Panel';

/** Who has the card; "QA" while they're testing it. */
function AgentChip({ agent, card }: { agent?: Agent; card: KanbanCard }) {
  if (!agent) return null;
  return (
    <span className="agent-chip">
      <span className="dot" style={{ background: agent.color }} />
      {agent.name}
      {agent.task === 'qa' && card.prNumber != null && agent.prNumber === card.prNumber && <span className="chip">QA</span>}
    </span>
  );
}

export function IssueForm({ repoId, agents, onDone, autoFocus = true }: { repoId: string; agents: Agent[]; onDone?: () => void; autoFocus?: boolean }) {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [assignTo, setAssignTo] = useState('');
  const [busy, setBusy] = useState(false);
  const free = agents.filter((a) => a.role !== 'ceo' && a.status !== 'working' && a.status !== 'preparing');
  return (
    <form
      className="issue-form"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!title.trim()) return;
        setBusy(true);
        try {
          await api.createIssue(repoId, title, body, assignTo || undefined);
          setTitle('');
          setBody('');
          setAssignTo('');
          onDone?.();
        } catch {
          // toasted
        } finally {
          setBusy(false);
        }
      }}
    >
      <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Issue title, e.g. Add a dark mode toggle" aria-label="Issue title" autoFocus={autoFocus} />
      <textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="Describe what you want. Acceptance criteria help the agent who builds it and the one who tests it a lot." aria-label="Issue description" rows={5} />
      <div className="row">
        <select value={assignTo} onChange={(e) => setAssignTo(e.target.value)} aria-label="Who works on it">
          <option value="">Leave in backlog (auto-assign picks it up if enabled)</option>
          {free.map((a) => (
            <option key={a.id} value={a.id}>
              Give it to {a.name} right away
            </option>
          ))}
        </select>
        <button className="btn btn-good" disabled={busy || !title.trim()}>
          {busy ? 'Filing…' : 'File issue on GitHub'}
        </button>
      </div>
    </form>
  );
}

/** The board's frame: a panel over the office, or (in pocket mode) a plain section of the page. */
function Frame({ embedded, ...props }: Parameters<typeof Panel>[0] & { embedded?: boolean }) {
  if (!embedded) return <Panel {...props} />;
  return (
    <section className="kanban-embedded" style={{ ['--accent' as string]: props.accent }}>
      <h2 className="kanban-embedded-title">{props.title}</h2>
      {props.children}
    </section>
  );
}

function QaLink({ card }: { card: KanbanCard }) {
  if (!card.qa?.commentUrl) return null;
  return (
    <a className="small" href={card.qa.commentUrl} target="_blank" rel="noreferrer" title={card.qa.summary ?? ''}>
      QA report ↗
    </a>
  );
}

/** What a card can do, for the dashboard's board: REST calls with their questions, one at a time per card. */
export function useCardActions(repoId: string, defaultBranch: string) {
  const [pending, setPending] = useState<string | null>(null);
  const act = async (key: string, fn: () => Promise<unknown>) => {
    setPending(key);
    try {
      await fn();
    } catch {
      // toasted
    } finally {
      setPending(null);
    }
  };
  const merge = async (c: KanbanCard) => {
    const passed = c.qa?.status === 'passed';
    const ok = await confirmDialog(
      passed
        ? { icon: '🎉', title: `Merge PR #${c.number}?`, body: `“${c.title}” passed QA. It will be squash-merged into ${defaultBranch}.`, confirm: 'Squash & merge' }
        : {
            tone: 'warn',
            title: `Merge PR #${c.number} without QA?`,
            body: `“${c.title}” has not passed QA yet. Merge it into ${defaultBranch} anyway?`,
            confirm: 'Merge anyway',
          },
    );
    if (ok) void act(c.key, () => api.mergePull(repoId, c.number));
  };
  const sendBack = async (c: KanbanCard) => {
    let note = '';
    const ok = await confirmDialog({
      icon: '🔧',
      title: `Send PR #${c.number} back for a fix?`,
      body: (
        <>
          <p>Its author, or any free agent, fixes it with QA's findings, then it's tested once more.</p>
          <input
            maxLength={1000}
            placeholder="Optional note, e.g. merge main and keep both e2e tests"
            aria-label="Note for whoever fixes it"
            ref={(el) => void (el && setTimeout(() => el.focus(), 0))}
            onChange={(e) => (note = e.target.value)}
          />
        </>
      ),
      confirm: 'Send back',
    });
    if (ok) void act(c.key, () => api.sendBack(repoId, c.number, note.trim() || undefined));
  };
  const closePr = async (c: KanbanCard) => {
    const ok = await confirmDialog({
      tone: 'danger',
      title: `Close PR #${c.number}?`,
      body: `“${c.title}” will be closed without merging, and any QA or fix work on it stops. Its issue stays open and waits for you to assign it again. The branch stays on GitHub.`,
      confirm: 'Close PR',
    });
    if (ok) void act(c.key, () => api.closePull(repoId, c.number));
  };
  return { pending, act, merge, sendBack, closePr };
}

export type CardActions = ReturnType<typeof useCardActions>;

/** The buttons and notes at the foot of a card, for every column but the Backlog (whose board picks its own assign control). */
export function CardFoot({ repo, col, card, actions }: { repo: RepoView; col: Exclude<keyof KanbanColumns, 'backlog'>; card: KanbanCard; actions: CardActions }) {
  const openOverlay = useStore((s) => s.openOverlay);
  const { pending, act, merge, sendBack, closePr } = actions;
  const close = (
    <button className="btn btn-small btn-ghost" disabled={pending === card.key} onClick={() => void closePr(card)}>
      Close
    </button>
  );
  const preview = (
    <button className="btn btn-small" title={`Run PR #${card.number} beside ${repo.defaultBranch} and open it in the app viewer`} onClick={() => openOverlay({ kind: 'app', repoId: repo.id, pr: card.number })}>
      Preview
    </button>
  );
  const terminal = card.agent && (
    <button className="btn btn-small" onClick={() => openOverlay({ kind: 'terminal', agentId: card.agent!.id })}>
      Terminal
    </button>
  );
  if (col === 'progress') {
    return (
    <div className="kcard-foot">
      <AgentChip agent={card.agent} card={card} />
      <span className="muted small">{card.note}</span>
      <span className="spacer" />
      {terminal}
    </div>
    );
  }
  if (col === 'qa') {
    const st = card.qa?.status;
    return (
      <div className="kcard-foot kcard-foot-wrap">
        <AgentChip agent={card.agent} card={card} />
        <span className="muted small">{card.note}</span>
        <span className="spacer" />
        <QaLink card={card} />
        {preview}
        {(st === 'testing' || st === 'fixing') && terminal}
        {(!st || st === 'needs-human') && (
          <button className="btn btn-small btn-good" disabled={pending === card.key} onClick={() => act(card.key, () => api.sendToQa(repo.id, card.number))}>
            {st === 'needs-human' ? 'Retry QA' : 'Send to QA'}
          </button>
        )}
        {(st === 'needs-human' || st === 'failed') && (
          <button className="btn btn-small" disabled={pending === card.key} title="Hand it to its author, or any free agent, with QA's findings and your note, without another QA round first" onClick={() => sendBack(card)}>
            Send back for a fix
          </button>
        )}
        {st === 'needs-human' && (
          <button className="btn btn-small btn-ghost" disabled={pending === card.key} onClick={() => merge(card)}>
            Merge anyway
          </button>
        )}
        {close}
      </div>
    );
  }
  if (col === 'ready') {
    const pr = repo.pulls.find((p) => p.number === card.prNumber);
    return (
      <div className="kcard-foot kcard-foot-wrap">
        <AgentChip agent={card.agent} card={card} />
        <span className="muted small">
          {card.note}
          {pr ? ` · +${pr.additions} −${pr.deletions}` : ''}
        </span>
        <span className="spacer" />
        <QaLink card={card} />
        {preview}
        <button className="btn btn-small btn-good" disabled={pending === card.key || pr?.isDraft} onClick={() => merge(card)}>
          Merge
        </button>
        {close}
      </div>
    );
  }
  return (
    <div className="kcard-foot">
      <AgentChip agent={card.agent} card={card} />
    </div>
  );
}

/** The board's controls: new issue, the floor's auto switches, its app and sync. */
export function KanbanToolbar({ repo, workers, actions }: { repo: RepoView; workers: Agent[]; actions: CardActions }) {
  const openOverlay = useStore((s) => s.openOverlay);
  const [showForm, setShowForm] = useState(false);
  const { pending, act } = actions;
  return (
    <>
      <div className="kanban-toolbar">
        <button className="btn btn-good" onClick={() => setShowForm((v) => !v)}>
          {showForm ? 'Cancel' : '+ New issue'}
        </button>
        <label className="toggle">
          <input type="checkbox" checked={repo.autoAssign} onChange={(e) => void api.updateRepo(repo.id, { autoAssign: e.target.checked }).catch(() => undefined)} />
          ⚡ Auto-assign work to free agents
        </label>
        <label className="toggle" title="Merge a PR as soon as QA has signed off on its latest commit and GitHub's checks are green">
          <input type="checkbox" checked={repo.autoMerge} onChange={(e) => void api.updateRepo(repo.id, { autoMerge: e.target.checked }).catch(() => undefined)} />
          🔀 Auto-merge when QA and checks pass
        </label>
        <span className="spacer" />
        <button className="btn" onClick={() => openOverlay({ kind: 'app', repoId: repo.id })} title="Open this floor's running app">
          🖥️ View app
        </button>
        <span className="muted small">{repo.lastSync ? `Synced ${new Date(repo.lastSync).toLocaleTimeString()}` : 'Syncing…'}</span>
        <button className="btn" disabled={pending === 'sync'} onClick={() => act('sync', () => api.syncRepo(repo.id))}>
          ⟳ Sync
        </button>
      </div>
      {repo.syncError && <div className="term-error">⚠️ {repo.syncError}</div>}
      {showForm && <IssueForm repoId={repo.id} agents={workers} onDone={() => setShowForm(false)} />}
    </>
  );
}

export function KanbanView({ repoId, embedded }: { repoId: string; embedded?: boolean }) {
  const repo = useStore((s) => s.repos.find((r) => r.id === repoId));
  const allAgents = useStore((s) => s.agents);
  const qaRecords = useStore((s) => s.qa);
  const usageState = useStore((s) => s.usage.state);
  const agents = useMemo(() => agentsOnRepo(allAgents, repoId), [allAgents, repoId]);
  const cols = useMemo(() => (repo ? kanbanFor(repo, agents, qaRecords, { state: usageState }) : null), [repo, agents, qaRecords, usageState]);
  const actions = useCardActions(repoId, repo?.defaultBranch ?? '');
  const { pending, act } = actions;

  if (!repo || !cols) {
    return (
      <Frame title="Kanban" embedded={embedded}>
        <p className="muted">This floor no longer exists.</p>
      </Frame>
    );
  }

  const workers = agents.filter((a) => a.role !== 'ceo');
  const free = workers.filter((a) => a.status === 'idle' || a.status === 'done' || a.status === 'stopped' || a.status === 'error');

  const foot = (col: Exclude<keyof KanbanColumns, 'backlog'>) => (c: KanbanCard) => <CardFoot repo={repo} col={col} card={c} actions={actions} />;

  const column = (title: string, cls: string, cards: KanbanCard[], render: (c: KanbanCard) => React.ReactNode, empty: string) => (
    <div className={`kcol ${cls}`}>
      <div className="kcol-head">
        {title} <span className="count">{cards.length}</span>
      </div>
      <div className="kcol-body">
        {cards.length === 0 && <div className="muted small kempty">{empty}</div>}
        {cards.map((c) => (
          <div key={c.key} className={`kcard ${c.tone ? `kcard-${c.tone}` : ''}`}>
            <div className="kcard-title">
              {c.url ? (
                <a href={c.url} target="_blank" rel="noreferrer">
                  {c.prNumber ? 'PR ' : ''}#{c.number}
                </a>
              ) : (
                <b>#{c.number}</b>
              )}{' '}
              {c.title}
            </div>
            {render(c)}
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <Frame
      embedded={embedded}
      wide
      accent={repo.color}
      title={
        <span>
          📋 {repo.fullName}{' '}
          <a className="small" href={repo.url} target="_blank" rel="noreferrer">
            GitHub ↗
          </a>
        </span>
      }
    >
      <KanbanToolbar repo={repo} workers={workers} actions={actions} />

      <div className="kanban kanban-5">
        {column(
          '📋 Backlog',
          'kcol-backlog',
          cols.backlog,
          (c) => (
            <div className="kcard-foot">
              {c.note && <span className="muted small">{c.note}</span>}
              <select
                value=""
                disabled={pending === c.key || free.length === 0}
                onChange={(e) => e.target.value && act(c.key, () => api.assign(e.target.value, c.number))}
                aria-label={`Assign issue #${c.number}`}
              >
                <option value="">{free.length ? 'Assign to…' : 'Everyone is busy'}</option>
                {free.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </div>
          ),
          'No open issues. File one above!',
        )}
        {column(
          '🔨 In progress',
          'kcol-progress',
          cols.progress,
          foot('progress'),
          'Nobody is coding right now.',
        )}
        {column(
          '🔍 In QA',
          'kcol-qa',
          cols.qa,
          foot('qa'),
          'Nothing waiting for testing.',
        )}
        {column(
          '✅ Ready to merge',
          'kcol-review',
          cols.ready,
          foot('ready'),
          'No tested pull requests yet.',
        )}
        {column(
          '🎉 Merged',
          'kcol-merged',
          cols.merged,
          foot('merged'),
          'Nothing merged yet.',
        )}
      </div>
    </Frame>
  );
}
