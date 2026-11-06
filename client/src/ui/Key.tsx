import { useKeyName } from './controls';
import type { ActionId } from './keymap';

// The player's own keys on screen: help and hints show whatever is bound.

/** `action`'s main key as a <kbd>. */
export function Key({ action }: { action: ActionId }) {
  return <kbd>{useKeyName(action)}</kbd>;
}
