// The dashboard's right drawer: the context item (a PR, an agent) beside the page. It is not modal: the page stays
// usable next to it, so Tab is not trapped. Focus moves in when it opens and goes back to where it was when it closes,
// and Esc closes the topmost drawer, unless a modal dialog (a panel, a confirmation) is on top of it. An Esc typed into a
// terminal never gets here: LiveTerminal keeps it for the agent (it interrupts them).
import { useEffect, useId, useRef, useState, type ReactNode, type RefObject } from 'react';
import { dialogOpen } from '../ui/dialogFocus';

/** The open drawers, oldest first: Esc is for the last one. */
const open: HTMLElement[] = [];

function useDrawerFocus(ref: RefObject<HTMLElement | null>) {
  // Who had focus before the drawer, noted while rendering: by the time effects run, an autofocused field inside has it.
  const [before] = useState(() => (typeof document !== 'undefined' && document.activeElement instanceof HTMLElement ? document.activeElement : null));
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    open.push(el);
    if (!el.contains(document.activeElement)) el.focus({ preventScroll: true });
    return () => {
      open.splice(open.indexOf(el), 1);
      // Only when focus was left with the drawer (or nowhere): someone who clicked on into the page keeps their place.
      const active = document.activeElement;
      if ((active === document.body || !active) && before && before !== document.body && before.isConnected && !el.contains(before)) before.focus({ preventScroll: true });
    };
  }, [ref, before]);
}

export function Drawer({
  title,
  onClose,
  children,
  accent,
  wide,
}: {
  title: ReactNode;
  onClose: () => void;
  children: ReactNode;
  /** The head's colour (an agent's). */
  accent?: string;
  /** Wide enough for a terminal. */
  wide?: boolean;
}) {
  const box = useRef<HTMLElement>(null);
  const titleId = useId();
  useDrawerFocus(box);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented || dialogOpen() || open[open.length - 1] !== box.current) return;
      e.preventDefault();
      onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <aside
      ref={box}
      className={`dash-drawer ${wide ? 'dash-drawer-wide' : ''}`}
      style={accent ? { ['--accent' as string]: accent } : undefined}
      role="dialog"
      aria-modal="false"
      aria-labelledby={titleId}
      tabIndex={-1}
    >
      <div className="dash-drawer-head">
        <h2 id={titleId} className="dash-drawer-title">
          {title}
        </h2>
        <button className="panel-x" onClick={onClose} aria-label="Close (Esc)" title="Close (Esc)">
          ✕
        </button>
      </div>
      <div className="dash-drawer-body">{children}</div>
    </aside>
  );
}
