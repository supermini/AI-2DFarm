// The manager's console sections the 2D dashboard keeps (floors, team, issues, settings), with no 3D imports: the
// console (3D office) and the dashboard's settings screen both mount them. The 3D-only bits (the look editor, the
// replay-the-tour button) come in as optional props, like TerminalView's lookEditor.
import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { TeamStats } from './TeamStats';
import { api } from '../api';
import { PreviewPill, PreviewSettings } from './AppViewer';
import { agentsOnRepo, pendingRequests, useStore, type Agent } from '../store';
import { CEO_ID, DEFAULT_MAX_AGENTS, FLOOR_SEATS, type AgentCli, type EffortLevel, type OfficeUpdateView, type RepoView } from '../../../shared/types';
import { CLAUDE_MODELS, modelSuggestions } from '../../../shared/models';
import { CliOptions, CliSelect, cliName, EFFORTS, EffortSelect, LookSelect, ModelInput, NameInput, PromptPreview } from './AgentSettings';
import { canPostpone, canUpdateNow, drainDeadline, officeUpdateText } from '../officeUpdate';
import { confirmDialog } from './Confirm';
import { IssueForm } from './KanbanView';
import { LiveTerminal } from './LiveTerminal';
import { MicButton } from './MicButton';
import { Resume } from './Phone';
import { ProjectPicker } from './ProjectPicker';
import { StatusPill } from './TerminalView';

export async function attempt<T>(fn: () => Promise<T>): Promise<T | undefined> {
  try {
    return await fn();
  } catch {
    return undefined; // api() already toasted the error
  }
}

// ---------- CEO ----------

function FloorBrief({ repo }: { repo: RepoView }) {
  const [mission, setMission] = useState(repo.mission);
  useEffect(() => setMission(repo.mission), [repo.mission]);
  return (
    <div className="card floor-card" style={{ ['--accent' as string]: repo.color }}>
      <div className="row">
        <span className="floor-badge">{repo.floor}</span>
        <div className="grow">
          <b>{repo.fullName}</b>
          <div className="muted small">{repo.summary ? `🧠 ${repo.summary}` : 'The CEO has not studied this floor yet.'}</div>
        </div>
        <button className="btn btn-small btn-ghost" onClick={() => void attempt(() => api.onboardFloor(repo.id))} title="Study the repo again and rethink the plan and the team's size">
          Re-study
        </button>
      </div>
      <textarea value={mission} onChange={(e) => setMission(e.target.value)} rows={2} placeholder="Brief: what should this floor build next? The CEO turns it into issues and a team size." />
      <div className="row">
        <button className="btn btn-small" disabled={mission === repo.mission} onClick={() => void attempt(() => api.updateRepo(repo.id, { mission }))}>
          Save brief
        </button>
        <span className="spacer" />
        <button className="btn btn-small btn-good" disabled={!mission.trim()} onClick={() => void attempt(() => api.planFloor(repo.id, mission))}>
          🧠 Ask the CEO to plan it
        </button>
      </div>
      <details className="small">
        <summary>QA brief{repo.qaBrief ? '' : ' (none yet)'}</summary>
        <textarea
          key={repo.qaBrief}
          rows={4}
          defaultValue={repo.qaBrief}
          placeholder="What every QA pass must check on this project."
          onBlur={(e) => e.target.value !== repo.qaBrief && void attempt(() => api.updateRepo(repo.id, { qaBrief: e.target.value }))}
        />
      </details>
    </div>
  );
}

/** The CEO's name, model, effort and prompt: the settings half of the CEO tab (the dashboard's CEO panel mounts it too). */
export function CeoSettingsCard() {
  const ceo = useStore((s) => s.agents[CEO_ID]);
  if (!ceo) return null;
  return (
    <div className="card ceo-settings">
      <div className="row">
        <span className="avatar" style={{ background: ceo.color }}>
          {ceo.name[0]}
        </span>
        <NameInput agent={ceo} style={{ maxWidth: 140, fontWeight: 700 }} />
        <span className="muted small">CEO</span>
        <span className="spacer" />
        <ModelInput agent={ceo} style={{ maxWidth: 150 }} />
        <EffortSelect agent={ceo} style={{ width: 'auto' }} />
      </div>
      <PromptPreview agent={ceo} />
    </div>
  );
}

/** The CEO tab. `onOpenPhone` adds the "Open the phone" button (the 3D office's phone; the dashboard has none). */
export function CeoTab({ onOpenPhone }: { onOpenPhone?: () => void }) {
  const ceo = useStore((s) => s.agents[CEO_ID]);
  const log = useStore((s) => s.logs[CEO_ID]) ?? [];
  const info = useStore((s) => s.ceo);
  const repos = useStore((s) => s.repos);
  const requests = useStore((s) => s.requests);
  const [text, setText] = useState('');
  const scroller = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [log.length]);
  if (!ceo) return <p className="muted">The corner office is empty.</p>;
  const working = ceo.status === 'working';
  const pending = pendingRequests(requests);
  const send = (t: string) => {
    if (!t.trim()) return;
    setText('');
    void attempt(() => api.messageCeo(t));
  };
  const decided = requests.filter((r) => r.status !== 'pending').slice(-6).reverse();
  return (
    <div className="tab-grid">
      <div>
        <div className="card">
          <div className="row">
            <span className="avatar" style={{ background: ceo.color }}>
              {ceo.name[0]}
            </span>
            <NameInput agent={ceo} style={{ maxWidth: 140, fontWeight: 700 }} />
            <span className="muted small">CEO</span>
            <StatusPill status={ceo.status} />
            <span className="spacer" />
            <ModelInput agent={ceo} style={{ maxWidth: 150 }} />
            <EffortSelect agent={ceo} style={{ width: 'auto' }} />
          </div>
          <div className="small">
            <b>Now:</b> {working ? info.job?.label : 'free'}
            {info.queue.length > 0 && (
              <>
                {' '}
                · <b>Up next:</b> {info.queue.map((j) => j.label).join(' → ')}
              </>
            )}
          </div>
          <div className="muted small">
            {info.nextReviewAt ? `Next company review around ${new Date(info.nextReviewAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} (skipped if nothing changed).` : 'Periodic reviews are off (Settings).'}
          </div>
          <PromptPreview agent={ceo} />
          {ceo.terminal ? (
            <LiveTerminal agentId={ceo.id} className="ceo-term" />
          ) : (
            <div className="term ceo-term" ref={scroller}>
              {log.length === 0 && <div className="term-line term-system">(nothing yet)</div>}
              {log.map((l) => (
                <div key={l.id} className={`term-line term-${l.kind}`}>
                  {l.text || ' '}
                </div>
              ))}
            </div>
          )}
          <form
            className="row"
            onSubmit={(e) => {
              e.preventDefault();
              send(text);
            }}
          >
            <input value={text} onChange={(e) => setText(e.target.value)} placeholder={`Message ${ceo.name} (or press P anywhere for your phone)…`} />
            <MicButton kind="console" value={text} onChange={setText} onSend={send} />
            <button className="btn" disabled={!text.trim()}>
              Send
            </button>
          </form>
          <div className="row">
            {working && (
              <button className="btn btn-small btn-bad" onClick={() => void attempt(() => api.stop(ceo.id))}>
                ■ Stop
              </button>
            )}
            <button className="btn btn-small" disabled={repos.length === 0} onClick={() => void attempt(() => api.ceoReview())}>
              🔎 Review the company now
            </button>
            {onOpenPhone && (
              <button className="btn btn-small" onClick={onOpenPhone}>
                📱 Open the phone
              </button>
            )}
          </div>
        </div>
      </div>
      <div>
        <h3 className="section">📄 Team changes {pending.length > 0 && <span className="badge">{pending.length}</span>}</h3>
        {pending.length === 0 && <p className="muted small">None waiting. The CEO grows or shrinks a floor's team when its work calls for it (Settings → Team changes from the CEO).</p>}
        {pending.map((r) => (
          <Resume key={r.id} req={r} />
        ))}
        {decided.length > 0 && (
          <details className="small" style={{ marginBottom: 12 }}>
            <summary>Recent decisions</summary>
            {decided.map((r) => (
              <Resume key={r.id} req={r} />
            ))}
          </details>
        )}
        <h3 className="section">🗺️ Project briefs</h3>
        {repos.length === 0 && <p className="muted small">Connect a repo first.</p>}
        {[...repos].sort((a, b) => a.floor - b.floor).map((r) => (
          <FloorBrief key={r.id} repo={r} />
        ))}
      </div>
    </div>
  );
}

// ---------- floors ----------

const NO_LAUNCHER = 'Start the office with npm run dev or npm start so it can install updates and restart itself.';

/** The office itself: the commit it runs and its own update. Hidden on servers that can't update themselves. */
function OfficeRow({ update }: { update: OfficeUpdateView }) {
  const commit = useStore((s) => s.officeCommit);
  const autoUpdate = useStore((s) => s.settings.autoUpdate);
  const [busy, setBusy] = useState(false);
  const act = (action: 'now' | 'later') => {
    setBusy(true);
    void attempt(() => api.updateOffice(action)).finally(() => setBusy(false));
  };
  const deadline = drainDeadline(update);
  const pending = update.state !== 'none';
  const tone = update.state === 'failed' ? 'office-state-bad' : update.state === 'none' ? 'office-state-ok' : 'office-state-busy';
  const tip = (enabled: boolean, text: string) => (update.launcher ? (enabled ? text : undefined) : NO_LAUNCHER);
  return (
    <div className="card office-card">
      <div className="row wrap">
        <span className="floor-badge office-badge" aria-hidden>
          🏢
        </span>
        <div className="grow">
          <b>Office</b> <span className="muted small">running {commit ? <code>{commit}</code> : 'an unknown commit'}</span>
          <div className={`small office-state ${tone}`} role="status">
            {officeUpdateText(update)}
          </div>
        </div>
        {pending && (
          <div className="office-actions" title={update.launcher ? undefined : NO_LAUNCHER}>
            <button
              className="btn btn-small btn-good"
              disabled={busy || !canUpdateNow(update)}
              title={tip(canUpdateNow(update), 'Start nothing new, let running sessions finish, then update and restart the office')}
              onClick={() => act('now')}
            >
              Update now
            </button>
            <button className="btn btn-small btn-ghost" disabled={busy || !canPostpone(update)} title={tip(canPostpone(update), 'Keep working; ask again in 2 hours or when a newer commit lands')} onClick={() => act('later')}>
              Later
            </button>
          </div>
        )}
      </div>
      {update.detail && update.state !== 'failed' && <div className="muted small">{update.detail}</div>}
      {deadline && update.running > 0 && (
        <div className="muted small">Sessions still running at {new Date(deadline).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} are stopped, and their work goes back to the queue.</div>
      )}
      {!update.launcher && pending && <div className="muted small">{NO_LAUNCHER}</div>}
      {typeof autoUpdate === 'boolean' && (
        <label className="toggle" title="When an update is ready, start nothing new, let running sessions finish, then update and restart the office">
          <input type="checkbox" checked={autoUpdate} onChange={(e) => void attempt(() => api.updateSettings({ autoUpdate: e.target.checked }))} /> Update automatically
        </label>
      )}
    </div>
  );
}

function FloorRow({ repo, all, onVisit }: { repo: RepoView; all: RepoView[]; onVisit?: (floor: number) => void }) {
  const agents = useStore((s) => s.agents);
  const goToFloor = useStore((s) => s.goToFloor);
  const openOverlay = useStore((s) => s.openOverlay);
  // The office's own folder isn't fast-forwarded; its update is on the Office row instead.
  const officeFolder = useStore((s) => !!s.officeUpdate) && !!repo.folderSync?.startsWith('update ready');
  const team = agentsOnRepo(agents, repo.id);
  const others = all.filter((r) => r.id !== repo.id);
  const patch = (p: Parameters<typeof api.updateRepo>[1]) => void attempt(() => api.updateRepo(repo.id, p));
  return (
    <div className="card floor-card" style={{ ['--accent' as string]: repo.color }}>
      <div className="row">
        <span className="floor-badge">{repo.floor}</span>
        <div className="grow">
          <a href={repo.url} target="_blank" rel="noreferrer">
            <b>{repo.fullName}</b>
          </a>
          {repo.summary && <div className="small">🧠 {repo.summary}</div>}
          <div className="muted small">
            {team.length} agents · {repo.issues.length} open issues · {repo.pulls.filter((p) => p.state === 'OPEN').length} open PRs · default branch <code>{repo.defaultBranch}</code>
            {repo.cloneStatus !== 'ready' && ` · checkout: ${repo.cloneStatus}`}
          </div>
          <div className="muted small" title={repo.localPath ? 'Your own project folder' : 'A clone the office manages'}>
            📁 <code>{repo.checkoutPath}</code>
            {officeFolder ? " · the office's own folder, updated from the Office row" : repo.folderSync && <span title={repo.folderSync}> · {repo.folderSync}</span>}{' '}
            <button className="btn btn-small btn-ghost" title="Fast-forward it to GitHub's default branch, when that's safe" onClick={() => void attempt(() => api.syncFolder(repo.id))}>
              ⟳ Sync now
            </button>
          </div>
          {repo.cloneError && <div className="term-error small">clone failed: {repo.cloneError}</div>}
          {repo.syncError && <div className="term-error small">sync failed: {repo.syncError}</div>}
        </div>
        <input type="color" value={repo.color} onChange={(e) => patch({ color: e.target.value })} title="Floor colour" aria-label={`Floor ${repo.floor} colour`} />
        <button className="btn btn-small" onClick={() => (onVisit ?? goToFloor)(repo.floor)}>
          Visit
        </button>
      </div>
      <div className="row wrap">
        <label className="toggle">
          <input type="checkbox" checked={repo.autoAssign} onChange={(e) => patch({ autoAssign: e.target.checked })} /> ⚡ Auto-assign issues
        </label>
        <label className="toggle" title="Merge a PR as soon as QA has signed off on its latest commit and GitHub's checks are green">
          <input type="checkbox" checked={repo.autoMerge} onChange={(e) => patch({ autoMerge: e.target.checked })} /> 🔀 Auto-merge
        </label>
        <label className="toggle">
          <input type="checkbox" checked={repo.browserTesting} onChange={(e) => patch({ browserTesting: e.target.checked })} /> 🌐 Browser testing (Playwright MCP)
        </label>
        <span className="spacer" />
        <button
          className="btn btn-small btn-ghost"
          onClick={() => {
            void confirmDialog({
              tone: 'danger',
              title: `Disconnect ${repo.fullName}?`,
              body: `Everyone on this floor is let go. Nothing is deleted on GitHub, and ${repo.localPath ? 'your folder stays exactly as it is' : 'the local clone stays on disk'}.`,
              confirm: 'Disconnect',
            }).then((ok) => ok && attempt(() => api.disconnectRepo(repo.id)));
          }}
        >
          Disconnect
        </button>
      </div>
      {others.length > 0 && (
        <div className="row wrap links">
          <span className="muted small">🔗 Agents here may read:</span>
          {others.map((o) => (
            <label key={o.id} className="toggle small">
              <input
                type="checkbox"
                checked={repo.links.includes(o.id)}
                onChange={(e) => patch({ links: e.target.checked ? [...repo.links, o.id] : repo.links.filter((l) => l !== o.id) })}
              />
              {o.fullName}
            </label>
          ))}
        </div>
      )}
      <details className="small preview-details">
        <summary>
          🖥️ App preview · <PreviewPill status={repo.preview.status} />
          {repo.previewConfig.command ? (
            <>
              {' '}
              <code>{repo.previewConfig.command}</code>
            </>
          ) : (
            ' auto-detected command'
          )}
        </summary>
        <PreviewSettings repo={repo} />
        <button className="btn btn-small" onClick={() => openOverlay({ kind: 'app', repoId: repo.id })}>
          Open the app viewer
        </button>
      </details>
    </div>
  );
}

/** The office's own update row, for a screen that shows it apart from the floors (nothing when the server can't update itself). */
export function OfficeUpdate() {
  const update = useStore((s) => s.officeUpdate);
  return update ? <OfficeRow update={update} /> : null;
}

/** onVisit: where "Visit" goes (default: the 3D camera); withOffice: false leaves the Office row to the caller. */
export function FloorsTab({ onVisit, withOffice = true }: { onVisit?: (floor: number) => void; withOffice?: boolean }) {
  const repos = useStore((s) => s.repos);
  const officeUpdate = useStore((s) => s.officeUpdate);
  return (
    <div className="tab-grid">
      <div>
        {withOffice && officeUpdate && <OfficeRow update={officeUpdate} />}
        <h3 className="section">🏢 Floors</h3>
        {repos.length === 0 && <p className="muted">No floors yet. Add a project →</p>}
        {[...repos].sort((a, b) => a.floor - b.floor).map((r) => (
          <FloorRow key={r.id} repo={r} all={repos} onVisit={onVisit} />
        ))}
      </div>
      <div className="card">
        <h3>➕ Add a project</h3>
        <ProjectPicker />
      </div>
    </div>
  );
}


// ---------- team ----------

interface NewAgent {
  name: string;
  cli: AgentCli | '';
  model: string;
  effort: EffortLevel | '';
}

const NO_SETUP: NewAgent = { name: '', cli: '', model: '', effort: '' };

/** A floor's "+ Agent": an optional name and their coding agent, model and effort ('' = the office's defaults). */
function AddAgent({ repo, size }: { repo: RepoView; size: number }) {
  const settings = useStore((s) => s.settings);
  const clis = useStore((s) => s.clis);
  const [draft, setDraft] = useState<NewAgent>(NO_SETUP);
  const [busy, setBusy] = useState(false);
  const terminal = settings.runtime === 'terminal';
  const cli = terminal ? draft.cli || settings.defaultCli : 'claude';
  const full = size >= settings.maxAgents;
  const edit = (p: Partial<NewAgent>) => setDraft({ ...draft, ...p });
  const add = () => {
    setBusy(true);
    const { name, ...setup } = draft;
    void attempt(() => api.hireAgent(repo.id, { ...setup, name: name.trim() || undefined }))
      .then((a) => a && setDraft(NO_SETUP))
      .finally(() => setBusy(false));
  };
  return (
    <div className="row wrap">
      <input value={draft.name} onChange={(e) => edit({ name: e.target.value })} placeholder="Name (optional)" maxLength={24} aria-label={`New agent's name on floor ${repo.floor}`} style={{ maxWidth: 150 }} />
      {terminal && (
        <select value={draft.cli} onChange={(e) => edit({ cli: e.target.value as AgentCli | '' })} aria-label="New agent's coding agent" style={{ width: 'auto' }}>
          <option value="">{cliName(clis, settings.defaultCli)} (default)</option>
          <CliOptions clis={clis} />
        </select>
      )}
      <input value={draft.model} onChange={(e) => edit({ model: e.target.value })} list={`new-agent-models-${repo.floor}`} placeholder="default model" aria-label="New agent's model" style={{ maxWidth: 150 }} />
      <datalist id={`new-agent-models-${repo.floor}`}>
        {modelSuggestions(cli).map((m) => (
          <option key={m} value={m} />
        ))}
      </datalist>
      <select value={draft.effort} onChange={(e) => edit({ effort: e.target.value as EffortLevel | '' })} aria-label="New agent's effort" style={{ width: 'auto' }}>
        <option value="">default effort ({settings.defaultEffort})</option>
        {EFFORTS.map((x) => (
          <option key={x} value={x}>
            {x}
          </option>
        ))}
      </select>
      <span title={full ? `Floor ${repo.floor} has its most agents (${settings.maxAgents}): change it in Settings → Most agents per floor` : undefined}>
        <button className="btn btn-small btn-good" disabled={busy || full} onClick={add}>
          + Agent
        </button>
      </span>
    </div>
  );
}

/** lookEditor: the 3D-only look editor under a 🎨 row (the button is hidden without it). */
export function TeamTab({ lookEditor }: { lookEditor?: (agent: Agent) => ReactNode }) {
  const repos = useStore((s) => s.repos);
  const agents = useStore((s) => s.agents);
  const settings = useStore((s) => s.settings);
  const openOverlay = useStore((s) => s.openOverlay);
  const terminal = settings.runtime === 'terminal';
  const [openLook, setOpenLook] = useState<string | null>(null);
  if (repos.length === 0) return <p className="muted">Connect a repo first; agents need a floor to sit on.</p>;
  return (
    <div>
      <TeamStats />
      {[...repos].sort((a, b) => a.floor - b.floor).map((repo) => {
        const team = agentsOnRepo(agents, repo.id).filter((a) => a.role !== 'ceo');
        return (
          <div key={repo.id} className="card floor-card" style={{ ['--accent' as string]: repo.color }}>
            <div className="row wrap">
              <span className="floor-badge">{repo.floor}</span>
              <b className="grow">{repo.fullName}</b>
              <span className="muted small">
                {team.length} of {settings.maxAgents} agents
              </span>
            </div>
            <AddAgent repo={repo} size={team.length} />
            {team.length === 0 && <div className="muted small">No one works here yet.</div>}
            <table className="team">
              <tbody>
                {team.map((a) => (
                  <Fragment key={a.id}>
                  <tr>
                    <td>
                      <span className="dot" style={{ background: a.color }} />
                    </td>
                    <td>
                      <NameInput agent={a} />
                      {a.host === 'box' && (
                        <span className="cloud-badge" title="Works in an Upstash Box: carries on when the office is closed">
                          ☁
                        </span>
                      )}
                    </td>
                    <td>
                      {lookEditor && (
                        <button className="btn btn-small btn-ghost" aria-expanded={openLook === a.id} title={`${a.name}'s look`} onClick={() => setOpenLook(openLook === a.id ? null : a.id)}>
                          🎨
                        </button>
                      )}
                    </td>
                    <td>
                      <StatusPill status={a.status} />
                    </td>
                    <td className="small">{a.status === 'idle' ? <span className="muted">—</span> : a.task === 'qa' ? `testing PR #${a.prNumber}` : a.task === 'fix' ? `fixing PR #${a.prNumber}` : `#${a.issueNumber ?? ''} ${a.issueTitle ?? ''}`.slice(0, 40)}</td>
                    {terminal && (
                      <td>
                        <CliSelect agent={a} style={{ width: 112 }} />
                      </td>
                    )}
                    <td>
                      <ModelInput agent={a} style={{ minWidth: 110 }} />
                    </td>
                    <td>
                      <EffortSelect agent={a} style={{ width: 124 }} />
                    </td>
                    <td className="nowrap">
                      {a.host === 'box' && a.needsSignIn && (
                        <>
                          <button className="btn btn-small btn-good" title={`${a.name}'s cloud machine needs you to sign their coding agent in`} onClick={() => openOverlay({ kind: 'terminal', agentId: a.id })}>
                            🔑 Sign in
                          </button>{' '}
                        </>
                      )}
                      <button className="btn btn-small" onClick={() => openOverlay({ kind: 'terminal', agentId: a.id })}>
                        Terminal
                      </button>{' '}
                      <button
                        className="btn btn-small btn-ghost"
                        onClick={() =>
                          void confirmDialog({ tone: 'danger', icon: '👋', title: `Let ${a.name} go?`, body: 'Their worktree is removed. Branches they pushed stay on GitHub.', confirm: `Let ${a.name} go` }).then(
                            (ok) => ok && attempt(() => api.fireAgent(a.id)),
                          )
                        }
                      >
                        Let go
                      </button>
                    </td>
                  </tr>
                  {lookEditor && openLook === a.id && (
                    <tr>
                      <td />
                      <td colSpan={terminal ? 8 : 7}>
                        <label className="row small">
                          <span>Drawn as</span>
                          <LookSelect agent={a} />
                        </label>
                        {lookEditor(a)}
                      </td>
                    </tr>
                  )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        );
      })}
    </div>
  );
}


// ---------- issues ----------

export function IssuesTab({ initialRepo }: { initialRepo?: string }) {
  const repos = useStore((s) => s.repos);
  const allAgents = useStore((s) => s.agents);
  const [repoId, setRepoId] = useState(initialRepo ?? repos[0]?.id ?? '');
  const repo = repos.find((r) => r.id === repoId);
  const agents = useMemo(() => agentsOnRepo(allAgents, repoId), [allAgents, repoId]);
  if (repos.length === 0) return <p className="muted">Connect a repo first.</p>;
  return (
    <div className="tab-grid">
      <div className="card">
        <h3>📝 File a new issue</h3>
        <select value={repoId} onChange={(e) => setRepoId(e.target.value)} aria-label="Floor">
          {repos.map((r) => (
            <option key={r.id} value={r.id}>
              Floor {r.floor} · {r.fullName}
            </option>
          ))}
        </select>
        {repo && <IssueForm key={repo.id} repoId={repo.id} agents={agents} />}
      </div>
      <div className="card">
        <h3>Open issues on {repo?.fullName}</h3>
        <div className="repo-list tall">
          {repo?.issues.length === 0 && <div className="muted small">None. Nice.</div>}
          {repo?.issues.map((i) => {
            const holder = agents.find((a) => a.role !== 'ceo' && a.task !== 'qa' && a.issueNumber === i.number && a.status !== 'idle');
            return (
              <div key={i.number} className="repo-row">
                <div>
                  <a href={i.url} target="_blank" rel="noreferrer">
                    #{i.number}
                  </a>{' '}
                  {i.title}
                  {i.labels.length > 0 && <div className="muted small">{i.labels.join(', ')}</div>}
                </div>
                <span className="repo-row-actions">
                  {holder ? (
                    <span className="agent-chip">
                      <span className="dot" style={{ background: holder.color }} />
                      {holder.name}
                    </span>
                  ) : (
                    <select value="" onChange={(e) => e.target.value && void attempt(() => api.assign(e.target.value, i.number))} aria-label={`Assign issue #${i.number}`}>
                      <option value="">Assign…</option>
                      {agents
                        .filter((a) => a.role !== 'ceo' && a.status !== 'working' && a.status !== 'preparing')
                        .map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.name}
                          </option>
                        ))}
                    </select>
                  )}
                  <button
                    className="btn btn-small btn-ghost"
                    title="Close it on GitHub as not planned"
                    onClick={() =>
                      void confirmDialog({
                        tone: 'danger',
                        title: `Close #${i.number}?`,
                        body: `“${i.title}” will be closed on GitHub as not planned${holder ? `, and ${holder.name} stops working on it` : ''}.`,
                        confirm: 'Close issue',
                      }).then((ok) => ok && attempt(() => api.closeIssue(repo.id, i.number)))
                    }
                  >
                    Close
                  </button>
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}


// ---------- settings ----------

/** The two settings cards (agents, CEO, runtime, company, environment). tour: the 3D tutorial's "Replay the tour". */
export function SettingsCards({ tour = false }: { tour?: boolean }) {
  const settings = useStore((s) => s.settings);
  const clis = useStore((s) => s.clis);
  const user = useStore((s) => s.user);
  const machinesRoot = useStore((s) => s.machinesRoot);
  const demo = useStore((s) => s.demo);
  const version = useStore((s) => s.version);
  const commit = useStore((s) => s.officeCommit);
  const set = (p: Parameters<typeof api.updateSettings>[0]) => void attempt(() => api.updateSettings(p));
  const terminal = settings.runtime === 'terminal';
  const defaultCli = terminal ? settings.defaultCli : 'claude';
  return (
    <>
    <div className="card">
      <h3>🧠 Agents</h3>
      {terminal && (
        <label className="field">
          <span>Default coding agent</span>
          <select value={settings.defaultCli} onChange={(e) => set({ defaultCli: e.target.value as AgentCli })}>
            <CliOptions clis={clis} />
          </select>
        </label>
      )}
      <label className="field">
        <span>Default model{terminal ? ` for ${cliName(clis, settings.defaultCli)}` : ''}</span>
        <input
          key={`${settings.defaultCli}:${settings.defaultModel}`}
          list={defaultCli === 'claude' ? 'models-s' : undefined}
          defaultValue={settings.defaultModel}
          placeholder="the agent's own default"
          onBlur={(e) => e.target.value !== settings.defaultModel && set({ defaultModel: e.target.value })}
        />
        <datalist id="models-s">
          {CLAUDE_MODELS.map((m) => (
            <option key={m} value={m} />
          ))}
        </datalist>
      </label>
      <label className="field">
        <span>Default effort</span>
        <select value={settings.defaultEffort} onChange={(e) => set({ defaultEffort: e.target.value as EffortLevel })}>
          {EFFORTS.map((x) => (
            <option key={x} value={x}>
              {x}
            </option>
          ))}
        </select>
      </label>
      <p className="muted small">
        {terminal
          ? 'Each agent can use their own coding agent, model and effort (Team tab); the CEO always runs Claude Code. Claude Code reports every step; Codex and OpenCode are experimental: the office sees their task rather than each step. They can also run a model on this computer: name it ollama/…, lmstudio/…, llamacpp/… or omlx/….'
          : 'The Agent SDK runs Claude Code. Each agent can use their own model and effort (Team tab).'}
      </p>
      <label className="field">
        <span>Session limit</span>
        <input type="number" min={0} placeholder="No limit" defaultValue={settings.sessionLimit || ''} onBlur={(e) => set({ sessionLimit: Number(e.target.value) || 0 })} />
      </label>
      <p className="muted small">
        Leave empty so every agent with work runs at once. Agents on the same coding agent share its subscription's usage limits, and each one is its own process on this PC, so set a limit if
        you hit either.
      </p>
      <label className="field">
        <span>Sessions while pacing</span>
        <input
          key={settings.pacingSessions}
          type="number"
          min={1}
          max={32}
          defaultValue={settings.pacingSessions}
          onBlur={(e) => Number(e.target.value) !== settings.pacingSessions && set({ pacingSessions: Number(e.target.value) || 3 })}
        />
      </label>
      <p className="muted small">When Claude warns that usage is getting high, new issues only start while fewer sessions than this are running. QA, fixes and the CEO carry on.</p>
      <label className="field">
        <span>Most agents per floor</span>
        <input
          key={settings.maxAgents}
          type="number"
          min={1}
          max={FLOOR_SEATS}
          defaultValue={settings.maxAgents}
          onBlur={(e) => {
            const n = Math.min(FLOOR_SEATS, Math.max(1, Math.round(Number(e.target.value)) || DEFAULT_MAX_AGENTS));
            if (n !== settings.maxAgents) set({ maxAgents: n });
          }}
        />
      </label>
      <p className="muted small">At most {FLOOR_SEATS}, one per desk. Adding agents past it is refused, by hand or by the CEO.</p>
      <h3>🧠 The CEO</h3>
      <div role="radiogroup" aria-label="Team changes from the CEO">
        <div className="small">
          <b>Team changes from the CEO</b>
        </div>
        <label className="toggle block">
          <input type="radio" name="scaling" checked={settings.scaling === 'approve'} onChange={() => set({ scaling: 'approve' })} />
          <span>
            <b>I approve each one</b> (recommended): new agents wait in the lobby, where you can change their coding agent, model and effort before hiring them,
            and a let-go waits as an envelope on their desk.
          </span>
        </label>
        <label className="toggle block">
          <input type="radio" name="scaling" checked={settings.scaling === 'auto'} onChange={() => set({ scaling: 'auto' })} />
          <span>
            <b>Apply straight away</b>, up to the most agents per floor. Idle agents leave first; busy ones finish their task.
          </span>
        </label>
      </div>
      <label className="field">
        <span>Company review every (minutes, 0 = off)</span>
        <input type="number" min={0} max={1440} defaultValue={settings.ceoHeartbeatMin} onBlur={(e) => set({ ceoHeartbeatMin: Number(e.target.value) })} />
      </label>
      <p className="muted small">A review checks team sizes, stuck PRs and floor profiles, and is skipped when nothing changed since the last one. It never files issues: new work only comes from you. The CEO's own model and effort are on the CEO tab.</p>
    </div>
    <div className="card">
      <h3>⌨️ How agents run</h3>
      <label className="toggle block">
        <input type="radio" checked={settings.runtime === 'terminal'} onChange={() => set({ runtime: 'terminal' })} />
        <span>
          <b>Real terminals</b> (recommended): every agent is its actual coding agent running in its own terminal. Open a desk to watch it live or type into it.
        </span>
      </label>
      <label className="toggle block">
        <input type="radio" checked={settings.runtime === 'sdk'} onChange={() => set({ runtime: 'sdk' })} />
        <span>
          <b>Agent SDK</b>: Claude Code through the Claude Agent SDK, shown as a log of its steps. Claude Code only.
        </span>
      </label>
      <p className="muted small">
        Agents work like your own coding agents in a terminal, with your skills, MCP servers and settings, and don't stop to ask. The office's workflow (branches, pull requests, QA reporting
        back) is in their instructions.
      </p>
      <h3>🏢 Company</h3>
      <label className="field">
        <span>Your name</span>
        <input defaultValue={settings.managerName} placeholder={user ?? 'Boss'} onBlur={(e) => e.target.value !== settings.managerName && set({ managerName: e.target.value })} />
      </label>
      <label className="field">
        <span>Company name</span>
        <input defaultValue={settings.companyName} placeholder="cubefarm" onBlur={(e) => e.target.value !== settings.companyName && set({ companyName: e.target.value })} />
      </label>
      <label className="field">
        <span>The office dog's name</span>
        <input key={settings.dogName} defaultValue={settings.dogName} placeholder="Biscuit" maxLength={24} onBlur={(e) => e.target.value.trim() !== settings.dogName && set({ dogName: e.target.value })} />
      </label>
      <label className="field">
        <span>Projects folder (new projects are created here)</span>
        <input key={settings.projectsDir} defaultValue={settings.projectsDir} onBlur={(e) => e.target.value.trim() && e.target.value !== settings.projectsDir && set({ projectsDir: e.target.value })} />
      </label>
      <label className="field">
        <span>Free idle desks after (minutes, 0 = never)</span>
        <input
          key={settings.trimIdleDesksMin}
          type="number"
          min={0}
          max={10080}
          defaultValue={settings.trimIdleDesksMin}
          onBlur={(e) => e.target.value !== '' && Number(e.target.value) !== settings.trimIdleDesksMin && set({ trimIdleDesksMin: Number(e.target.value) })}
        />
      </label>
      <p className="muted small">A desk left idle this long loses its node_modules and build output to save disk space. Its next task installs them again.</p>
      {tour && (
        <div className="row">
          <button className="btn btn-small" onClick={() => set({ tutorialStep: 0 })}>
            🧭 Replay the tour
          </button>
        </div>
      )}
      <h3>ℹ️ Environment</h3>
      <div className="small">
        cubefarm: <b>{version ?? 'unknown'}</b>
        {commit && (
          <>
            {' '}
            (<code>{commit}</code>)
          </>
        )}
        <br />
        GitHub: <b>{user ?? 'not signed in'}</b>
        {demo && ' (demo)'}
        <br />
        Agents' machines: <code>{machinesRoot}</code>
      </div>
    </div>
    </>
  );
}
