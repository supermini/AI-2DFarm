import { create } from 'zustand';
import { defaultControls, keyLabel, normaliseControls, type ActionId, type Controls } from './keymap';

// The keyboard's controls: key bindings saved in this browser and read back through normaliseControls (keymap.ts), so a
// corrupt value falls back to the defaults. Every keyboard shortcut asks here which keys are its.

const STORAGE_KEY = 'cubefarm:controls';

function load(): Controls {
  try {
    return normaliseControls(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null'));
  } catch {
    return defaultControls();
  }
}

export const useControls = create<Controls>(() => load());

/** The bindings right now (read in key handlers; never stale). */
export const bindings = () => useControls.getState().bindings;

const nameOf = (keys: string[]) => (keys[0] ? keyLabel(keys[0]) : '—');

/** The label of `action`'s main key ('—' with none), for text outside React. */
export const keyName = (action: ActionId) => nameOf(bindings()[action]);

/** The label of `action`'s main key, kept up to date. */
export const useKeyName = (action: ActionId) => useControls((s) => nameOf(s.bindings[action]));
