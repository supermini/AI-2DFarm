import { expect, openDashboard, test } from './helpers';

// There's no help panel any more: finding your way is the rail and each screen's address.

test('the rail reaches every role, and an address survives a reload', async ({ page }) => {
  await openDashboard(page);
  const rail = page.locator('.dash-rail');
  for (const [name, hash] of [
    ['Developer', /#\/dev/],
    ['Reviewer', /#\/review/],
    ['Metrics', /#\/metrics/],
    ['Settings', /#\/settings/],
    ['CEO', /#\/ceo/],
  ] as const) {
    await rail.getByRole('button', { name }).click();
    await expect(page).toHaveURL(hash);
    await expect(rail.getByRole('button', { name })).toHaveAttribute('aria-current', 'page');
  }
  await page.goto('/#/metrics');
  await page.reload();
  await expect(rail.getByRole('button', { name: 'Metrics' })).toHaveAttribute('aria-current', 'page');
});
