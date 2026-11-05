// Merge confetti's 3D side: when a burst plays, and the office's hearing of merges (effects.ts): MergeConfetti.tsx
// and the dog listen, and the gong run (gongRunner.ts) answers whether its floor's gong takes one. Nothing is queued:
// a merge nobody is listening for is dropped. Which PRs merged is the pure merges.ts.
import { mergeGong } from '../effects';
import { gongForMerge } from './gongRunner';

// Moved to ../qaRecord and ../merges so the store doesn't import from world/.
export { recentQaRecord, rememberQa } from '../qaRecord';
export { mergeAuthor, mergeBursts, newlyMerged, type MergeBurst } from '../merges';
export { emitMerge, onMerge } from '../effects';

// The gong hears merges here: OfficeFloor.tsx loads this with Gong.tsx.
mergeGong.on((b, covered) => gongForMerge(b, covered) !== 'absent');

/**
 * What a burst starting now is: flying confetti, a soft glow that fades in and out where it would fly (with reduced
 * motion), or nothing. A hidden tab or a panel covering the view stops the frame loop, so a burst started then would
 * freeze and play when the view comes back: it's dropped instead.
 */
export const burstKind = (o: { hidden: boolean; covered: boolean; reducedMotion: boolean }): 'confetti' | 'glow' | null =>
  o.hidden || o.covered ? null : o.reducedMotion ? 'glow' : 'confetti';

/** Whether a flying burst (coins, confetti) may start now: not hidden, not covered, and not with reduced motion. */
export const canBurst = (o: { hidden: boolean; covered: boolean; reducedMotion: boolean }) => burstKind(o) === 'confetti';
