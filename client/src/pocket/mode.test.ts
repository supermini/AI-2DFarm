import { describe, expect, it } from 'vitest';
import { pickMode } from './mode';

// The tests run in whichever build flag the environment has, so say which build each one is about.
const with3d = (x: Parameters<typeof pickMode>[0]) => pickMode(x, true);

describe('view mode', () => {
  const none = { office: null, pocket: null, saved: null };

  it('opens the dashboard by default', () => {
    expect(with3d(none)).toBe('dashboard');
  });

  it("follows this device's own choice", () => {
    expect(with3d({ ...none, saved: 'office' })).toBe('office');
    expect(with3d({ ...none, saved: 'dashboard' })).toBe('dashboard');
    expect(with3d({ ...none, saved: 'pocket' })).toBe('dashboard');
    expect(with3d({ ...none, saved: 'nonsense' })).toBe('dashboard');
  });

  it('keeps ?pocket working over the saved choice', () => {
    expect(with3d({ ...none, pocket: '' })).toBe('dashboard');
    expect(with3d({ ...none, pocket: '1', saved: 'office' })).toBe('dashboard');
    expect(with3d({ ...none, pocket: '0' })).toBe('office');
    expect(with3d({ ...none, pocket: 'false' })).toBe('office');
  });

  it('opens the 3D office only on ?office=3d or a choice for it', () => {
    expect(with3d({ ...none, office: '3d' })).toBe('office');
    expect(with3d({ ...none, office: '3d', pocket: '1' })).toBe('office');
    expect(with3d({ ...none, office: '2d', saved: 'office' })).toBe('dashboard');
    expect(with3d({ ...none, office: 'x' })).toBe('dashboard');
  });

  it('always opens the dashboard in a build without the 3D office', () => {
    const no3d = (x: Parameters<typeof pickMode>[0]) => pickMode(x, false);
    expect(no3d(none)).toBe('dashboard');
    expect(no3d({ ...none, saved: 'office' })).toBe('dashboard');
    expect(no3d({ ...none, office: '3d' })).toBe('dashboard');
    expect(no3d({ ...none, office: '3d', saved: 'office' })).toBe('dashboard');
    expect(no3d({ ...none, pocket: '0' })).toBe('dashboard');
    expect(no3d({ ...none, pocket: 'false', saved: 'office' })).toBe('dashboard');
  });

  it('keeps the 3D office reachable in a build that has it', () => {
    expect(with3d({ ...none, office: '3d' })).toBe('office');
    expect(with3d({ ...none, saved: 'office' })).toBe('office');
  });
});
