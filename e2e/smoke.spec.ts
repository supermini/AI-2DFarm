import { expect, openDashboard, test } from './helpers';

// Smoke tests against the demo office: the API answers and the dashboard loads without errors. Only the core boot
// lives here: each feature's tests go in their own spec file (helpers.ts has the setup).

test('/api/state returns JSON with floors', async ({ request }) => {
  const res = await request.get('/api/state');
  expect(res.ok()).toBe(true);
  expect(res.headers()['content-type']).toContain('application/json');
  const state = await res.json();
  expect(state.demo).toBe(true);
  expect(state.repos.length).toBeGreaterThan(0);
  for (const repo of state.repos) expect(repo.floor).toBeGreaterThan(0);
  expect(state.agents.length).toBeGreaterThan(0);
});

test('the dashboard loads on the CEO role, with no 3D canvas and no three.js', async ({ page }) => {
  const scripts: string[] = [];
  page.on('response', (r) => {
    if (r.url().endsWith('.js')) scripts.push(r.url());
  });
  await openDashboard(page);
  await expect(page.getByRole('navigation', { name: 'Roles' }).first()).toBeVisible();
  await expect(page.locator('.chat-input textarea')).toBeVisible();
  await expect(page.locator('canvas')).toHaveCount(0);
  expect(scripts.filter((s) => /Office|three/i.test(s))).toEqual([]);
});
