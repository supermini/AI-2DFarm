import { describe, expect, it } from 'vitest';
import { CEO_ID } from '../../shared/types';
import { currentWatch, dashboardWatch } from './watch';

describe('currentWatch', () => {
  it('is the floor you are on, the terminal you have open and whether the workers list is out', () => {
    expect(currentWatch({ floor: 3, overlay: null, workersOpen: true })).toEqual({ floor: 3, agents: [], workers: true });
    expect(currentWatch({ floor: 0, overlay: { kind: 'terminal', agentId: 'ken' }, workersOpen: false })).toEqual({ floor: 0, agents: ['ken'], workers: false });
    expect(currentWatch({ floor: 2, overlay: { kind: 'manager', tab: 'ceo' }, workersOpen: false }).agents).toEqual([CEO_ID]);
    expect(currentWatch({ floor: 2, overlay: { kind: 'kanban', repoId: 'r' }, workersOpen: false }).agents).toEqual([]);
  });
});

describe('dashboardWatch', () => {
  const base = { floor: null, overlay: null, workersOpen: false, shown: [] };
  it('watches no floor on all floors (every line of every agent would flood a big company), the picked floor otherwise', () => {
    expect(dashboardWatch(base).floor).toBe(-1);
    expect(dashboardWatch({ ...base, floor: 3 }).floor).toBe(3);
  });
  it('lists the open terminal and every agent whose drawer is showing, once each', () => {
    expect(dashboardWatch({ ...base, overlay: { kind: 'terminal', agentId: 'ken' } }).agents).toEqual(['ken']);
    expect(dashboardWatch({ ...base, shown: ['ann', 'bo'] }).agents).toEqual(['ann', 'bo']);
    expect(dashboardWatch({ ...base, overlay: { kind: 'terminal', agentId: 'ann' }, shown: ['ann', 'bo'] }).agents).toEqual(['ann', 'bo']);
    expect(dashboardWatch({ ...base, overlay: { kind: 'manager', tab: 'ceo' } }).agents).toEqual([CEO_ID]);
  });
  it('watches nobody once everything is closed', () => {
    expect(dashboardWatch({ ...base, overlay: { kind: 'phone', tab: 'chat' } })).toEqual({ floor: -1, agents: [], workers: false });
  });
  it('asks for the workers list only while it is open', () => {
    expect(dashboardWatch({ ...base, workersOpen: true }).workers).toBe(true);
  });
});
