// The mixer's pure decisions (no WebAudio, so they can be unit tested): which sound gives way when too many play at
// once.

/** How many sounds may be alive at once. */
export const VOICE_CAP = 24;

/** `voiceToDrop` results besides an index into `alive`. */
export const PLAY = -1;
export const DROP_NEW = -2;

/**
 * The voice cap. With room left the new sound just plays (PLAY). Over the cap the quietest sound gives way: the new
 * one is dropped (DROP_NEW) unless it's louder than the quietest one alive, which is then stopped (its index).
 * `loud` is a sound's peak.
 */
export function voiceToDrop(alive: readonly { loud: number }[], loud: number, cap = VOICE_CAP): number {
  if (alive.length < cap) return PLAY;
  let quietest = -1;
  for (let i = 0; i < alive.length; i++) if (quietest < 0 || alive[i].loud < alive[quietest].loud) quietest = i;
  return quietest < 0 || loud <= alive[quietest].loud ? DROP_NEW : quietest;
}
