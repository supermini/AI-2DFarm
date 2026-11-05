// The store's and the time-lapse's side effects, as typed channels: store.ts and replay.ts emit here and whatever draws
// them subscribes (the 3D office's modules in world/ when they load), so neither imports world/ and a 2D view loads
// none of it. An emit nobody listens for is dropped, except on sticky channels, which keep their latest value and
// hand it to each new listener: the roster and the replay's state can arrive before the lazy 3D chunk subscribes.
import type { RewardView } from '../../shared/progress';
import type { ServerEvent } from '../../shared/types';
import type { MergeBurst } from './merges';

type Fn<A extends unknown[], R> = (...args: A) => R;

export interface Channel<A extends unknown[], R = void> {
  /** Listens until the returned function is called. On a sticky channel, first hears the latest emit, if any. */
  on(fn: Fn<A, R>): () => void;
  emit(...args: A): void;
  /** Emits and returns each listener's answer (none when nobody listens). */
  ask(...args: A): R[];
}

/** A channel; `sticky` keeps the latest arguments for listeners that come later. */
export function channel<A extends unknown[], R = void>(sticky = false): Channel<A, R> {
  const fns = new Set<Fn<A, R>>();
  let last: A | null = null;
  return {
    on(fn) {
      fns.add(fn);
      if (last) fn(...last);
      return () => void fns.delete(fn);
    },
    emit(...args) {
      if (sticky) last = args;
      for (const fn of fns) fn(...args);
    },
    ask(...args) {
      if (sticky) last = args;
      return [...fns].map((fn) => fn(...args));
    },
  };
}

// ---------- the channels ----------

/** A PR merged (store.ts, after the floor updates): the confetti over its author's desk, the dog. */
export const merge = channel<[b: MergeBurst]>();
/**
 * A PR merged (store.ts, as it sees it): does that floor's gong take it? True when the gong runs or booms; no `true`
 * from anyone and the store chimes instead. `covered`: a panel covers the 3D view.
 */
export const mergeGong = channel<[b: MergeBurst, covered: boolean], boolean>();
/** A merge's coins (a 'reward' event). */
export const reward = channel<[r: RewardView]>();

export type RosterEvent = Extract<ServerEvent, { type: 'visitors' }>;
export type VisitorEvent = Extract<ServerEvent, { type: 'visitorPose' | 'visitorEmote' | 'visitorPing' }>;
/** The office's visitors (sticky: sent once on connect). `floor`: the floor this tab shows. */
export const roster = channel<[ev: RosterEvent, floor: number]>(true);
/** A visitor's pose, emote or ping. */
export const visitor = channel<[ev: VisitorEvent, floor: number]>();

/** The time-lapse's moment on screen (epoch ms), null when it stops (sticky). */
export const replayTime = channel<[at: number | null]>(true);
/** How loud the gong booms, 0-1: quieter while the time-lapse plays (sticky). */
export const gongVolume = channel<[level: number]>(true);

export const onMerge = merge.on;
export const emitMerge = merge.emit;
export const onReward = reward.on;
export const emitReward = reward.emit;
