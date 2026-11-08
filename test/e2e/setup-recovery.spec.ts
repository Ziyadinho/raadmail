import { expect, test } from '@playwright/test';

test('a stalled activation can reconnect, retain errors, and continue after saving the new key', async ({ page }) => {
  let activated = false;
  let attempts = 0;
  const key = 'a'.repeat(64);
  await page.route('**/api/auth/session', (route) => route.fulfill({ json: { setupComplete: false, user: null } }));
  await page.route('**/api/setup/status*', (route) => route.fulfill({ json: {
    setupComplete: false,
    checks: {
      database: { ok: true, message: 'Database is ready.' },
      encryptionKey: { ok: activated, state: activated ? 'generated' : 'activating', message: activated ? 'Recovery key is active.' : 'Saving the new key.' },
      cloudflare: { ok: activated, source: activated ? 'stored' : null, message: 'Token is valid.' },
      worker: { ok: activated, name: 'raadmail', message: 'Found the raadmail Worker.' },
      zones: { ok: activated, count: activated ? 1 : 0, message: '1 domain found.' },
    },
    permissions: [],
    zones: activated ? [{ id: 'zone_example', name: 'example.com', status: 'active' }] : [],
  } }));
  await page.route('**/api/setup/token', async (route) => {
    expect(route.request().postDataJSON()).toEqual({ token: 'test-token-for-recovery', newKey: true });
    attempts++;
    if (attempts === 1) {
      await route.fulfill({ status: 400, json: { error: { code: 'cloudflare_permission', message: 'The token needs Workers Scripts Edit.' } } });
      return;
    }
    activated = true;
    await route.fulfill({ json: { ok: true, recoveryKey: key } });
  });
  await page.goto('/setup');
  await expect(page.getByRole('button', { name: 'Continue', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Retry key activation', exact: true }).click({ timeout: 30_000 });
  await page.getByLabel('Cloudflare API token').fill('test-token-for-recovery');
  await page.getByRole('button', { name: 'Connect', exact: true }).click();
  await expect(page.getByText('The token needs Workers Scripts Edit.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Continue', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Connect', exact: true }).click();
  await expect(page.getByTestId('recovery-key')).toHaveText(key);
  await expect(page.getByRole('button', { name: 'Continue', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: "I've saved it", exact: true }).click();
  await expect(page.getByRole('button', { name: 'Continue', exact: true })).toBeEnabled();
  expect(attempts).toBe(2);
});
