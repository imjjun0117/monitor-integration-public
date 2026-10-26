import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const credentials = JSON.parse(
  readFileSync(resolve(process.cwd(), '../../.run/e2e/credentials.json'), 'utf8'),
) as { username: string; password: string };

test('native login survives a blocked React bundle and submits bad then good credentials', async ({
  page,
}) => {
  await page.route('**/assets/login.js', (route) => route.abort());
  await page.goto('/login');
  await expect(page.locator('#login-root .native-login-fields')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Login' })).toHaveCount(1);
  await expect(page.locator('input[name="_csrf"]')).not.toHaveValue('');
  await expect(page.getByRole('textbox', { name: '아이디' })).toBeVisible();
  await expect(page.getByLabel('비밀번호')).toBeVisible();
  const axe = await new AxeBuilder({ page }).analyze();
  expect(axe.violations).toEqual([]);

  await page.getByRole('textbox', { name: '아이디' }).fill(credentials.username);
  await page.getByLabel('비밀번호').fill('incorrect-password');
  await page.getByRole('button', { name: 'Login' }).click();
  await expect(page).toHaveURL(/\/login\?error(?:=|$)/);
  await expect(page.getByRole('alert')).toHaveText('아이디 또는 비밀번호를 확인해 주세요.');
  await expect(page.getByRole('heading', { name: 'Login' })).toHaveCount(1);

  await page.getByRole('textbox', { name: '아이디' }).fill(credentials.username);
  await page.getByLabel('비밀번호').fill(credentials.password);
  await page.getByRole('button', { name: 'Login' }).click();
  await expect(page.getByRole('heading', { name: '종합 현황' })).toBeVisible();
});

test('native login also works with JavaScript disabled', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  try {
    const page = await context.newPage();
    await page.goto('/login');
    await expect(page.getByRole('textbox', { name: '아이디' })).toBeVisible();
    await expect(page.locator('input[name="_csrf"]')).not.toHaveValue('');
    // axe는 스크립트 주입이 필요하므로 번들 차단 테스트에서 같은 기본 폼 검사
    await page.getByRole('textbox', { name: '아이디' }).fill(credentials.username);
    await page.getByLabel('비밀번호').fill(credentials.password);
    await page.getByRole('button', { name: 'Login' }).click();
    await expect(page).toHaveURL('/');
  } finally {
    await context.close();
  }
});

test('loaded login replaces fallback with a single official ProCard heading', async ({ page }) => {
  await page.goto('/login');
  await expect(page.locator('#login-root .ant-pro-card')).toBeVisible();
  await expect(page.locator('#login-root .native-login-fields')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Login' })).toHaveCount(1);
  await expect(page.locator('input[name="_csrf"]')).not.toHaveValue('');
  const axe = await new AxeBuilder({ page }).analyze();
  expect(axe.violations).toEqual([]);
});
