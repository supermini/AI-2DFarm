import { describe, expect, it } from 'vitest';
import { DROP_NEW, PLAY, voiceToDrop } from './sfxMix';

describe('voiceToDrop', () => {
  const voices = (...loud: number[]) => loud.map((l) => ({ loud: l }));

  it('plays anything while under the cap', () => {
    expect(voiceToDrop(voices(0.1, 0.2), 0.01, 3)).toBe(PLAY);
  });

  it('drops a new sound that is quieter than everything playing', () => {
    expect(voiceToDrop(voices(0.1, 0.2, 0.3), 0.05, 3)).toBe(DROP_NEW);
    expect(voiceToDrop(voices(0.1, 0.2, 0.3), 0.1, 3)).toBe(DROP_NEW);
  });

  it('stops the quietest sound for a louder new one', () => {
    expect(voiceToDrop(voices(0.2, 0.02, 0.3), 0.1, 3)).toBe(1);
  });

  it('drops everything with a cap of zero', () => {
    expect(voiceToDrop([], 1, 0)).toBe(DROP_NEW);
  });
});
