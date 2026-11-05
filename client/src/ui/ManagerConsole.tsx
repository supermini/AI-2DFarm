import { useState } from 'react';
import { pendingRequests, useStore, type ManagerTab } from '../store';
import { LookEditor } from './LookEditor';
import { CeoTab, FloorsTab, IssuesTab, SettingsCards, TeamTab } from './consoleSections';
import { OpsTab } from './MissionConsole';
import { NotifySettings } from './NotifySettings';
import { ProfileSettings } from './ProfileSettings';
import { Panel } from './Overlays';
import { ThemeSettings } from './ThemeSettings';
import { TimeLapseTab } from './TimeLapse';
import { VoiceSettings } from './VoiceSettings';
import { CloudSettings } from './CloudSettings';
import { AccessibilitySettings } from './AccessibilitySettings';
import { OutsideSettings } from './OutsideSettings';

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
        {tab === 'ceo' && <CeoTab onOpenPhone={() => useStore.getState().openOverlay({ kind: 'phone', tab: 'chat' })} />}
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
