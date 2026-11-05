// The CEO role's screen: on the left the CEO (status, job, queue, planning buttons) over the chat; on the right what
// waits on the manager (approvals, interviews, PRs the CEO is triaging), the issue form and the CEO's own settings.
// Below 1024px the two columns are the chat and approvals panes (the route's `pane`). Everything is an existing
// component or REST call; a team change's interview opens here as a dialog.
import { useEffect, useState, useSyncExternalStore } from 'react';
import { api } from '../api';
import { agentsOnRepo, pendingRequests, useStore } from '../store';
import { CEO_ID, type HireRequestView } from '../../../shared/types';
import { Approvals } from '../pocket/PocketApprovals';
import { Chat } from '../ui/Phone';
import { attempt, CeoSettingsCard } from '../ui/consoleSections';
import { Interview } from '../ui/Interview';
import { IssueForm } from '../ui/KanbanView';
import { StatusPill } from '../ui/TerminalView';
import { ceoTriage } from './ceoTriage';
import type { CeoPane, Route } from './route';
import './ceo.css';

/** A coloured initial, as the console's CEO card draws it. */
function Avatar({ name, color, size }: { name: string; color: string; size?: number }) {
  return (
    <span className="avatar" style={{ background: color, ...(size ? { width: size, height: size, fontSize: size * 0.5 } : {}) }}>
      {name[0]}
    </span>
  );
}

const shortName = (fullName: string) => fullName.split('/')[1] ?? fullName;

/** The floor the planning buttons and the issue form act on: the manager's pick, else the first floor. */
function useFloorPick() {
  const repos = useStore((s) => s.repos);
  const sorted = [...repos].sort((a, b) => a.floor - b.floor);
  const [id, setId] = useState('');
  const repo = sorted.find((r) => r.id === id) ?? sorted[0] ?? null;
  return { sorted, repo, setId };
}

function FloorSelect({ pick, label }: { pick: ReturnType<typeof useFloorPick>; label: string }) {
  return (
    <select className="ceo-floor" value={pick.repo?.id ?? ''} onChange={(e) => pick.setId(e.target.value)} aria-label={label}>
      {pick.sorted.map((r) => (
        <option key={r.id} value={r.id}>
          Floor {r.floor} · {shortName(r.fullName)}
        </option>
      ))}
    </select>
  );
}

// ---------- the CEO ----------

function CeoCard() {
  const ceo = useStore((s) => s.agents[CEO_ID]);
  const info = useStore((s) => s.ceo);
  const pick = useFloorPick();
  const [planning, setPlanning] = useState(false);
  const [mission, setMission] = useState('');
  const repo = pick.repo;
  // The brief box starts from the floor's saved brief, and follows the floor select.
  useEffect(() => setMission(repo?.mission ?? ''), [repo?.id, repo?.mission]);
  if (!ceo) return <p className="muted small ceo-pad">The corner office is empty.</p>;
  const working = ceo.status === 'working';
  return (
    <div className="pk-card ceo-card">
      <div className="row">
        <Avatar name={ceo.name} color={ceo.color} />
        <div className="grow">
          <b>{ceo.name}</b> <span className="muted small">CEO</span>
        </div>
        <StatusPill status={ceo.status} />
      </div>
      <div className="small ceo-job">
        <b>Now:</b> {working ? (info.job?.label ?? 'working') : 'free'}
      </div>
      <div className="small ceo-queue" aria-label="The CEO's queue">
        <b>Up next:</b>{' '}
        {info.queue.length === 0 ? (
          <span className="muted">nothing queued</span>
        ) : (
          <ol className="ceo-queue-list">
            {info.queue.map((j, i) => (
              <li key={`${i}-${j.label}`}>{j.label}</li>
            ))}
          </ol>
        )}
      </div>
      <div className="pk-actions">
        <button className="btn btn-small btn-good" disabled={!repo} aria-expanded={planning} onClick={() => setPlanning(!planning)}>
          🧠 Plan floor…
        </button>
        <button className="btn btn-small" disabled={!repo} onClick={() => repo && void attempt(() => api.onboardFloor(repo.id))} title="Study the repo again and rethink the plan and the team's size">
          Onboard floor
        </button>
        <button className="btn btn-small" disabled={pick.sorted.length === 0} onClick={() => void attempt(() => api.ceoReview())}>
          🔎 Review the company now
        </button>
        {working && (
          <button className="btn btn-small btn-bad" onClick={() => void attempt(() => api.stop(ceo.id))}>
            ■ Stop
          </button>
        )}
      </div>
      {planning && repo && (
        <form
          className="ceo-plan"
          onSubmit={(e) => {
            e.preventDefault();
            if (!mission.trim()) return;
            void attempt(() => api.planFloor(repo.id, mission)).then((r) => r !== undefined && setPlanning(false));
          }}
        >
          <FloorSelect pick={pick} label="Floor to plan" />
          <textarea value={mission} onChange={(e) => setMission(e.target.value)} rows={3} placeholder="Mission: what should this floor build next? The CEO turns it into issues and a team size." aria-label="Mission" autoFocus />
          <div className="row">
            <button type="button" className="btn btn-small btn-ghost" onClick={() => setPlanning(false)}>
              Cancel
            </button>
            <span className="spacer" />
            <button className="btn btn-small btn-good" disabled={!mission.trim()}>
              Ask the CEO to plan it
            </button>
          </div>
        </form>
      )}
      {pick.sorted.length > 1 && !planning && (
        <div className="row small">
          <span className="muted">Onboard / plan:</span>
          <FloorSelect pick={pick} label="Floor to onboard or plan" />
        </div>
      )}
    </div>
  );
}

// ---------- the right column ----------

/** Pending team changes, each opening the interview dialog (its setup sheet). */
function Interviews() {
  const requests = useStore((s) => s.requests);
  const demo = useStore((s) => s.demo);
  const [open, setOpen] = useState<string | null>(null);
  const pending = pendingRequests(requests);
  const row = (r: HireRequestView) => (
    <div key={r.id} className="row small ceo-interview">
      <Avatar name={r.name} color={r.color} size={28} />
      <span className="grow">{r.kind === 'hire' ? `Interview ${r.name}` : `${r.name}'s let-go note`}</span>
      <button className="btn btn-small" onClick={() => setOpen(r.id)}>
        Open…
      </button>
    </div>
  );
  return (
    <section className="ceo-section" aria-label="Interviews">
      <h3 className="pk-h">🪑 Interview</h3>
      {pending.length === 0 && <p className="muted small">No one waiting. {demo ? 'In the demo, make one:' : 'New agents the CEO proposes wait here for their interview.'}</p>}
      {pending.map(row)}
      {demo && (
        <div className="row wrap small">
          <span className="muted">Demo:</span>
          <button className="btn btn-small btn-ghost" onClick={() => void attempt(() => api.demoPropose('hire'))}>
            👥 Grow a floor
          </button>
          <button className="btn btn-small btn-ghost" onClick={() => void attempt(() => api.demoPropose('let-go'))}>
            ✉️ Shrink a floor
          </button>
        </div>
      )}
      {open && <Interview requestId={open} onClose={() => setOpen(null)} />}
    </section>
  );
}

function Triage({ go }: { go: (r: Route) => void }) {
  const repos = useStore((s) => s.repos);
  const qa = useStore((s) => s.qa);
  const rows = ceoTriage(repos, qa);
  return (
    <section className="ceo-section" aria-label="Triage">
      <h3 className="pk-h">
        🩺 Triage {rows.length > 0 && <span className="badge">{rows.length}</span>}
      </h3>
      {rows.length === 0 && <p className="muted small">The CEO isn't looking at any stuck PR.</p>}
      {rows.map(({ repo, pr, qa: q }) => (
        <button key={`${repo.id}#${pr.number}`} className="pk-card ceo-triage-row" style={{ ['--accent' as string]: repo.color }} onClick={() => go({ role: 'review', floor: repo.floor, pr: pr.number })}>
          <span className="floor-badge">{repo.floor}</span>
          <span className="grow">
            <b>#{pr.number}</b> {pr.title}
            <span className="muted small ceo-triage-sub">needs you in round {q.round} · the CEO is looking first</span>
          </span>
        </button>
      ))}
    </section>
  );
}

function FileIssue() {
  const pick = useFloorPick();
  const agents = useStore((s) => s.agents);
  const repo = pick.repo;
  return (
    <section className="ceo-section ceo-file" aria-label="File an issue">
      <h3 className="pk-h">📝 File an issue</h3>
      {!repo ? (
        <p className="muted small">Connect a repo first.</p>
      ) : (
        <>
          <FloorSelect pick={pick} label="Floor to file the issue on" />
          <IssueForm key={repo.id} repoId={repo.id} agents={agentsOnRepo(agents, repo.id)} autoFocus={false} />
        </>
      )}
    </section>
  );
}

const ONE_PANE = '(max-width: 1024px)';

/** True where the two columns are panes, one at a time (styles.css `.dash-pane-off`). */
function useOnePane() {
  return useSyncExternalStore(
    (changed) => {
      const q = matchMedia(ONE_PANE);
      q.addEventListener('change', changed);
      return () => q.removeEventListener('change', changed);
    },
    () => matchMedia(ONE_PANE).matches,
  );
}

export function CeoPanel({ pane, go }: { pane: CeoPane; go: (r: Route) => void }) {
  const ceoName = useStore((s) => s.agents[CEO_ID]?.name ?? 'CEO');
  const chips: [CeoPane, string][] = [
    ['chat', `💬 ${ceoName}`],
    ['approvals', '✋ Approvals'],
  ];
  // Chat marks the thread read while mounted, so it's only there when it can be seen: on the approvals pane a new CEO
  // message must still toast and count as unread.
  const chatShown = useOnePane() ? pane === 'chat' : true;
  // While the chat is on screen, new CEO messages don't toast (the store reads this as the phone's chat being open).
  useEffect(() => {
    if (!chatShown) return;
    useStore.getState().openOverlay({ kind: 'phone', tab: 'chat' });
    return () => {
      if (useStore.getState().overlay?.kind === 'phone') useStore.getState().openOverlay(null);
    };
  }, [chatShown]);
  return (
    <div className="dash-ceo">
      <div className="pk-chips dash-narrow-only dash-chips-pad" role="tablist" aria-label="CEO">
        {chips.map(([k, text]) => (
          <button key={k} role="tab" aria-selected={k === pane} className={`pk-chip ${k === pane ? 'pk-chip-on' : ''}`} onClick={() => go({ role: 'ceo', pane: k })}>
            {text}
          </button>
        ))}
      </div>
      <section className={`dash-ceo-chat ${pane === 'chat' ? '' : 'dash-pane-off'}`} aria-label={`${ceoName} and chat`}>
        <div className="ceo-top">
          <CeoCard />
        </div>
        {chatShown && <Chat autoFocus={false} />}
      </section>
      <section className={`dash-ceo-side ${pane === 'approvals' ? '' : 'dash-pane-off'}`} aria-label="Approvals and the CEO's work">
        <Approvals />
        <div className="pk-page ceo-extra">
          <Interviews />
          <Triage go={go} />
          <FileIssue />
          <section className="ceo-section" aria-label="The CEO's settings">
            <h3 className="pk-h">⚙️ The CEO's settings</h3>
            <CeoSettingsCard />
          </section>
        </div>
      </section>
    </div>
  );
}
