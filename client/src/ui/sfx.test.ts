import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SfxRecord } from './sfx';

// The sound core on its own: no WebAudio, so sounds are recorded in window.__swarmSfx but not played.
const win: Record<string, unknown> = { addEventListener: () => undefined };
vi.stubGlobal('window', win);

const core = async () => import('./sfx');
const probe = () => win.__swarmSfx as SfxRecord[];

beforeEach(() => vi.resetModules());
afterEach(() => vi.useRealTimers());

describe('sfx core', () => {
  it('records a sound flat: full level', async () => {
    const sfx = await core();
    const heard: boolean[] = [];
    sfx.onSoundRecorded((_, h) => heard.push(h));
    const rec = sfx.recordSfx('ding', { group: 'alerts', peak: 0.2 });
    expect(rec.gain).toBeCloseTo(0.2);
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
});
