import { describe, expect, it } from 'vitest';
import { dashboardWatch } from './watch';

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
  });
  it('watches nobody once everything is closed', () => {
    expect(dashboardWatch({ ...base, overlay: { kind: 'phone', tab: 'chat' } })).toEqual({ floor: -1, agents: [], workers: false });
  });
  it('asks for the workers list only while it is open', () => {
    expect(dashboardWatch({ ...base, workersOpen: true }).workers).toBe(true);
  });
});
