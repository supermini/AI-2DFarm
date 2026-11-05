// A merge's coins, as the store hears them (a 'reward' event): CoinBurst.tsx bursts them over the author's desk and
// the HUD's coin chip counts them up. The channel is effects.ts's, so the store doesn't import world/. Nothing is
// queued: a reward nobody is listening for is dropped.
export { emitReward, onReward } from '../../effects';
