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

for (const width of [320, 390, 1024, 1440]) {
  for (const appearance of ['light', 'dark']) {
    test(`loaded login preserves the brand layout at ${width}px in ${appearance} mode`, async ({
      page,
    }, testInfo) => {
      await page.setViewportSize({ width, height: 900 });
      await page.addInitScript(
        (value) => localStorage.setItem('monitoring.theme', value),
        appearance,
      );
      await page.goto('/login');
      await expect(page.locator('#login-root .ant-pro-card')).toBeVisible();
      await expect(page.locator('#login-root .native-login-fields')).toHaveCount(0);
      await expect(page.getByRole('heading', { name: 'Login' })).toHaveCount(1);
      await expect(page.locator('input[name="_csrf"]')).not.toHaveValue('');
      await expect(page.locator('.login-brand')).toHaveText('Monitoring');
      const introduction = page.getByRole('complementary', { name: 'Monitoring 소개' });
      if (width >= 1024) {
        await expect(introduction).toBeVisible();
        await expect(introduction.getByText('System Monitoring')).toBeVisible();
      } else {
        await expect(introduction).toBeHidden();
      }
      await page.evaluate(() => document.fonts.ready);
      const layout = await page.evaluate(() => {
        const content = document.querySelector('.login-content')!.getBoundingClientRect();
        const form = document.querySelector('form')!.getBoundingClientRect();
        const button = document.querySelector('button[type="submit"]')!.getBoundingClientRect();
        const brand = document.querySelector('.login-brand img') as HTMLImageElement;
        return {
          documentFits: document.documentElement.scrollWidth <= innerWidth,
          formFits: form.width <= 440 && form.left >= content.left && form.right <= content.right,
          buttonVisible: button.top >= 0 && button.bottom <= innerHeight,
          originalLogo:
            brand.complete &&
            brand.naturalWidth > 0 &&
            brand.getAttribute('src') === '/monitoring.svg',
          splitLayout:
            innerWidth < 1024 ||
            content.right <=
              document.querySelector('.login-brand-panel')!.getBoundingClientRect().left,
        };
      });
      expect(Object.values(layout).every(Boolean)).toBe(true);
      const axe = await new AxeBuilder({ page }).analyze();
      expect(axe.violations).toEqual([]);
      await page.screenshot({ path: testInfo.outputPath('login.png'), fullPage: true });
    });
  }
}
