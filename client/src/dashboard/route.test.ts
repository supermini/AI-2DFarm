import { describe, expect, it } from 'vitest';
import { DEFAULT_ROUTE, formatRoute, parseRoute, roleRoute, routeFloor, routeFromLink, routeFromTab, withFloor, type Route } from './route';

describe('dashboard routes', () => {
  const cases: [string, Route][] = [
    ['#/ceo', { role: 'ceo', pane: 'chat' }],
    ['#/ceo/approvals', { role: 'ceo', pane: 'approvals' }],
    ['#/dev', { role: 'dev', floor: null, view: 'board' }],
    ['#/dev/3', { role: 'dev', floor: 3, view: 'board' }],
    ['#/dev/3/terminals', { role: 'dev', floor: 3, view: 'terminals' }],
    ['#/dev/all/terminals', { role: 'dev', floor: null, view: 'terminals' }],
    ['#/review', { role: 'review', floor: null, pr: null }],
    ['#/review/1', { role: 'review', floor: 1, pr: null }],
    ['#/review/1/42', { role: 'review', floor: 1, pr: 42 }],
    ['#/metrics', { role: 'metrics' }],
    ['#/settings/floors', { role: 'settings', tab: 'floors' }],
    ['#/settings/team', { role: 'settings', tab: 'team' }],
    ['#/settings/issues', { role: 'settings', tab: 'issues' }],
    ['#/settings/office', { role: 'settings', tab: 'office' }],
    ['#/settings/notifications', { role: 'settings', tab: 'notifications' }],
    ['#/settings/cloud', { role: 'settings', tab: 'cloud' }],
    ['#/settings/voice', { role: 'settings', tab: 'voice' }],
    ['#/settings/accessibility', { role: 'settings', tab: 'accessibility' }],
  ];

  it('parses each route and formats it back to the same hash', () => {
    for (const [hash, route] of cases) {
      expect(parseRoute(hash), hash).toEqual(route);
      expect(formatRoute(route), hash).toBe(hash);
    }
  });

  it('reads hashes without the leading # or slash, and with a trailing slash', () => {
    expect(parseRoute('/dev/2')).toEqual({ role: 'dev', floor: 2, view: 'board' });
    expect(parseRoute('#dev/2/')).toEqual({ role: 'dev', floor: 2, view: 'board' });
    expect(parseRoute('#/review/1/42/')).toEqual({ role: 'review', floor: 1, pr: 42 });
  });

  it('falls back to the default for unknown or empty hashes', () => {
    for (const hash of ['', '#', '#/', '#/nope', '#/kanban', 'garbage']) expect(parseRoute(hash), hash).toEqual(DEFAULT_ROUTE);
  });

  it('drops parts it cannot read and keeps the rest', () => {
    expect(parseRoute('#/dev/x')).toEqual({ role: 'dev', floor: null, view: 'board' });
    expect(parseRoute('#/dev/0')).toEqual({ role: 'dev', floor: null, view: 'board' });
    expect(parseRoute('#/dev/1.5/terminals')).toEqual({ role: 'dev', floor: null, view: 'terminals' });
    expect(parseRoute('#/dev/2/whatever')).toEqual({ role: 'dev', floor: 2, view: 'board' });
    expect(parseRoute('#/review/1/abc')).toEqual({ role: 'review', floor: 1, pr: null });
    expect(parseRoute('#/review/1/-3')).toEqual({ role: 'review', floor: 1, pr: null });
    expect(parseRoute('#/settings')).toEqual({ role: 'settings', tab: 'floors' });
    expect(parseRoute('#/settings/bogus')).toEqual({ role: 'settings', tab: 'floors' });
    expect(parseRoute('#/ceo/bogus')).toEqual({ role: 'ceo', pane: 'chat' });
  });

  it('formats a PR without a floor under all floors', () => {
    expect(formatRoute({ role: 'review', floor: null, pr: 7 })).toBe('#/review/all/7');
    expect(parseRoute('#/review/all/7')).toEqual({ role: 'review', floor: null, pr: 7 });
  });
});

describe('notification links', () => {
  // The server links a note to `/?tab=<pocket tab>` (shared/notify.ts noteTab).
  it('maps each pocket tab to a route', () => {
    expect(routeFromTab('chat')).toEqual({ role: 'ceo', pane: 'chat' });
    expect(routeFromTab('approvals')).toEqual({ role: 'ceo', pane: 'approvals' });
    expect(routeFromTab('kanban')).toEqual({ role: 'dev', floor: null, view: 'board' });
    expect(routeFromTab('team')).toEqual({ role: 'dev', floor: null, view: 'terminals' });
    expect(routeFromTab('company')).toEqual({ role: 'metrics' });
    expect(routeFromTab('nope')).toBeNull();
    expect(routeFromTab(null)).toBeNull();
  });

  it('keeps the floor the tab is about, when there is one', () => {
    expect(routeFromTab('kanban', 2)).toEqual({ role: 'dev', floor: 2, view: 'board' });
    expect(routeFromTab('team', 2)).toEqual({ role: 'dev', floor: 2, view: 'terminals' });
  });

  it('reads a link: its hash first, then its ?tab=', () => {
    const origin = 'http://localhost:4401';
    expect(routeFromLink('/?tab=approvals', origin)).toEqual({ role: 'ceo', pane: 'approvals' });
    expect(routeFromLink('http://office.local:4317/?tab=team', origin)).toEqual({ role: 'dev', floor: null, view: 'terminals' });
    expect(routeFromLink('/#/review/1/42', origin)).toEqual({ role: 'review', floor: 1, pr: 42 });
    expect(routeFromLink('/?tab=chat#/metrics', origin)).toEqual({ role: 'metrics' });
    expect(routeFromLink('/', origin)).toBeNull();
    expect(routeFromLink('/?tab=bogus', origin)).toBeNull();
    expect(routeFromLink(null, origin)).toBeNull();
    expect(routeFromLink('http://[bad', origin)).toBeNull();
  });
});

describe('moving around', () => {
  it('opens a role on the picked floor', () => {
    expect(roleRoute('ceo', 2)).toEqual({ role: 'ceo', pane: 'chat' });
    expect(roleRoute('dev', 2)).toEqual({ role: 'dev', floor: 2, view: 'board' });
    expect(roleRoute('review', null)).toEqual({ role: 'review', floor: null, pr: null });
    expect(roleRoute('metrics', 2)).toEqual({ role: 'metrics' });
    expect(roleRoute('settings', 2)).toEqual({ role: 'settings', tab: 'floors' });
  });

  it('changes the floor of a route that has one, and drops a PR from another floor', () => {
    expect(withFloor({ role: 'dev', floor: 1, view: 'terminals' }, 3)).toEqual({ role: 'dev', floor: 3, view: 'terminals' });
    expect(withFloor({ role: 'review', floor: 1, pr: 42 }, 2)).toEqual({ role: 'review', floor: 2, pr: null });
    expect(withFloor({ role: 'review', floor: 1, pr: 42 }, 1)).toEqual({ role: 'review', floor: 1, pr: 42 });
    expect(withFloor({ role: 'metrics' }, 2)).toEqual({ role: 'metrics' });
  });

  it('says which floor a route is on', () => {
    expect(routeFloor({ role: 'dev', floor: 4, view: 'board' })).toBe(4);
    expect(routeFloor({ role: 'review', floor: null, pr: null })).toBeNull();
    expect(routeFloor({ role: 'ceo', pane: 'chat' })).toBeUndefined();
  });
});
