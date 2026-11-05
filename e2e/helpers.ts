import { test as base, expect, type Page } from '@playwright/test';

// What every e2e spec shares: the `test` that fails on console errors and failed requests, and opening the dashboard.
// Specs import `test` and `expect` from here, not from Playwright.
// One spec file per feature: add a feature's tests to its own file, never to smoke.spec.ts.

export { expect };

// Every test fails on a console error, an uncaught exception, or a request to the office that failed.
export const test = base.extend<{ page: Page }>({
  page: async ({ page, baseURL }, use) => {
    const problems: string[] = [];
    // Only the office itself is under test: stub anything external (the Google Fonts stylesheet) so the result
    // doesn't depend on the network.
    await page.route(
      (url) => !url.href.startsWith(baseURL!) && !url.protocol.startsWith('data'),
      (route) => route.fulfill({ status: 200, body: '' }),
    );
    page.on('console', (m) => {
      if (m.type() === 'error') problems.push(`console error: ${m.text()}`);
    });
    page.on('pageerror', (e) => problems.push(`page error: ${e.message}`));
    page.on('requestfailed', (r) => problems.push(`request failed: ${r.method()} ${r.url()} (${r.failure()?.errorText})`));
    page.on('response', (r) => {
      if (r.status() >= 400) problems.push(`HTTP ${r.status()}: ${r.request().method()} ${r.url()}`);
    });
    await use(page);
    expect(problems, 'console errors or failed requests').toEqual([]);
  },
});

/**
 * Opens the dashboard at `path` (a hash route, say '/#/settings/team'), past the setup wizard if it's up, with sound
 * unlocked by a click (the browser's rule, and the office's: nothing speaks before the first gesture).
 */
export async function openDashboard(page: Page, path = '/') {
  await page.goto(path);
  await expect(page.locator('.dash-main > *').first()).toBeVisible(); // only once the first snapshot is in
  const skipSetup = page.getByRole('button', { name: /skip setup/i });
  if (await skipSetup.isVisible()) {
    await skipSetup.click();
    await expect(skipSetup).toBeHidden();
  }
  await page.locator('.pk-title').click();
}
