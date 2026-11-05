// The dashboard's right drawer: the context item (a PR, later an issue or an agent) beside the page. It holds the
// keyboard like a dialog (ui/dialogFocus.ts) and Esc closes it, unless another dialog (a terminal, a panel) is on top.
import { useEffect, useId, useRef, type ReactNode } from 'react';
import { topDialog, useDialogFocus } from '../ui/dialogFocus';

export function Drawer({ title, onClose, children }: { title: ReactNode; onClose: () => void; children: ReactNode }) {
  const box = useRef<HTMLElement>(null);
  const titleId = useId();
  useDialogFocus(box);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || topDialog() !== box.current) return;
      e.preventDefault();
      onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <aside ref={box} className="dash-drawer" role="dialog" aria-modal="false" aria-labelledby={titleId} tabIndex={-1}>
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
