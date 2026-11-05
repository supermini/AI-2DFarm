import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { api } from '../api';
import { pendingRequests, useStore, type ManagerTab } from '../store';
import { CEO_ID, type RepoView } from '../../../shared/types';
import { EffortSelect, ModelInput, NameInput, PromptPreview } from './AgentSettings';
import { LookEditor } from './LookEditor';
import { attempt, FloorsTab, IssuesTab, SettingsCards, TeamTab } from './consoleSections';
import { LiveTerminal } from './LiveTerminal';
import { MicButton } from './MicButton';
import { OpsTab } from './MissionConsole';
import { NotifySettings } from './NotifySettings';
import { ProfileSettings } from './ProfileSettings';
import { Panel } from './Overlays';
import { Resume } from './Phone';
import { StatusPill } from './TerminalView';
import { ThemeSettings } from './ThemeSettings';
import { TimeLapseTab } from './TimeLapse';
import { VoiceSettings } from './VoiceSettings';
import { CloudSettings } from './CloudSettings';
import { AccessibilitySettings } from './AccessibilitySettings';
import { OutsideSettings } from './OutsideSettings';

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

function CeoTab() {
  const ceo = useStore((s) => s.agents[CEO_ID]);
  const log = useStore((s) => s.logs[CEO_ID]) ?? [];
  const info = useStore((s) => s.ceo);
  const repos = useStore((s) => s.repos);
  const requests = useStore((s) => s.requests);
  const openOverlay = useStore((s) => s.openOverlay);
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
            <button className="btn btn-small" onClick={() => openOverlay({ kind: 'phone', tab: 'chat' })}>
              📱 Open the phone
            </button>
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

// ---------- settings ----------

function SettingsTab() {
  return (
    <div className="tab-grid">
      <SettingsCards tour />
      <ProfileSettings />
      <CloudSettings />
      <VoiceSettings />
      <OutsideSettings />
      <NotifySettings />
      <ThemeSettings />
    </div>
  );
}

/** card: open Mission control at this card (an alarm's id, or 'usage'). */
export function ManagerConsole({ initialTab, initialRepo, card }: { initialTab?: ManagerTab; initialRepo?: string; card?: string }) {
  const [tab, setTab] = useState<ManagerTab>(initialTab ?? 'floors');
  const pending = useStore((s) => pendingRequests(s.requests).length);
  const alarms = useStore((s) => s.ops.alarms.length + s.doctor.length);
  const tabs: [ManagerTab, string][] = [
    ['floors', '🏢 Floors & repos'],
    ['ops', `🛰️ Mission control${alarms ? ` (${alarms})` : ''}`],
    ['ceo', `🧠 CEO${pending ? ` (${pending})` : ''}`],
    ['team', '👩‍💻 Team'],
    ['issues', '📝 Issues'],
    ['settings', '⚙️ Settings'],
    ['timelapse', '📼 Time-lapse'],
    ['access', '♿ Accessibility'],
  ];
  return (
    <Panel wide title="🧑‍💼 Manager's console">
      <div className="tabs" role="tablist" aria-label="Console">
        {tabs.map(([k, label]) => (
          <button key={k} role="tab" aria-selected={tab === k} className={`tab ${tab === k ? 'tab-on' : ''}`} onClick={() => setTab(k)}>
            {label}
          </button>
        ))}
      </div>
      <div className="tab-body" role="tabpanel" aria-label={tabs.find(([k]) => k === tab)?.[1]}>
        {tab === 'floors' && <FloorsTab />}
        {tab === 'ops' && <OpsTab card={card} />}
        {tab === 'ceo' && <CeoTab />}
        {tab === 'team' && <TeamTab lookEditor={(a) => <LookEditor agent={a} />} />}
        {tab === 'issues' && <IssuesTab initialRepo={initialRepo} />}
        {tab === 'settings' && <SettingsTab />}
        {tab === 'timelapse' && <TimeLapseTab />}
        {tab === 'access' && (
          <div className="tab-grid a11y-grid">
            <AccessibilitySettings />
          </div>
        )}
      </div>
    </Panel>
  );
}
