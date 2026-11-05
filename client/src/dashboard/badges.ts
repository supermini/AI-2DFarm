// The dashboard's role badges (rail and tab bar): what waits on the manager, per role. Pure, from the store's fields,
// and built from the helpers pocket mode and the 3D console use so the counts match them.
import type { DoctorFinding, HireRequestView, OpsAlarm, PhoneMessage, QaView, RepoView } from '../../../shared/types';
import { needsManager } from '../qaCard';
import { approvalsBadge, waitingOnYou } from '../pocket/pocketData';
import { unreadMessages, type Agent } from '../store';
import type { Role } from './route';

export interface BadgeInput {
  repos: RepoView[];
  qa: Record<string, QaView>;
  requests: HireRequestView[];
  messages: PhoneMessage[];
  /** When the manager last read the CEO's messages (the store's phoneReadAt). */
  readAt: number;
  agents: Record<string, Pick<Agent, 'status'>>;
  alarms: OpsAlarm[];
  doctor: DoctorFinding[];
}

export type RoleBadges = Record<Role, number>;

/**
 * CEO: decisions waiting on you (hire requests, PRs stuck on you: pocket's Approvals badge) plus unread CEO messages.
 * Developer: agents in error. Reviewer: open PRs that need you plus passed ones on floors that don't merge on their
 * own. Metrics: Mission control's alarms plus the office doctor's findings (the console tab's count).
 */
export function roleBadges(x: BadgeInput): RoleBadges {
  const waiting = waitingOnYou(x.repos, x.qa, x.requests);
  return {
    ceo: approvalsBadge(waiting) + unreadMessages(x.messages, x.readAt),
    dev: Object.values(x.agents).filter((a) => a.status === 'error').length,
    review: waiting.stuck.filter((s) => needsManager(s.qa)).length + waiting.ready.length,
    metrics: x.alarms.length + x.doctor.length,
    settings: 0,
  };
}
