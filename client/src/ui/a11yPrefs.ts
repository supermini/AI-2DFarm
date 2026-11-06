// The saved accessibility and comfort settings (localStorage `cubefarm:a11y`): captions, the status palette and shapes,
// motion comfort, UI scale and readability. Pure, so old, partial or corrupt values are tested without a browser. The
// defaults are exactly the office as it was, so nothing changes for anyone until they pick something.

import { PALETTES, type Palette } from './statusLook';

export type ReduceMotion = 'system' | 'on' | 'off';
export const REDUCE_MOTION: readonly ReduceMotion[] = ['system', 'on', 'off'];

export interface A11yPrefs {
  /** Captions for spoken messages and important sounds. */
  captions: boolean;
  /** Caption text size, percent of normal. */
  captionSize: number;
  /** Caption background opacity, percent. */
  captionBg: number;
  palette: Palette;
  /** A shape or icon beside every status colour. */
  statusShapes: boolean;
  /** 'system' follows the operating system's prefers-reduced-motion. */
  reduceMotion: ReduceMotion;
  /** HUD, phone, console and panels, percent. */
  uiScale: number;
  /** A plainer, wider-spaced font in the panels, easier to read with dyslexia. */
  readableFont: boolean;
  highContrast: boolean;
}

export const LIMITS = {
  captionSize: { min: 75, max: 200, step: 5 },
  captionBg: { min: 0, max: 100, step: 5 },
  uiScale: { min: 80, max: 150, step: 5 },
} as const;

export const DEFAULT_A11Y: A11yPrefs = {
  captions: false,
  captionSize: 100,
  captionBg: 75,
  palette: 'standard',
  statusShapes: false,
  reduceMotion: 'system',
  uiScale: 100,
  readableFont: false,
  highContrast: false,
};

type NumberKey = keyof typeof LIMITS;

/** A number in its range, snapped to its step, or the fallback when it's missing, not a number or out of range. */
function inRange(key: NumberKey, v: unknown): number {
  const { min, max, step } = LIMITS[key];
  if (typeof v !== 'number' || !Number.isFinite(v) || v < min || v > max) return DEFAULT_A11Y[key];
  return Math.min(max, Math.max(min, min + Math.round((v - min) / step) * step));
}

const bool = (v: unknown, fallback: boolean) => (typeof v === 'boolean' ? v : fallback);

/** Any saved value as complete, valid prefs: each bad field falls back to its default on its own. */
export function normalizeA11yPrefs(raw: unknown): A11yPrefs {
  const p = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  return {
    captions: bool(p.captions, DEFAULT_A11Y.captions),
    captionSize: inRange('captionSize', p.captionSize),
    captionBg: inRange('captionBg', p.captionBg),
    palette: PALETTES.includes(p.palette as Palette) ? (p.palette as Palette) : DEFAULT_A11Y.palette,
    statusShapes: bool(p.statusShapes, DEFAULT_A11Y.statusShapes),
    reduceMotion: REDUCE_MOTION.includes(p.reduceMotion as ReduceMotion) ? (p.reduceMotion as ReduceMotion) : DEFAULT_A11Y.reduceMotion,
    uiScale: inRange('uiScale', p.uiScale),
    readableFont: bool(p.readableFont, DEFAULT_A11Y.readableFont),
    highContrast: bool(p.highContrast, DEFAULT_A11Y.highContrast),
  };
}

/** The prefs saved as JSON text (null when nothing is saved). */
export function parseA11yPrefs(text: string | null): A11yPrefs {
  try {
    return normalizeA11yPrefs(JSON.parse(text ?? 'null'));
  } catch {
    return { ...DEFAULT_A11Y };
  }
}

/** Whether to cut non-essential motion: the setting, or with 'system', the operating system's preference. */
export const reducesMotion = (pref: ReduceMotion, systemPrefersReduced: boolean) => pref === 'on' || (pref === 'system' && systemPrefersReduced);

/** Status shapes show when asked for, and always with a colour-blind palette (colour alone is what it's there to fix). */
export const showsShapes = (p: Pick<A11yPrefs, 'statusShapes' | 'palette'>) => p.statusShapes || p.palette !== 'standard';
