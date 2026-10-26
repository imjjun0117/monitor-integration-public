import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test } from '@playwright/test';

const credentials = JSON.parse(
  readFileSync(resolve(process.cwd(), '../../.run/e2e/credentials.json'), 'utf8'),
) as { username: string; password: string };

test('XLog browser history restores checkbox and real API filter', async ({ page }) => {
  await page.goto('/login');
  await page.getByRole('textbox', { name: '아이디' }).fill(credentials.username);
  await page.locator('input[name="password"]').fill(credentials.password);
  await page.getByRole('button', { name: 'Login' }).click();
  await expect(page.getByRole('heading', { name: '종합 현황' })).toBeVisible();

  const requests: boolean[] = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.pathname === '/api/v1/xlog') {
      requests.push(url.searchParams.get('errorsOnly') === 'true');
    }
  });
  await page.goto('/xlog');
  const checkbox = page.getByRole('checkbox', { name: 'HTTP 오류만' });
  await expect(checkbox).not.toBeChecked();
  await expect.poll(() => requests.at(-1)).toBe(false);
  const errorResponse = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === '/api/v1/xlog' &&
      new URL(response.url()).searchParams.get('errorsOnly') === 'true',
  );
  await page.getByText('HTTP 오류만', { exact: true }).click();
  expect((await errorResponse).status()).toBe(200);
  await expect(page).toHaveURL(/errorsOnly=true/);
  await expect(checkbox).toBeChecked();
  await expect(page.locator('.xlog-overview')).toBeVisible();

  await page.goBack();
  await expect(page).not.toHaveURL(/errorsOnly=true/);
  await expect(checkbox).not.toBeChecked();
  await expect.poll(() => requests.at(-1)).toBe(false);
  await expect(page.locator('.xlog-overview')).toBeVisible();

  await page.goForward();
  await expect(page).toHaveURL(/errorsOnly=true/);
  await expect(checkbox).toBeChecked();
  await expect.poll(() => requests.at(-1)).toBe(true);
  await expect(page.locator('.xlog-overview')).toBeVisible();
});
