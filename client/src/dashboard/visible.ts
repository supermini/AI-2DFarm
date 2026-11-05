// What the dashboard shows beyond the store's overlay, for the watch it sends (watch.ts `dashboardWatch`): the floor the
// screen is on and the agents whose drawer or terminal is on screen. Screens publish while mounted; net.ts reads it.
import { useEffect, useId } from 'react';
import { create } from 'zustand';

interface Visible {
  /** The floor the current screen is on; null on all floors and on screens without floors. */
  floor: number | null;
  /** Agents on screen, by the component showing them (a drawer, a terminals grid). */
  shown: Record<string, string[]>;
}

export const useVisible = create<Visible>(() => ({ floor: null, shown: {} }));

/** Every agent any component shows, once each. */
export const shownAgents = (v: Pick<Visible, 'shown'>): string[] => [...new Set(Object.values(v.shown).flat())];

/** While mounted, the office sends this component's agents' terminal lines. */
export function useShowAgents(ids: readonly string[]) {
  const owner = useId();
  const key = ids.join('\n');
  useEffect(() => {
    useVisible.setState((v) => ({ shown: { ...v.shown, [owner]: key ? key.split('\n') : [] } }));
    return () =>
      useVisible.setState((v) => {
        const { [owner]: _gone, ...rest } = v.shown;
        return { shown: rest };
      });
  }, [owner, key]);
}

/** While mounted, the screen is on this floor (null: all floors or none). */
export function useShowFloor(floor: number | null) {
  useEffect(() => {
    useVisible.setState({ floor });
    return () => useVisible.setState({ floor: null });
  }, [floor]);
}
