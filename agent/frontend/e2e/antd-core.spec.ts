import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test, type Page, type Request } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const credentials = JSON.parse(
  readFileSync(resolve(process.cwd(), '../../.run/e2e/credentials.json'), 'utf8'),
) as { username: string; password: string };
const screenshotDirectory = resolve(process.cwd(), '../../.run/e2e/screenshots');
mkdirSync(screenshotDirectory, { recursive: true, mode: 0o700 });
const errorDirectory = resolve(process.cwd(), '../../.run/e2e/browser-errors');
mkdirSync(errorDirectory, { recursive: true, mode: 0o700 });
const observedErrors = new WeakMap<Page, string[]>();
const failedRequests = new WeakMap<Page, string[]>();
const pendingRequests = new WeakMap<Page, Set<Request>>();

test.afterEach(async ({ page }, testInfo) => {
  const filename = testInfo.title.replace(/[^a-z0-9]+/gi, '-').slice(0, 90);
  const errors = (observedErrors.get(page) ?? []).map((message) =>
    message
      .replace(/https?:\/\/[^\s)]+/g, '[URL]')
      .replace(/(token|password|secret|authorization)[=:]\S+/gi, '$1=[REDACTED]'),
  );
  writeFileSync(
    resolve(errorDirectory, `${filename}.json`),
    JSON.stringify(
      { test: testInfo.title, errors, failedRequests: failedRequests.get(page) ?? [] },
      null,
      2,
    ),
    { mode: 0o600 },
  );
});

async function login(page: Page) {
  await waitForRequests(page);
  await page.goto('/login');
  await expect(page.getByRole('heading', { name: 'Login' })).toBeVisible();
  await page.getByRole('textbox', { name: '아이디' }).fill(credentials.username);
  await page.locator('input[name="password"]').fill(credentials.password);
  const instancesLoaded = page.waitForResponse((response) => {
    const path = new URL(response.url()).pathname;
    return (
      /^\/api\/v1\/projects\/[^/]+\/instances$/.test(path) &&
      response.request().method() === 'GET' &&
      response.status() === 200
    );
  });
  await page.getByRole('button', { name: 'Login' }).click();
  await expect(page.getByRole('heading', { name: '종합 현황' })).toBeVisible();
  // 제목은 조회 전에 렌더링되므로 실제 범위와 요약 수신 후 다음 화면으로 이동
  const instances = (await (await instancesLoaded).json()) as { items: unknown[] };
  await expect(page.getByRole('combobox', { name: '인스턴스 선택' })).toBeEnabled();
  if (instances.items.length > 0) {
    await expect(page.getByLabel('선택 인스턴스 요약')).toBeVisible();
  }
  await waitForRequests(page);
}

// 실제 네트워크 실패와 콘솔 오류만 테스트 산출물에 기록
function observe(page: Page, errors: string[]) {
  observedErrors.set(page, errors);
  const failures: string[] = [];
  failedRequests.set(page, failures);
  const pending = new Set<Request>();
  pendingRequests.set(page, pending);
  page.on('request', (request) => {
    // CSRF 준비용 /login HTML은 본문을 소비하지 않으므로 API 조회만 완료 대기
    if (
      ['fetch', 'xhr'].includes(request.resourceType()) &&
      new URL(request.url()).pathname.startsWith('/api/')
    ) {
      pending.add(request);
    }
  });
  page.on('requestfinished', (request) => pending.delete(request));
  page.on('pageerror', (error) => errors.push(`page: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') {
      errors.push(`console: ${message.text()}`);
    }
  });
  page.on('requestfailed', (request) => {
    pending.delete(request);
    failures.push(`${new URL(request.url()).pathname} ${request.failure()?.errorText}`);
  });
  page.on('response', (response) => {
    if (response.status() >= 500) {
      errors.push(`HTTP ${response.status()} ${new URL(response.url()).pathname}`);
    }
  });
}

// 다음 탐색 전에 조회 응답 본문 수신 완료 검증
async function waitForRequests(page: Page) {
  await expect
    .poll(() =>
      [...(pendingRequests.get(page) ?? [])].map((request) => new URL(request.url()).pathname),
    )
    .toEqual([]);
}

test('Spring login rejects bad password and missing CSRF, then accepts correct form', async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  observe(page, errors);
  await waitForRequests(page);
  await page.goto('/login');
  await expect(page.getByRole('heading', { name: 'Login' })).toBeVisible();
  const loginCanvas = await page.evaluate(() => ({
    margin: getComputedStyle(document.body).margin,
    left: document.querySelector('.login-shell')!.getBoundingClientRect().left,
    right: document.querySelector('.login-shell')!.getBoundingClientRect().right,
    width: innerWidth,
  }));
  expect(loginCanvas.margin).toBe('0px');
  expect(loginCanvas.left).toBe(0);
  expect(loginCanvas.right).toBe(loginCanvas.width);
  await page.screenshot({ path: resolve(screenshotDirectory, 'login.png'), fullPage: true });
  const csrf = page.locator('input[name="_csrf"]');
  await expect(csrf).not.toHaveValue('');
  const csrfRejected = await page.evaluate(async () => {
    const body = new URLSearchParams({ username: 'invalid', password: 'invalid' });
    const response = await fetch('/api/v1/session/login', {
      method: 'POST',
      body,
      redirect: 'manual',
      credentials: 'same-origin',
    });
    return response.status;
  });
  expect(csrfRejected).toBe(403);
  await page.getByRole('textbox', { name: '아이디' }).fill(credentials.username);
  await page.locator('input[name="password"]').fill('incorrect-password');
  await page.getByRole('button', { name: 'Login' }).click();
  await expect(page.getByRole('alert')).toContainText('아이디 또는 비밀번호');
  await login(page);
  await testInfo.attach('console-and-network-errors', {
    body: errors.join('\n'),
    contentType: 'text/plain',
  });
  expect(errors.filter((message) => !message.includes('status of 403'))).toEqual([]);
});

for (const viewport of [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'tablet', width: 1024, height: 900 },
  { name: 'mobile', width: 390, height: 844 },
]) {
  test(`${viewport.name}: native browser navigates real data and settings`, async ({
    page,
  }, testInfo) => {
    const errors: string[] = [];
    observe(page, errors);
    await page.setViewportSize(viewport);
    await login(page);
    await expect(page.getByRole('link', { name: /샘플 A \/ 샘플 A 1/ })).toBeVisible();
    await page.screenshot({
      path: resolve(screenshotDirectory, `${viewport.name}-dashboard.png`),
      fullPage: true,
    });
    for (const [route, title] of [
      ['/incidents', '장애 관리'],
      ['/projects', '프로젝트'],
      ['/api-monitoring', 'API 모니터링'],
      ['/xlog', 'XLog'],
      ['/logs', '실시간 로그'],
      ['/certificates', '인증서 관리'],
      ['/settings/projects', '프로젝트 관리'],
    ] as const) {
      await waitForRequests(page);
      await page.goto(route);
      await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
      await waitForRequests(page);
      await page.reload();
      await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
      const ready = route === '/incidents'
        ? page.getByRole('button', { name: '새로고침' })
        : route === '/projects'
          ? page.getByRole('link', { name: '샘플 A 1', exact: true })
          : route === '/api-monitoring'
            ? page.getByRole('textbox', { name: 'API 이름' })
            : route === '/xlog'
              ? page.getByRole('combobox', { name: 'XLog 조회 기간' })
              : route === '/logs'
                ? page.getByRole('combobox', { name: '인스턴스 선택' })
                : route === '/certificates'
                  ? page.getByRole('combobox', { name: '만료 대상' })
                  : page.getByRole('table', { name: '프로젝트 설정' });
      await expect(ready).toBeVisible();
      await waitForRequests(page);
      await page.screenshot({
        path: resolve(screenshotDirectory, `${viewport.name}-${route.replaceAll('/', '-')}.png`),
        fullPage: true,
      });
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width);
    }
    await waitForRequests(page);
    await page.goto('/settings/instances');
    await expect(page.getByRole('heading', { name: '인스턴스 관리' })).toBeVisible();
    await waitForRequests(page);
    await page.goto('/settings/thresholds');
    await expect(page.getByRole('heading', { name: '임계치 관리' })).toBeVisible();
    await waitForRequests(page);
    await page.goBack();
    await expect(page.getByRole('heading', { name: '인스턴스 관리' })).toBeVisible();
    for (const [route, title] of [
      ['/settings/certificates', '인증서 대상 관리'],
      ['/settings/users', '사용자 관리'],
      ['/settings/roles', '역할·권한 관리'],
      ['/settings/menus', '메뉴 관리'],
      ['/settings/audit', '변경 이력'],
    ] as const) {
      await waitForRequests(page);
      await page.goto(route);
      await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
    }
    await waitForRequests(page);
    await page.goto('/settings/projects');
    if (viewport.name === 'mobile') {
      await expect(page.getByText(/모바일에서는 조회만 지원/)).toBeVisible();
    }
    await page.screenshot({
      path: resolve(screenshotDirectory, `${viewport.name}-settings.png`),
      fullPage: true,
    });
    await testInfo.attach('console-and-network-errors', {
      body: errors.join('\n'),
      contentType: 'text/plain',
    });
    expect(errors).toEqual([]);
  });
}

test('mobile page headings and navigation stay compact', async ({ page }) => {
  const errors: string[] = [];
  observe(page, errors);
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page);
  // 최초 인스턴스 자동 선택과 데이터 조회가 끝난 뒤 다음 문서로 이동
  await expect(page.getByRole('link', { name: /샘플 A \/ 샘플 A 1/ })).toBeVisible();
  for (const route of ['/logs', '/incidents', '/xlog']) {
    await waitForRequests(page);
    await page.goto(`${route}?project=sample-a`);
    await expect(page.getByRole('combobox', {
      name: route === '/incidents' ? '장애 상태 필터' : '인스턴스 선택',
    })).toBeVisible();
    await waitForRequests(page);
    const heading = page.locator('#main-content h1');
    await expect(heading).toBeVisible();
    await page.screenshot({
      path: resolve(screenshotDirectory, `mobile-layout-${route.slice(1)}.png`),
      fullPage: true,
    });
    const geometry = await heading.evaluate((element) => ({
      height: element.getBoundingClientRect().height,
      margin: parseFloat(getComputedStyle(element).marginBottom),
    }));
    expect.soft(geometry.height).toBeLessThanOrEqual(32);
    expect.soft(geometry.margin).toBe(0);
    await expect.soft(page.locator('.ant-pro-global-header-collapsed-button')).toBeHidden();
    await expect(page.getByRole('button', { name: '메뉴 열기' })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
    if (route === '/logs') {
      await expect(page.getByText('인스턴스 선택', { exact: true })).toBeVisible();
      await expect(page.getByText(/^조회할 인스턴스를 선택하세요/)).toBeVisible();
    }
    if (route === '/incidents') {
      await page.getByRole('combobox', { name: '장애 상태 필터' }).click();
      const historyResponse = page.waitForResponse((response) => {
        const url = new URL(response.url());
        return url.pathname === '/api/v1/incidents' && url.searchParams.get('state') === '';
      });
      await page.locator('.ant-select-dropdown:visible').getByText('전체 이력', { exact: true }).click();
      await expect(page).toHaveURL(/state=&?/);
      const response = await historyResponse;
      expect(response.ok()).toBe(true);
      expect(await response.finished()).toBeNull();
      await waitForRequests(page);
      const rows = page.locator('.incident-row-summary');
      for (const row of await rows.all()) {
        await expect(row).toContainText('담당자');
        expect(await row.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
      }
    }
  }
  await waitForRequests(page);
  expect(errors).toEqual([]);
});

test('dashboard background and header remain visible across viewport and theme', async ({
  page,
}, testInfo) => {
  await login(page);
  const measurements: Array<{
    appearance: string;
    width: number;
    layout: {
      documentWidth: number;
      bodyBackground: string;
      bodyMargin: string;
      shell: { background: string; bottom: number; left: number; right: number };
      root: { bottom: number };
      documentHeight: number;
      brand: { top: number; bottom: number } | null;
      header: { top: number; bottom: number };
      titleOverflow: { scroll: number; client: number };
      headerItems: Array<{
        className: string;
        top: number;
        bottom: number;
        left: number;
        right: number;
      }>;
    };
  }> = [];
  for (const appearance of ['light', 'dark'] as const) {
    await page.evaluate((value) => localStorage.setItem('monitoring.theme', value), appearance);
    for (const width of [390, 1024, 1440]) {
      await page.setViewportSize({ width, height: 844 });
      await waitForRequests(page);
      await page.reload();
      await expect(page.getByRole('link', { name: /샘플 A \/ 샘플 A 1/ })).toBeVisible();
      await page.screenshot({
        path: resolve(screenshotDirectory, `${appearance}-${width}-dashboard.png`),
        fullPage: true,
      });
      const layout = await page.evaluate(() => {
        const shell = document.querySelector('.monitor-app-canvas')!;
        const brand = document.querySelector('a[aria-label="종합현황으로 이동"]');
        const header = document.querySelector('header.ant-layout-header:not(:empty)')!;
        const content = document.querySelector('.ant-pro-layout-content')!;
        const root = document.getElementById('root')!;
        const geometry = (element: Element) => {
          const box = element.getBoundingClientRect();
          return {
            top: box.top,
            bottom: box.bottom,
            left: box.left,
            right: box.right,
            height: box.height,
          };
        };
        return {
          width: window.innerWidth,
          documentWidth: document.documentElement.scrollWidth,
          documentHeight: document.documentElement.scrollHeight,
          shell: { ...geometry(shell), background: getComputedStyle(shell).backgroundColor },
          root: { ...geometry(root), background: getComputedStyle(root).backgroundColor },
          bodyBackground: getComputedStyle(document.body).backgroundColor,
          bodyMargin: getComputedStyle(document.body).margin,
          htmlBackground: getComputedStyle(document.documentElement).backgroundColor,
          content: geometry(content),
          titleOverflow: (() => {
            const title = document.querySelector(
              '.instance-dashboard > .ant-card .ant-card-head-title',
            )!;
            return { scroll: title.scrollWidth, client: title.clientWidth };
          })(),
          header: geometry(header),
          headerItems: [
            ...header.querySelectorAll(
              '.global-project-selector, .ant-pro-global-header-logo, .ant-pro-global-header-actions, .ant-pro-global-header-collapsed-button',
            ),
          ].map((item) => ({
            className: item.getAttribute('class') ?? '',
            text: item.textContent?.trim().slice(0, 60),
            ...geometry(item),
          })),
          brand: brand ? geometry(brand) : null,
          headerMarkup: header.outerHTML.slice(0, 1200),
          allHeaders: [...document.querySelectorAll('header')].map((element) => ({
            markup: element.outerHTML.slice(0, 300),
            parent: element.parentElement?.outerHTML.slice(0, 400),
            rect: geometry(element),
          })),
        };
      });
      await testInfo.attach(`${appearance}-${width}-layout`, {
        body: JSON.stringify(layout, null, 2),
        contentType: 'application/json',
      });
      measurements.push({ appearance, width, layout });
    }
  }
  writeFileSync(
    resolve(errorDirectory, 'dashboard-layout.json'),
    JSON.stringify(measurements, null, 2),
    {
      mode: 0o600,
    },
  );
  for (const { appearance, width, layout } of measurements) {
    expect
      .soft(layout.documentWidth, `${appearance} ${width}: horizontal overflow`)
      .toBeLessThanOrEqual(width);
    expect
      .soft(layout.titleOverflow.scroll, `${appearance} ${width}: instance link clipping`)
      .toBeLessThanOrEqual(layout.titleOverflow.client + 1);
    expect.soft(layout.bodyMargin, `${appearance} ${width}: browser canvas margin`).toBe('0px');
    expect.soft(layout.shell.left, `${appearance} ${width}: canvas left edge`).toBe(0);
    expect.soft(layout.shell.right, `${appearance} ${width}: canvas right edge`).toBe(width);
    expect
      .soft(layout.shell.background, `${appearance} ${width}: canvas background`)
      .not.toBe('rgba(0, 0, 0, 0)');
    expect
      .soft(layout.shell.bottom, `${appearance} ${width}: full-page canvas`)
      .toBeGreaterThanOrEqual(layout.documentHeight - 1);
    for (const item of layout.headerItems) {
      expect
        .soft(item.top, `${appearance} ${width}: ${item.className} top`)
        .toBeGreaterThanOrEqual(layout.header.top);
      expect
        .soft(item.bottom, `${appearance} ${width}: ${item.className} bottom`)
        .toBeLessThanOrEqual(layout.header.bottom);
      expect
        .soft(item.right, `${appearance} ${width}: ${item.className} right`)
        .toBeLessThanOrEqual(width);
    }
    if (layout.brand) {
      expect
        .soft(layout.brand.top, `${appearance} ${width}: brand top`)
        .toBeGreaterThanOrEqual(layout.header.top);
      expect
        .soft(layout.brand.bottom, `${appearance} ${width}: brand bottom`)
        .toBeLessThanOrEqual(layout.header.bottom);
    }
  }
});

test('light and dark dashboard preserve accessible sample chart data', async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  observe(page, errors);
  await login(page);
  const allViolations: Record<string, string[]> = {};
  for (const appearance of ['light', 'dark'] as const) {
    await page.evaluate((value) => localStorage.setItem('monitoring.theme', value), appearance);
    await waitForRequests(page);
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', appearance);
    await expect(page.getByRole('heading', { name: '종합 현황' })).toBeVisible();
    await expect(page.getByRole('link', { name: /샘플 A \/ 샘플 A 1/ })).toBeVisible();
    await page.screenshot({
      path: resolve(screenshotDirectory, `${appearance}-dashboard.png`),
      fullPage: true,
    });
    const accessibility = await new AxeBuilder({ page }).analyze();
    const violations = accessibility.violations;
    const contrast = accessibility.passes.find(({ id }) => id === 'color-contrast');
    const passingContrast =
      contrast?.nodes.map(({ target, html, any, all, none }) => ({
        target,
        html,
        checks: [...any, ...all, ...none].map(({ id, message, data }) => ({ id, message, data })),
      })) ?? [];
    writeFileSync(
      resolve(errorDirectory, `${appearance}-contrast.json`),
      JSON.stringify(passingContrast, null, 2),
      { mode: 0o600 },
    );
    allViolations[appearance] = violations.map(({ id }) => id);
    const details = violations.map(({ id, impact, nodes }) => ({
      id,
      impact,
      nodes: nodes.map(({ target, html, failureSummary, any, all, none }) => ({
        target,
        html,
        failureSummary,
        checks: [...any, ...all, ...none].map(({ id: checkId, message, data }) => ({
          id: checkId,
          message,
          data,
        })),
      })),
    }));
    writeFileSync(
      resolve(errorDirectory, `${appearance}-axe.json`),
      JSON.stringify(details, null, 2),
      { mode: 0o600 },
    );
    await testInfo.attach(`${appearance}-axe`, {
      body: JSON.stringify(details, null, 2),
      contentType: 'application/json',
    });
    await page.getByRole('button', { name: 'CPU 확대 초기화' }).focus();
    await page.keyboard.press('Tab');
    await expect(
      page.getByRole('region', { name: /샘플 A \/ 샘플 A 1 · CPU 수집 표본 통계 스크롤/ }),
    ).toBeFocused();
  }
  await testInfo.attach('console-and-network-errors', {
    body: errors.join('\n'),
    contentType: 'text/plain',
  });
  expect(allViolations).toEqual({ light: [], dark: [] });
  expect(errors).toEqual([]);
});

test('project details and chart period read persisted collector samples', async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  observe(page, errors);
  await login(page);
  await waitForRequests(page);
  await page.goto('/projects/sample-a');
  await expect(page.getByRole('link', { name: '샘플 A 1' })).toBeVisible();
  await expect(page.getByRole('link', { name: '샘플 A 2' })).toBeVisible();
  await page.getByRole('link', { name: '샘플 A 1' }).click();
  await expect(page.getByRole('tab', { name: 'DB Pool' })).toBeVisible();
  await expect(page.getByLabel('시스템 CPU 값')).toHaveText('20%');
  await expect(page.getByLabel('물리 메모리 값')).toHaveText('244.14 MB / 976.56 MB');
  await expect(
    page.getByRole('img', { name: /^시스템 CPU: [1-9]\d*개 지점, 최근 값 20%$/ }),
  ).toBeVisible();
  const resourceResponse = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      url.pathname.endsWith('/projects/sample-a/instances/local-01/resources') &&
      url.searchParams.get('period') === '7d'
    );
  });
  await page.getByRole('combobox', { name: '조회 기간' }).click();
  await page.getByText('일주일', { exact: true }).last().click();
  expect((await resourceResponse).ok()).toBe(true);
  await expect(page.getByRole('button', { name: '시스템 CPU 확대 초기화' })).toBeVisible();
  await page.getByRole('button', { name: '시스템 CPU 확대 초기화' }).click();
  await page.getByRole('tab', { name: 'DB Pool' }).click();
  await expect(page.getByText('Sample Pool').first()).toBeVisible();
  await page.screenshot({
    path: resolve(screenshotDirectory, 'instance-db-pool.png'),
    fullPage: true,
  });
  await waitForRequests(page);
  await page.goto('/projects/sample-a/instances/local-02');
  await expect(page.getByLabel('시스템 CPU 값')).toHaveText('미지원');
  await testInfo.attach('console-and-network-errors', {
    body: errors.join('\n'),
    contentType: 'text/plain',
  });
  expect(errors).toEqual([]);
});

test('project modal validates, cancels, saves, and reports duplicate server errors', async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  observe(page, errors);
  await login(page);
  // 선택된 프로젝트로 필터된 목록에서는 새 프로젝트가 보이지 않으므로 전체 범위에서 생성 검증
  await waitForRequests(page);
  await page.goto('/settings/projects?project=');
  await page.getByRole('button', { name: '프로젝트 등록', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '프로젝트 등록' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('textbox', { name: '프로젝트 ID' }).fill('!invalid');
  await dialog.getByRole('textbox', { name: '프로젝트 표시명' }).fill('Invalid');
  await dialog.getByRole('button', { name: '프로젝트 등록 확인' }).click();
  await expect(dialog.getByRole('alert')).toContainText('프로젝트 ID 형식');
  await dialog.getByRole('button', { name: '취소' }).click();
  await expect(dialog).not.toBeVisible();
  await page.getByRole('button', { name: '프로젝트 등록', exact: true }).click();
  await dialog.getByRole('textbox', { name: '프로젝트 ID' }).fill('e2e-browser');
  await dialog.getByRole('textbox', { name: '프로젝트 표시명' }).fill('E2E Browser Project');
  const created = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' &&
      new URL(response.url()).pathname === '/api/v1/projects',
  );
  await dialog.getByRole('button', { name: '프로젝트 등록 확인' }).click();
  expect((await created).status()).toBe(201);
  await expect(page.getByRole('row', { name: /e2e-browser/ })).toBeVisible();
  await waitForRequests(page);
  await page.reload();
  await expect(page.getByRole('row', { name: /e2e-browser/ })).toBeVisible();
  await page.getByRole('button', { name: '프로젝트 등록', exact: true }).click();
  await dialog.getByRole('textbox', { name: '프로젝트 ID' }).fill('e2e-browser');
  await dialog.getByRole('textbox', { name: '프로젝트 표시명' }).fill('Duplicate Project');
  const duplicate = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' &&
      new URL(response.url()).pathname === '/api/v1/projects',
  );
  await dialog.getByRole('button', { name: '프로젝트 등록 확인' }).click();
  expect((await duplicate).status()).toBe(409);
  await expect(dialog.getByRole('alert')).toContainText('같은 프로젝트 ID');
  await page.screenshot({
    path: resolve(screenshotDirectory, 'duplicate-error.png'),
    fullPage: true,
  });
  await testInfo.attach('console-and-network-errors', {
    body: errors.join('\n'),
    contentType: 'text/plain',
  });
  expect(errors.filter((message) => !message.includes('status of 409'))).toEqual([]);
});

test('API list filters real external and internal sample checks', async ({ page }, testInfo) => {
  const errors: string[] = [];
  observe(page, errors);
  await login(page);
  await waitForRequests(page);
  await page.goto('/api-monitoring');
  await page.getByRole('combobox', { name: '프로젝트 필터' }).click();
  await page.getByText('샘플 A (sample-a)', { exact: true }).last().click();
  await expect(page.getByRole('combobox', { name: '인스턴스 필터' })).toBeEnabled();
  await page.getByRole('combobox', { name: '인스턴스 필터' }).click();
  await page.getByText('샘플 A 1 (local-01)', { exact: true }).last().click();
  await page.getByRole('combobox', { name: '내외부 필터' }).click();
  await page.getByText('외부 API', { exact: true }).last().click();
  const response = page.waitForResponse((received) => {
    const url = new URL(received.url());
    return (
      url.pathname === '/api/v1/api-checks' &&
      url.searchParams.get('project') === 'sample-a' &&
      url.searchParams.get('instance') === 'local-01' &&
      url.searchParams.get('direction') === 'EXTERNAL' &&
      url.searchParams.get('name') === 'Sample API'
    );
  });
  await page.getByRole('textbox', { name: 'API 이름' }).fill('Sample API');
  expect((await response).ok()).toBe(true);
  await expect(page.getByRole('row', { name: /Sample API/ })).toBeVisible();
  await page.getByRole('button', { name: '필터 초기화' }).click();
  await expect(page.getByRole('row', { name: /E2E Internal API/ })).toHaveCount(4);
  await testInfo.attach('console-and-network-errors', {
    body: errors.join('\n'),
    contentType: 'text/plain',
  });
  expect(errors).toEqual([]);
});

// 실제 Collector 수집값에 임계치를 적용해 생성된 장애로 모바일 목록 검증
 test('mobile incident rows wrap real collector alerts without losing metadata', async ({ page }) => {
  await login(page);
  await page.goto('/settings/thresholds?project=sample-b');
  await page.getByRole('combobox', { name: '인스턴스', exact: true }).click();
  await page.locator('.ant-select-dropdown:visible').getByText('샘플 B 1', { exact: true }).click();
  await page.getByRole('button', { name: '추가', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '임계치 추가' });
  await dialog.getByRole('combobox', { name: '항목 :' }).click();
  await page.locator('.ant-select-dropdown:visible').getByText('CPU 사용률', { exact: true }).click();
  await dialog.getByLabel('경고 기준', { exact: true }).fill('5');
  await dialog.getByLabel('위험 기준', { exact: true }).fill('10');
  await dialog.getByRole('button', { name: '등록', exact: true }).click();
  await expect(dialog).toBeHidden();
  try {
    await page.goto('/incidents?project=sample-b');
    await expect(page.getByRole('link', { name: /시스템 CPU/ }).first()).toBeVisible({ timeout: 20_000 });
    for (const appearance of ['light', 'dark'] as const) {
      await page.evaluate((value) => localStorage.setItem('monitoring.theme', value), appearance);
      for (const width of [320, 390]) {
        await page.setViewportSize({ width, height: 844 });
        await page.reload();
        const row = page.locator('.incident-row-summary').filter({ hasText: '시스템 CPU' }).first();
        await expect(row).toBeVisible();
        await expect(row).toContainText('담당자 미지정');
        await expect(row.locator('time')).toBeVisible();
        expect(await row.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
        await page.screenshot({
          path: resolve(screenshotDirectory, `${appearance}-${width}-incident-data.png`),
          fullPage: true,
        });
      }
      expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    }
  } finally {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/settings/thresholds?project=sample-b');
    await page.getByRole('combobox', { name: '인스턴스', exact: true }).click();
    await page.locator('.ant-select-dropdown:visible').getByText('샘플 B 1', { exact: true }).click();
    await page.getByRole('button', { name: 'CPU 사용률 삭제' }).click();
    const removal = page.getByRole('dialog', { name: '임계치 삭제' });
    await removal.getByRole('button', { name: '삭제', exact: true }).click();
    await expect(removal).toBeHidden();
  }
});


for (const width of [320, 390]) {
  for (const appearance of ['light', 'dark'] as const) {
    test(`mobile settings stay inside ${width}px in ${appearance} mode`, async ({ page }) => {
      const errors: string[] = [];
      observe(page, errors);
      await page.setViewportSize({ width, height: 844 });
      await page.addInitScript(
        (value) => localStorage.setItem('monitoring.theme', value),
        appearance,
      );
      await login(page);
      for (const section of [
        'instances',
        'projects',
        'thresholds',
        'certificates',
        'users',
        'roles',
        'menus',
        'audit',
      ]) {
        await waitForRequests(page);
        await page.goto(`/settings/${section}?project=sample-a`);
        const content = page.locator('fieldset.settings-content');
        await expect(content).toBeVisible();
        await expect(page.getByRole('combobox', { name: '프로젝트 선택' })).toBeEnabled();
        await waitForRequests(page);
        const layout = await content.evaluate((element) => {
          const box = element.getBoundingClientRect();
          return {
            documentWidth: document.documentElement.scrollWidth,
            left: box.left,
            right: box.right,
            border: getComputedStyle(element).borderTopWidth,
          };
        });
        expect.soft(layout.documentWidth, section).toBeLessThanOrEqual(width);
        expect.soft(layout.left, section).toBeGreaterThanOrEqual(0);
        expect.soft(layout.right, section).toBeLessThanOrEqual(width);
        expect.soft(layout.border, section).toBe('0px');
        if (section !== 'audit') {
          await expect(content).toHaveAttribute('disabled', '');
        }
        if (section === 'instances') {
          const table = page.getByRole('table', { name: '인스턴스 설정', exact: true });
          await expect(table.getByRole('columnheader')).toHaveCount(1);
          await expect(table.getByText('샘플 A 1', { exact: true })).toBeVisible();
          await expect(
            table.getByText('Collector Base URL', { exact: true }).first(),
          ).toBeVisible();
          await expect(page.getByRole('button', { name: '등록', exact: true })).toBeDisabled();
          await page.screenshot({
            path: resolve(screenshotDirectory, `settings-instances-${width}-${appearance}.png`),
            fullPage: true,
          });
          expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
        }
        // 넓은 설정 표는 화면 전체가 아닌 표 안에서 끝 열까지 이동 가능
        for (const scroller of await content.locator('.ant-table-content').all()) {
          const scroll = await scroller.evaluate((element) => {
            element.scrollLeft = element.scrollWidth;
            return {
              client: element.clientWidth,
              scroll: element.scrollWidth,
              left: element.scrollLeft,
            };
          });
          expect(scroll.client).toBeLessThanOrEqual(width);
          if (scroll.scroll > scroll.client) {
            expect(scroll.left).toBeGreaterThan(0);
          }
        }
      }
      await waitForRequests(page);
      expect(errors).toEqual([]);
    });
  }
}
