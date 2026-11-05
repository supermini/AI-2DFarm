// The activity ticker in the shell's top bar: the latest line as a chip, and the recent ones in a small list under it.
// The lines are the `ticker` events the store keeps (oldest first, across every floor), the same ones the 3D lobby shows.
import { useEffect, useRef, useState } from 'react';
import { useStore } from '../store';
import type { TickerItem } from '../../../shared/types';
import './metrics.css';

const SHOWN = 20;
const hhmm = (t: number) => new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
const TONE_ICON: Record<TickerItem['tone'], string> = { good: '✅', bad: '⚠️', info: '•' };

export function ActivityFeed() {
  const ticker = useStore((s) => s.ticker);
  const repos = useStore((s) => s.repos);
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);
  const last = ticker[ticker.length - 1];
  if (!last) return null;
  const recent = ticker.slice(-SHOWN).reverse();
  const floorOf = (id: string) => repos.find((r) => r.id === id)?.floor;
  return (
    <div className="act" ref={box}>
      <button className={`chip act-chip act-${last.tone}`} aria-expanded={open} aria-haspopup="true" title="Recent activity" onClick={() => setOpen((o) => !o)}>
        <span aria-hidden>{TONE_ICON[last.tone]}</span>
        <span className="act-last">{last.text}</span>
      </button>
      {open && (
        <ul className="act-list" aria-label="Recent activity">
          {recent.map((t) => (
            <li key={t.id} className={`act-${t.tone}`}>
              <span className="act-time muted small">{hhmm(t.at)}</span>
              <span className="act-text">{t.text}</span>
              {floorOf(t.repoId) !== undefined && <span className="muted small">· floor {floorOf(t.repoId)}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
