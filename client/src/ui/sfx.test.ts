import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SfxRecord, Spatial } from './sfx';

// The 2D core on its own (pocket mode): no sfxSpatial.ts, so no listener, distance, panning or walls.
const win: Record<string, unknown> = { addEventListener: () => undefined };
vi.stubGlobal('window', win);

const core = async () => import('./sfx');
const probe = () => win.__swarmSfx as SfxRecord[];

beforeEach(() => vi.resetModules());
afterEach(() => vi.useRealTimers());

describe('sfx core without the 3D side', () => {
  it('records a placed sound flat: full level, no pan, not culled for distance', async () => {
    const sfx = await core();
    const heard: boolean[] = [];
    sfx.onSoundRecorded((_, h) => heard.push(h));
    const rec = sfx.recordSfx('ding', { group: 'alerts', pos: { x: 500, y: 0, z: 0 }, peak: 0.2 });
    expect(sfx.spatialSide()).toBeNull();
    expect(rec.at).toEqual({ x: 500, y: 0, z: 0 });
    expect(rec.gain).toBeCloseTo(0.2);
    expect(rec.pan).toBe(0);
    expect(heard).toEqual([true]);
  });

  it('plays event cues, rate-limited, while audio is still locked', async () => {
    vi.useFakeTimers();
    const sfx = await core();
    sfx.cue('welcome');
    sfx.cue('error'); // gathered with the welcome: the more important one plays
    vi.advanceTimersByTime(200);
    const names = new Set(probe().map((r) => r.name));
    expect(names).toEqual(new Set(['cue:error']));
    expect(probe().every((r) => !r.played)).toBe(true);
  });

  it('holds the music duck before the jukebox loads, and hands it over when it does', async () => {
    const sfx = await core();
    const release = sfx.holdMusicDuck();
    const gone = sfx.holdMusicDuck();
    gone(); // released before any music: never reaches it
    const held: string[] = [];
    sfx.onMusicDuck(() => {
      held.push('hold');
      return () => held.push('release');
    });
    expect(held).toEqual(['hold']);
    release();
    release();
    expect(held).toEqual(['hold', 'release']);
    sfx.holdMusicDuck()();
    expect(held).toEqual(['hold', 'release', 'hold', 'release']);
  });

  it('measures placed sounds through the 3D side once it registers', async () => {
    const sfx = await core();
    const spatial: Spatial = {
      measure: () => ({ gain: 0.5, pan: -1 }),
      hear: () => null,
      route: (_c, _p, _w, dest) => dest,
      wire: () => undefined,
      ears: () => ({ at: { x: 0, y: 0, z: 0 }, fwd: { x: 0, y: 0, z: -1 } }),
      anchorOf: () => null,
      detailOf: async () => undefined,
    };
    sfx.registerSpatial(spatial);
    const rec = sfx.recordSfx('ding', { pos: { x: 3, y: 0, z: 0 }, peak: 0.2 });
    expect(rec.gain).toBeCloseTo(0.1);
    expect(rec.pan).toBe(-1);
    expect(sfx.recordSfx('chirp', { pan: 0.3, peak: 0.2 }).pan).toBe(0.3);
  });
});
