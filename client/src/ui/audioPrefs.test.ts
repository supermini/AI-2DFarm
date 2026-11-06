import { describe, expect, it } from 'vitest';
import { DEFAULT_AUDIO_PREFS, normalizeAudioPrefs, parseAudioPrefs, sliderGain } from './audioPrefs';

describe('parseAudioPrefs', () => {
  it('uses the defaults when nothing is saved', () => {
    expect(parseAudioPrefs(null)).toEqual(DEFAULT_AUDIO_PREFS);
    expect(DEFAULT_AUDIO_PREFS).toMatchObject({ alerts: 100, voice: 100 });
    expect(DEFAULT_AUDIO_PREFS).toMatchObject({ mergeChime: false });
  });

  it('keeps old { volume, muted } settings and fills in the groups', () => {
    expect(parseAudioPrefs('{"volume":40,"muted":true}')).toEqual({
      volume: 40,
      muted: true,
      mergeChime: false,
      alerts: 100,
      voice: 100,
    });
  });

  it('still loads settings saved by the 3D office, dropping what the dashboard no longer has', () => {
    expect(
      parseAudioPrefs(
        '{"volume":55,"muted":false,"mergeChime":true,"steps":0,"typing":35,"babble":40,"toys":80,"alerts":60,"music":45,"voice":70,"outside":60,"score":10,"soundtrack":false,"chatter":"lively","silentBubbles":true}',
      ),
    ).toEqual({
      volume: 55,
      muted: false,
      mergeChime: true,
      alerts: 60,
      voice: 70,
    });
  });

  it('round-trips saved group levels', () => {
    const saved = { volume: 55, muted: false, mergeChime: true, alerts: 100, voice: 60 };
    expect(parseAudioPrefs(JSON.stringify(saved))).toEqual(saved);
  });

  it('falls back to the defaults for corrupt JSON or a non-object', () => {
    for (const text of ['{oops', 'undefined', '42', '"loud"', '[1,2]', 'null']) expect(parseAudioPrefs(text)).toEqual(DEFAULT_AUDIO_PREFS);
  });
});

describe('normalizeAudioPrefs', () => {
  it('replaces out-of-range or non-numeric values with their default, one by one', () => {
    expect(normalizeAudioPrefs({ volume: 140, muted: 'yes', alerts: -5, voice: '50' })).toEqual(DEFAULT_AUDIO_PREFS);
    expect(normalizeAudioPrefs({ volume: null, alerts: Infinity, voice: {} })).toEqual(DEFAULT_AUDIO_PREFS);
  });

  it('keeps the ends of the range and rounds to whole percent', () => {
    expect(normalizeAudioPrefs({ volume: 0, alerts: 100, voice: 33.6 })).toMatchObject({ volume: 0, alerts: 100, voice: 34 });
  });

  it('ignores unknown keys, including the 3D office’s groups and toggles', () => {
    expect(normalizeAudioPrefs({ volume: 10, radio: 50, steps: 0, soundtrack: false, chatter: 'lively', silentBubbles: true })).toEqual({ ...DEFAULT_AUDIO_PREFS, volume: 10 });
  });
});

describe('sliderGain', () => {
  it('maps 0-100 to a squared 0-1 gain', () => {
    expect(sliderGain(0)).toBe(0);
    expect(sliderGain(50)).toBe(0.25);
    expect(sliderGain(100)).toBe(1);
  });
});
