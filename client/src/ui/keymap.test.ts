import { describe, expect, it } from 'vitest';
import { bindable, defaultBindings, defaultControls, keyLabel, normaliseControls } from './keymap';

describe('default bindings', () => {
  it("keep the dashboard's keys", () => {
    const b = defaultBindings();
    expect(b.mute).toEqual(['KeyM']);
    expect(b.talk).toEqual(['KeyV']);
  });
});

describe('keyLabel', () => {
  it('reads like the key cap', () => {
    expect(keyLabel('KeyE')).toBe('E');
    expect(keyLabel('KeyV')).toBe('V');
    expect(keyLabel('KeyM')).toBe('M');
    expect(keyLabel('Digit3')).toBe('3');
    expect(keyLabel('Numpad7')).toBe('Num 7');
    expect(keyLabel('ArrowLeft')).toBe('←');
    expect(keyLabel('ShiftRight')).toBe('Shift');
    expect(keyLabel('Minus')).toBe('−');
    expect(keyLabel('Equal')).toBe('+');
    expect(keyLabel('Tab')).toBe('Tab');
    expect(keyLabel('F7')).toBe('F7');
  });
});

describe('normaliseControls', () => {
  it('falls back to the defaults for anything that is not saved controls', () => {
    for (const raw of [null, undefined, 42, 'KeyE', [], true]) expect(normaliseControls(raw)).toEqual(defaultControls());
  });

  it('keeps good bindings and resets broken ones action by action', () => {
    const c = normaliseControls({
      bindings: { talk: ['KeyT'], mute: ['KeyN', 'KeyN', 'KeyO', 'KeyI'], made_up: ['KeyZ'] },
    });
    expect(c.bindings.talk).toEqual(['KeyT']);
    expect(c.bindings.mute).toEqual(['KeyN', 'KeyO']); // deduped, at most two
    expect('made_up' in c.bindings).toBe(false);
  });

  it('keeps an action the player left without a key', () => {
    expect(normaliseControls({ bindings: { talk: [] } }).bindings.talk).toEqual([]);
  });

  it('drops the 3D office’s actions and gamepad sensitivity from an old save', () => {
    const c = normaliseControls({
      bindings: { forward: ['KeyW'], interact: ['KeyE'], talk: ['KeyV'], mute: ['KeyM'] },
      padSensitivity: 2,
    });
    expect(c.bindings.talk).toEqual(['KeyV']);
    expect(c.bindings.mute).toEqual(['KeyM']);
    expect(Object.keys(c.bindings).sort()).toEqual(['mute', 'talk']);
  });

  it('round-trips through JSON', () => {
    const saved = JSON.parse(JSON.stringify({ bindings: { talk: ['KeyT'], mute: ['KeyM'] } }));
    expect(normaliseControls(saved)).toEqual({ bindings: { talk: ['KeyT'], mute: ['KeyM'] } });
  });

  it('refuses reserved keys and non-codes', () => {
    expect(bindable('Escape')).toBe(false);
    expect(bindable('KeyV')).toBe(true);
  });
});
