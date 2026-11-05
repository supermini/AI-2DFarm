import { useStore } from './store';
import { restartExpected, shouldReload } from './officeUpdate';
import type { ClientEvent, ServerEvent } from '../../shared/types';
import { dashboardWatch } from './watch';
import { shownAgents, useVisible } from './dashboard/visible';

let retry = 0;
let socket: WebSocket | null = null;
let sentWatch = '';

/** Tells the office what this tab shows (watch.ts) whenever that changes, so it sends only the lines it needs. */
function sendWatch() {
  const state = useStore.getState();
  // The dashboard says what its screens show (dashboard/visible.ts).
  const shown = dashboardWatch({ ...state, floor: useVisible.getState().floor, shown: shownAgents(useVisible.getState()) });
  const watch = JSON.stringify({ type: 'lines', ...shown } satisfies ClientEvent);
  if (socket?.readyState !== WebSocket.OPEN || watch === sentWatch) return;
  sentWatch = watch;
  socket.send(watch);
}
let watching = false;
// Back from the time-lapse: everything waits for the fresh snapshot asked for, so nothing applies on top of the replay.
let awaitingSnapshot = false;
const OUTSIDE_REPLAY = new Set<ServerEvent['type']>(['notify', 'notifyChannels', 'settings', 'officeUpdate', 'clis', 'voiceKey', 'voiceCache']);

/** The time-lapse stopped: asks for the live office again (a reconnect brings a snapshot anyway). */
export function requestSnapshot() {
  awaitingSnapshot = true;
  if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: 'resync' } satisfies ClientEvent));
}

// The commit this tab last reloaded for, so a new office commit reloads the page at most once.
const RELOAD_KEY = 'office-swarm:reloaded-for';

function reloadedFor(): string | null {
  try {
    return sessionStorage.getItem(RELOAD_KEY);
  } catch {
    return null;
  }
}

/** The server came back on a different commit: load the client that goes with it. */
function reloadForNewCommit(commit: string): boolean {
  if (!shouldReload(useStore.getState().officeCommit, commit, reloadedFor())) return false;
  try {
    sessionStorage.setItem(RELOAD_KEY, commit);
  } catch {
    return false; // without storage we can't promise a single reload, so keep the old client
  }
  location.reload();
  return true;
}

export function connect() {
  // subscribed here, not as the module loads, so importing this module has no side effects
  if (!watching) {
    watching = true;
    useStore.subscribe(sendWatch);
    useVisible.subscribe(sendWatch);
  }
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  const ws = new WebSocket(`${proto}://${location.host}/ws`);
  socket = ws;
  ws.onopen = () => {
    retry = 0;
    sentWatch = '';
    useStore.getState().setConnected(true);
    sendWatch();
  };
  ws.onmessage = (e) => {
    try {
      const ev = JSON.parse(e.data) as ServerEvent;
      if (ev.type === 'snapshot' && ev.data.officeCommit && reloadForNewCommit(ev.data.officeCommit)) return;
      // While the time-lapse plays it owns the office; it asks for a fresh snapshot when it stops. What isn't part of
      // the replayed office (notifications, settings, the office's own update…) still applies.
      if (!OUTSIDE_REPLAY.has(ev.type)) {
        if (useStore.getState().replaying) return;
        if (awaitingSnapshot) {
          if (ev.type !== 'snapshot') return;
          awaitingSnapshot = false;
        }
      }
      useStore.getState().apply(ev);
    } catch (err) {
      console.error('bad server event', err);
    }
  };
  ws.onclose = () => {
    const s = useStore.getState();
    s.setConnected(false);
    // A drop while the office updates itself is the restart: say so, and look for it coming back sooner.
    const restarting = s.restarting || restartExpected(s.officeUpdate);
    if (restarting !== s.restarting) s.setRestarting(restarting);
    setTimeout(connect, Math.min(restarting ? 2000 : 8000, 500 * 2 ** retry++));
  };
}
