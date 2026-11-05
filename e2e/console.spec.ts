import { expect, openDashboard, test } from './helpers';

// What was the manager's console: Settings' tabs.

test('Settings → Team adds agents of one kind, and Office sizes the teams', async ({ page }) => {
  await openDashboard(page, '/#/settings/team');
  await expect(page.getByRole('button', { name: '+ Agent' }).first()).toBeVisible();
  await expect(page.getByRole('main').getByRole('button', { name: /QA tester|Developer/ })).toHaveCount(0);
  await page.getByRole('tab', { name: /Office/ }).click();
  await expect(page.getByRole('spinbutton', { name: 'Most agents per floor' })).toHaveValue('10');
  const scaling = page.getByRole('radiogroup', { name: 'Team changes from the CEO' });
  await expect(scaling.getByRole('radio')).toHaveCount(2);
  await expect(scaling.getByRole('radio').first()).toBeChecked(); // I approve each one
});

test('every Settings tab opens', async ({ page }) => {
  await openDashboard(page, '/#/settings/floors');
  const tabs = page.getByRole('tablist', { name: 'Settings' }).getByRole('tab');
  await expect(tabs).toHaveCount(8);
  for (let i = 0; i < 8; i++) {
    await tabs.nth(i).click();
    await expect(tabs.nth(i)).toHaveAttribute('aria-selected', 'true');
  }
});

test('the merge chime is off until asked for, and this browser remembers it', async ({ page }) => {
  await openDashboard(page, '/#/settings/notifications');
  const chime = page.getByRole('checkbox', { name: /chime when a PR merges/ });
  await expect(chime).not.toBeChecked();
  await chime.check();
  await page.reload();
  await expect(chime).toBeChecked();
  await chime.uncheck();
});
