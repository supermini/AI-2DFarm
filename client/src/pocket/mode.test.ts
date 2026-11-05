import { describe, expect, it } from 'vitest';
import { pickMode } from './mode';

describe('view mode', () => {
  const none = { office: null, pocket: null, saved: null };

  it('opens the dashboard by default', () => {
    expect(pickMode(none)).toBe('dashboard');
  });

  it("follows this device's own choice", () => {
    expect(pickMode({ ...none, saved: 'office' })).toBe('office');
    expect(pickMode({ ...none, saved: 'dashboard' })).toBe('dashboard');
    expect(pickMode({ ...none, saved: 'pocket' })).toBe('dashboard');
    expect(pickMode({ ...none, saved: 'nonsense' })).toBe('dashboard');
  });

  it('keeps ?pocket working over the saved choice', () => {
    expect(pickMode({ ...none, pocket: '' })).toBe('dashboard');
    expect(pickMode({ ...none, pocket: '1', saved: 'office' })).toBe('dashboard');
    expect(pickMode({ ...none, pocket: '0' })).toBe('office');
    expect(pickMode({ ...none, pocket: 'false' })).toBe('office');
  });

  it('opens the 3D office only on ?office=3d or a choice for it', () => {
    expect(pickMode({ ...none, office: '3d' })).toBe('office');
    expect(pickMode({ ...none, office: '3d', pocket: '1' })).toBe('office');
    expect(pickMode({ ...none, office: '2d', saved: 'office' })).toBe('dashboard');
    expect(pickMode({ ...none, office: 'x' })).toBe('dashboard');
  });
});
