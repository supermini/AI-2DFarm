import { expect, openDashboard, test } from './helpers';

// The dashboard on a phone: pocket mode's tab bar, the CEO's chat, and old addresses still landing here.

test.use({ viewport: { width: 390, height: 844 } });

test('the tab bar replaces the rail and reaches every role', async ({ page }) => {
  await openDashboard(page);
  const tabs = page.locator('.dash-tabs');
  await expect(tabs).toBeVisible();
  await expect(page.locator('.dash-rail')).toBeHidden();
  await tabs.getByRole('button', { name: 'Developer' }).click();
  await expect(page).toHaveURL(/#\/dev/);
  await tabs.getByRole('button', { name: 'CEO' }).click();
  await expect(page.locator('.chat-input textarea')).toBeVisible();
});

test('?pocket= and a remembered 3D office land on the dashboard', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('cubefarm:mode', 'office'));
  for (const path of ['/?pocket=0', '/?pocket=1', '/?office=3d', '/']) {
    await openDashboard(page, path);
    await expect(page.locator('.dash-tabs')).toBeVisible();
    await expect(page.locator('canvas')).toHaveCount(0);
  }
});
