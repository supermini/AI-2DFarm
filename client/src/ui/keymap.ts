// The dashboard's key bindings: the two keys the office reads (mute and the microphone's hold-to-talk), their
// defaults, and the pure helpers around them: labels for <kbd>, which keys can be bound, and reading saved bindings
// back. Keys are KeyboardEvent.code values, so a binding is a physical key whatever the keyboard layout.

export type ActionId = 'mute' | 'talk';

export interface ActionDef {
  id: ActionId;
  label: string;
  /** Default keys, the main one first. */
  keys: readonly string[];
}

export const ACTIONS: readonly ActionDef[] = [
  { id: 'mute', label: 'Mute', keys: ['KeyM'] },
  { id: 'talk', label: 'Hold to talk (in a message box)', keys: ['KeyV'] },
];

export const ACTION_IDS = ACTIONS.map((a) => a.id);

export type Bindings = Record<ActionId, string[]>;

export const defaultBindings = (): Bindings => Object.fromEntries(ACTIONS.map((a) => [a.id, [...a.keys]])) as Bindings;

/** Keys that can't be bound: Esc lets go of the mouse and backs out of things, and the rest belong to the browser or OS. */
export const RESERVED = new Set(['Escape', 'MetaLeft', 'MetaRight', 'OSLeft', 'OSRight', 'ContextMenu', 'F5', 'F11', 'F12', 'PrintScreen']);

/** A key that can be bound: a KeyboardEvent.code that isn't reserved. */
export const bindable = (code: unknown): code is string => typeof code === 'string' && /^[A-Za-z][A-Za-z0-9]{0,31}$/.test(code) && !RESERVED.has(code);

const NAMED: Record<string, string> = {
  ArrowUp: '↑',
  ArrowDown: '↓',
  ArrowLeft: '←',
  ArrowRight: '→',
  ShiftLeft: 'Shift',
  ShiftRight: 'Shift',
  ControlLeft: 'Ctrl',
  ControlRight: 'Ctrl',
  AltLeft: 'Alt',
  AltRight: 'Alt',
  Space: 'Space',
  Tab: 'Tab',
  Enter: 'Enter',
  NumpadEnter: 'Num Enter',
  Backspace: 'Backspace',
  CapsLock: 'Caps Lock',
  Minus: '−',
  Equal: '+',
  NumpadSubtract: 'Num −',
  NumpadAdd: 'Num +',
  NumpadMultiply: 'Num *',
  NumpadDivide: 'Num /',
  NumpadDecimal: 'Num .',
  BracketLeft: '[',
  BracketRight: ']',
  Semicolon: ';',
  Quote: "'",
  Comma: ',',
  Period: '.',
  Slash: '/',
  Backslash: '\\',
  Backquote: '`',
  IntlBackslash: '\\',
  Insert: 'Ins',
  Delete: 'Del',
  Home: 'Home',
  End: 'End',
  PageUp: 'PgUp',
  PageDown: 'PgDn',
};

/** How a key reads on a <kbd>: 'KeyE' → 'E', 'ArrowUp' → '↑', 'ShiftLeft' → 'Shift'. */
export function keyLabel(code: string): string {
  const letter = /^Key([A-Z])$/.exec(code);
  if (letter) return letter[1];
  const digit = /^Digit(\d)$/.exec(code);
  if (digit) return digit[1];
  const pad = /^Numpad(\d)$/.exec(code);
  if (pad) return `Num ${pad[1]}`;
  return NAMED[code] ?? code;
}

// ---------- saved controls (per browser, in localStorage) ----------

export interface Controls {
  bindings: Bindings;
}

export const defaultControls = (): Controls => ({ bindings: defaultBindings() });

/**
 * Saved controls as they came out of storage (anything at all) to valid ones: an action whose keys aren't a list of
 * bindable codes gets its defaults back, and duplicates and extra keys are dropped. Actions the 3D office saved (and
 * its gamepad sensitivity) are simply not read any more.
 */
export function normaliseControls(raw: unknown): Controls {
  const out = defaultControls();
  if (!raw || typeof raw !== 'object') return out;
  const r = raw as { bindings?: unknown };
  if (r.bindings && typeof r.bindings === 'object') {
    const saved = r.bindings as Record<string, unknown>;
    for (const id of ACTION_IDS) {
      const keys = saved[id];
      if (!Array.isArray(keys) || !keys.every(bindable)) continue;
      out.bindings[id] = [...new Set(keys as string[])].slice(0, 2);
    }
  }
  return out;
}
