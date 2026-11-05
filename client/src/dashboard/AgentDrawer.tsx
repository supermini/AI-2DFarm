// An agent in the right drawer: the terminal panel (status, terminal, message box, Stop, Clear desk, assign, sign-in,
// setup) without the 3D office's extras (no camera follow, look editor or career card). Anyone opens it with the store's
// `openOverlay({ kind: 'terminal', agentId })`: an agent chip, a Team row, the workers list, a tile's header.
import { useStore } from '../store';
import { CEO_ID } from '../../../shared/types';
import { closeOverlay } from '../ui/Panel';
import { TerminalView, type TerminalFrame } from '../ui/TerminalView';
import { Drawer } from './Drawer';
import { useShowAgents } from './visible';
import './terminals.css';

const DrawerFrame: TerminalFrame = ({ title, accent, children }) => (
  <Drawer title={title} accent={accent} wide onClose={closeOverlay}>
    <div className="dash-agent">{children}</div>
  </Drawer>
);

export function AgentDrawer({ agentId }: { agentId: string }) {
  // The office streams this agent's terminal lines while the drawer is out (the watch also has the overlay's agent).
  useShowAgents([agentId]);
  return <TerminalView key={agentId} agentId={agentId} frame={DrawerFrame} />;
}

/** The agent drawer, if the store's overlay is a terminal (the CEO's has its own place, the CEO screen). */
export function AgentDrawerHost() {
  const overlay = useStore((s) => s.overlay);
  return overlay?.kind === 'terminal' && overlay.agentId !== CEO_ID ? <AgentDrawer agentId={overlay.agentId} /> : null;
}
