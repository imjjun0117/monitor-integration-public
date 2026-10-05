import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import type { DbPoolResponse, ResourceResponse } from '../src/generated';

type Credentials = {
  username: string;
  password: string;
  agentToken: string;
  replacementToken: string;
};
type CertificateRow = {
  certificate_target_id: number;
  port: number;
  status: 'UP' | 'WARN' | 'DOWN' | null;
  message: string | null;
  checked_at: string | null;
  subject: string | null;
};

const runDirectory = resolve(process.cwd(), '../../.run/e2e');
const screenshotDirectory = resolve(process.cwd(), '../../docs/screenshots/redesign');
const credentials = JSON.parse(readFileSync(
  resolve(runDirectory, 'credentials.json'), 'utf8')) as Credentials;

async function login(page: Page) {
  await page.goto('/');
  const username = page.locator('input[name="username"]');
  if (await username.isVisible()) {
    await username.fill(credentials.username);
    await page.locator('input[name="password"]').fill(credentials.password);
    await Promise.all([
      page.waitForResponse((response) => response.url().includes('/api/v1/session/login')),
      page.locator('button[type="submit"]').click(),
    ]);
  }
  await page.goto('/');
  await expect(page.getByRole('heading', { name: '종합 현황' })).toBeVisible();
}

test('custom login and responsive dashboard meet visual behavior gates', async ({ page }) => {
  mkdirSync(screenshotDirectory, { recursive: true });
  const viewports = [
    { name: '1440', width: 1440, height: 900 },
    { name: '1024', width: 1024, height: 900 },
    { name: '390', width: 390, height: 844 },
  ];
  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    await page.context().clearCookies();
    await page.goto('/login');
    const loginBrand = page.getByText('Hermes Monitoring', { exact: true });
    await expect(loginBrand).toHaveCount(1);
    await expect(loginBrand).toBeVisible();
    await expect(page.locator('h1')).toHaveCount(1);
    await expect(page.locator('h1')).toHaveText('로그인');
    await expect(page.getByText(/Hermes|운영|Please sign in|통합 모니터링/)).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await page.screenshot({ path: resolve(screenshotDirectory, `login-${viewport.name}.png`), fullPage: true });

    await login(page);
    await expect(page.getByRole('navigation', { name: '주 메뉴' }).getByRole('link')).toHaveCount(5);
    await expect(page.getByRole('link', { name: '종합 현황' })).toHaveAttribute('aria-current', 'page');
    await expect(page.getByRole('heading', { name: /평균/ })).toHaveCount(0);
    await expect(page.locator('.project-card')).toHaveCount(2);
    await expect(page.locator('.project-card').first()).toBeVisible();
    await expect(page.getByLabel('추이 프로젝트')).toHaveValue('');
    await expect(page.getByLabel('추이 프로젝트').locator('option:checked')).toHaveText('전체 프로젝트');

    const choices = page.locator('.instance-picker input[type="checkbox"]');
    const choiceCount = await choices.count();
    expect(choiceCount).toBeGreaterThan(1);
    await expect(page.locator('.instance-picker legend')).toContainText('/6 선택');
    const selected = page.locator('.instance-picker input[type="checkbox"]:checked');
    await expect(selected).toHaveCount(1);
    const statusOrder: Record<string, number> = { DOWN: 0, WARN: 1, UNKNOWN: 2, UP: 3 };
    const labels = await choices.evaluateAll((nodes) => nodes.map((node) => node.getAttribute('aria-label') ?? ''));
    const expectedFirst = [...labels].sort((left, right) => {
      const leftStatus = left.match(/\((DOWN|WARN|UNKNOWN|UP)\)$/)?.[1] ?? 'UP';
      const rightStatus = right.match(/\((DOWN|WARN|UNKNOWN|UP)\)$/)?.[1] ?? 'UP';
      return statusOrder[leftStatus] - statusOrder[rightStatus] || left.localeCompare(right);
    })[0];
    await expect(page.getByLabel(expectedFirst, { exact: true })).toBeChecked();

    const second = page.locator('.instance-picker input[type="checkbox"]:not(:checked)').first();
    await second.check();
    await expect(page.locator('.series-legend li')).toHaveCount(2);
    const selectedNames = (await choices.evaluateAll((nodes) => nodes.filter((node) => (node as HTMLInputElement).checked)
      .map((node) => (node.getAttribute('aria-label') ?? '').replace(/ \((DOWN|WARN|UNKNOWN|UP)\)$/, ''))));
    const chartImage = page.locator('.comparison-panel .chart[role="img"]');
    for (const name of selectedNames) {
      await expect(page.locator('.series-legend')).toContainText(name);
      await expect(page.locator('.metric-chart-card > p')).toContainText(name);
      await expect(chartImage).toHaveAttribute('aria-label', new RegExp(escapeRegExp(name)));
    }
    const markStyles = await page.locator('.series-legend .series-mark').evaluateAll((nodes) => nodes.map((node) => {
      const style = getComputedStyle(node);
      return { color: style.borderTopColor, borderStyle: style.borderTopStyle };
    }));
    expect(markStyles).toHaveLength(2);
    for (const { color, borderStyle } of markStyles) {
      expect(color).not.toBe('');
      expect(borderStyle).not.toBe('');
    }
    expect(new Set(markStyles.map(({ color, borderStyle }) => `${color}:${borderStyle}`)).size).toBe(2);
    await expect(page.locator('.series-legend').getByRole('link', { name: '상세 보기' })).toHaveCount(2);

    if (choiceCount > 6) {
      for (let index = 0; index < 6; index += 1) await choices.nth(index).check();
      await choices.nth(6).check();
      await expect(page.getByRole('status')).toHaveText('최대 6개 인스턴스까지 비교할 수 있습니다.');
      await expect(choices.nth(6)).not.toBeChecked();
    }
    for (let index = 0; index < choiceCount; index += 1) {
      if (await choices.nth(index).isChecked()) await choices.nth(index).uncheck();
    }
    await expect(page.getByRole('status')).toHaveText('비교할 인스턴스를 선택해 주세요.');
    await expect(page.locator('.series-legend li')).toHaveCount(0);
    await choices.nth(1).check();
    await expect(page.locator('.series-legend').getByRole('link', { name: '상세 보기' })).toBeVisible();
    await assertDashboardLayout(page);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await page.screenshot({ path: resolve(screenshotDirectory, `dashboard-${viewport.name}.png`), fullPage: true });
    if (viewport.width === 390) {
      await page.goto('/settings/projects');
      await expect(page.getByText(/모바일에서는 조회만 지원/)).toBeVisible();
      await expect(page.getByLabel('프로젝트 ID')).toBeDisabled();
    }
  }
});

test('authenticated UI reaches four real HTTP agents and persisted detail data', async ({ page }) => {
  await login(page);
  await page.getByRole('link', { name: '프로젝트', exact: true }).click();
  await page.getByRole('link', { name: '샘플 A', exact: true }).click();
  const projectBack = page.getByRole('link', { name: '프로젝트 목록으로' });
  await projectBack.focus();
  await expect(projectBack).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/projects$/);
  await page.getByRole('link', { name: '샘플 A', exact: true }).click();
  await expect(page.getByRole('link', { name: '샘플 A 1' })).toBeVisible();
  await expect(page.getByRole('link', { name: '샘플 A 2' })).toBeVisible();
  await page.getByRole('link', { name: '샘플 A 1' }).click();
  const instanceBack = page.getByRole('link', { name: 'sample-a 인스턴스 목록으로' });
  await instanceBack.focus();
  await expect(instanceBack).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/projects\/sample-a$/);
  await page.getByRole('link', { name: '샘플 A 1' }).click();
  for (const name of ['JVM·서버 자원', 'DB Pool', '내부 점검']) {
    await expect(page.getByRole('tab', { name })).toBeVisible();
  }
  await expect(page.getByRole('grid', { name: '디스크', exact: true })).toBeVisible();
  await expect(page.getByRole('region', { name: '디스크 사용량 그래프' })).toBeVisible();
  await expect(page.getByLabel(/^디스크 사용량: /)).toBeVisible();
  await expect(page.getByLabel(/디스크 사용량 \(/)).toHaveCount(0);
  await assertFullPageCanvas(page);
  await page.getByRole('tab', { name: 'DB Pool' }).click();
  await expect(page.getByText('Sample Pool')).toBeVisible();
  await page.getByRole('tab', { name: '내부 점검' }).click();
  await expect(page.getByText('Internal health')).toBeVisible();

  await page.getByRole('link', { name: '프로젝트', exact: true }).click();
  await page.getByRole('link', { name: '샘플 B', exact: true }).click();
  await expect(page.getByRole('link', { name: '샘플 B 1' })).toBeVisible();
  await expect(page.getByRole('link', { name: '샘플 B 2' })).toBeVisible();
});

test('all acceptance resource metrics use real latest and 24h/7d graph API data', async ({ page }) => {
  await login(page);
  seedResourceHistory();
  const resourcePath = '/api/v1/projects/sample-a/instances/local-01/resources';
  const poolsPath = '/api/v1/projects/sample-a/instances/local-01/db-pools';
  for (const period of ['24h', '7d'] as const) {
    const resources = await browserJson<ResourceResponse>(
      page, `${resourcePath}?period=${period}&max_points=1000`);
    expect(resources.latest).toMatchObject({
      system_cpu_ratio: 0.2,
      physical_memory_used_bytes: 256_000_000,
      physical_memory_total_bytes: 1_024_000_000,
      heap_used_bytes: 32_000_000,
      heap_max_bytes: 128_000_000,
    });
    expect(resources.disks[0]).toMatchObject({ used_bytes: 100_000_000, total_bytes: 1_000_000_000 });
    expect(resources.history[0]).toMatchObject({
      system_cpu_ratio: 0.2,
      physical_memory_used_bytes: 256_000_000,
      heap_used_bytes: 32_000_000,
    });
    expect(resources.disk_history[0]).toMatchObject({ used_bytes: 100_000_000 });
    const resourceTimes = resources.history.map((point) => Date.parse(point.sampled_at));
    expect(resourceTimes.length).toBeGreaterThanOrEqual(3);
    expect(resourceTimes).toEqual([...resourceTimes].sort((left, right) => right - left));

    const pools = await browserJson<DbPoolResponse>(
      page, `${poolsPath}?period=${period}&max_points=1000`);
    expect(pools.items[0]).toMatchObject({ active: 1, idle: 2, max_size: 10 });
    expect(pools.history[0]).toMatchObject({ active: 1, idle: 2, max_size: 10 });
  }

  await page.goto('/projects/sample-a/instances/local-01');
  await expect(page.getByText('20%', { exact: true })).toBeVisible();
  await expect(page.getByLabel('물리 메모리 값')).toHaveText('244.14 MB / 976.56 MB');
  await expect(page.getByLabel('JVM Heap 값')).toHaveText('30.52 MB / 122.07 MB');
  await expect(page.getByRole('row', { name: /Temporary filesystem 95\.37 MB 953\.67 MB/ })).toBeVisible();
  for (const title of ['시스템 CPU', '물리 메모리 사용량', 'JVM Heap 사용량',
    '디스크 사용량']) {
    await expect(page.getByLabel(new RegExp(`^${title}: [1-9]\\d*개 지점`))).toBeVisible();
  }
  await expect(page.getByLabel(
    /^시스템 CPU: (?:[3-9]|[1-9]\d+)개 지점, 최근 값 20%$/,
  )).toBeVisible();
  const resourceSevenDay = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return url.pathname.endsWith(resourcePath) && url.searchParams.get('period') === '7d';
  });
  await page.getByLabel('조회 기간').selectOption('7d');
  expect((await resourceSevenDay).ok()).toBe(true);

  await page.getByRole('tab', { name: 'DB Pool' }).click();
  await expect(page.getByRole('row', { name: /Sample Pool 1 2 10/ })).toBeVisible();
  for (const title of ['DB Pool Active', 'DB Pool Idle', 'DB Pool Max']) {
    await expect(page.getByLabel(new RegExp(`^${title}: [1-9]\\d*개 지점`))).toBeVisible();
  }
  const poolSevenDay = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return url.pathname.endsWith(poolsPath) && url.searchParams.get('period') === '7d';
  });
  await page.getByLabel('DB Pool 조회 기간').selectOption('7d');
  expect((await poolSevenDay).ok()).toBe(true);

  await page.goto('/projects/sample-a/instances/local-02');
  await expect(page.getByLabel('시스템 CPU 값')).toHaveText('미지원');
  await expect(page.getByLabel('물리 메모리 값')).toHaveText('미지원 / 미지원');
  await expect(page.getByLabel('JVM Heap 값')).toHaveText('미지원 / 미지원');
  await expect(page.getByRole('row', { name: /Temporary filesystem 미지원 미지원/ })).toBeVisible();
  for (const title of ['시스템 CPU', '물리 메모리 사용량', 'JVM Heap 사용량',
    '디스크 사용량']) {
    await expect(page.getByLabel(new RegExp(`^${title}: 수집된 지점 없음$`))).toBeVisible();
  }
  await page.getByRole('tab', { name: 'DB Pool' }).click();
  await expect(page.getByRole('row', { name: /Sample Pool 미지원 미지원 미지원/ })).toBeVisible();
  for (const title of ['DB Pool Active', 'DB Pool Idle', 'DB Pool Max']) {
    await expect(page.getByLabel(`${title}: 수집된 지점 없음`)).toBeVisible();
  }
});

test('all five real API filters, INTERNAL/EXTERNAL UI, and bounded rerun polling work', async ({ page }) => {
  await login(page);
  await page.getByRole('link', { name: 'API 모니터링' }).click();
  await expect(page.getByRole('option', { name: 'INTERNAL' })).toHaveCount(1);
  await expect(page.getByRole('option', { name: 'EXTERNAL' })).toHaveCount(1);

  const projectFilter = page.getByLabel('프로젝트 필터');
  await projectFilter.selectOption('sample-a');
  await expect(projectFilter).toHaveValue('sample-a');
  const instanceFilter = page.getByLabel('인스턴스 필터');
  await expect(instanceFilter).toBeEnabled();
  await expect(instanceFilter.locator('option[value="local-01"]')).toHaveCount(1);
  await instanceFilter.selectOption('local-01');
  await expect(instanceFilter).toHaveValue('local-01');
  await page.getByLabel('내외부 필터').selectOption('EXTERNAL');
  await page.getByLabel('상태 필터').selectOption('UP');
  const filtered = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return url.pathname.endsWith('/api/v1/api-checks')
      && url.searchParams.get('project') === 'sample-a'
      && url.searchParams.get('instance') === 'local-01'
      && url.searchParams.get('direction') === 'EXTERNAL'
      && url.searchParams.get('status') === 'UP'
      && url.searchParams.get('name') === 'Sample API';
  });
  await page.getByLabel('API 이름').fill('Sample API');
  await filtered;

  const sampleRow = page.getByRole('row', { name: /EXTERNAL Sample API/ });
  await expect(sampleRow).toBeVisible();
  await sampleRow.getByRole('button', { name: 'Sample API' }).click();
  await expect(page.getByRole('heading', { name: '최근 결과' })).toBeVisible();
  const rerunResponse = page.waitForResponse((response) => response.request().method() === 'POST'
    && response.url().endsWith('/api/v1/api-checks/sample-a/local-01/sample-api/run'));
  await page.getByRole('button', { name: '즉시 재점검' }).click();
  const accepted = await rerunResponse;
  expect(accepted.status(), await accepted.text()).toBe(202);
  await expect(page.getByText(/재점검 결과를 기다리는 중.*최대 15초/)).toBeVisible();
  await expect(page.getByText(/재점검 결과를 기다리는 중.*최대 15초/))
    .not.toBeVisible({ timeout: 15_500 });
  await expect(page.getByText(/15초 안에 새 결과/)).toHaveCount(0);

  await page.getByRole('button', { name: '상세 닫기' }).click();
  await page.getByLabel('내외부 필터').selectOption('INTERNAL');
  await page.getByLabel('상태 필터').selectOption('UP');
  await page.getByLabel('API 이름').fill('E2E Internal API');
  await expect(page.getByRole('row', { name: /INTERNAL E2E Internal API/ })).toBeVisible();
});

test('settings edits persist and agent tokens remain write-only', async ({ page }) => {
  await login(page);
  await page.getByRole('link', { name: '설정', exact: true }).click();

  const projectTable = page.getByRole('grid', { name: '프로젝트 설정' });
  await expect(projectTable.getByRole('columnheader')).toHaveCount(2);
  await expect(projectTable.getByRole('columnheader', { name: '표시명' })).toHaveCount(0);
  await expect(projectTable.getByRole('columnheader', { name: '프로젝트 상태' })).toHaveCount(0);
  await expect(page.getByLabel('프로젝트 sample-a 표시명')).toHaveCount(0);
  await expect(page.getByLabel('프로젝트 sample-a 프로젝트 상태')).toHaveCount(0);
  await expect(page.getByRole('button', { name: '프로젝트 sample-a 저장' })).toHaveCount(0);
  await expect(projectTable.getByRole('button', { name: '삭제', exact: true }).first()).toBeVisible();

  await page.getByRole('link', { name: '인스턴스 관리' }).click();
  await page.getByLabel('인스턴스 local-01 환경').fill('e2e-saved');
  await page.getByLabel('인스턴스 local-01 폴링 간격').fill('16');
  const token = page.getByLabel('인스턴스 local-01 새 토큰');
  await expect(token).toHaveValue('');
  await token.fill(credentials.replacementToken);
  const replacementRequest = page.waitForRequest((request) => request.method() === 'PUT'
    && request.url().endsWith('/api/v1/projects/sample-a/instances/local-01'));
  await page.getByRole('button', { name: '인스턴스 local-01 저장' }).click();
  const submitted = (await replacementRequest).postDataJSON() as Record<string, unknown>;
  expect(typeof submitted.token).toBe('string');
  expect(new TextEncoder().encode(String(submitted.token)).length).toBeGreaterThanOrEqual(32);
  await expect(token).toHaveValue('');

  const instances = await browserJson<{ items: Array<Record<string, unknown>> }>(
    page, '/api/v1/projects/sample-a/instances?page=0&size=200');
  const savedInstance = instances.items.find((item) => item.instance_id === 'local-01');
  expect(savedInstance).toMatchObject({ environment: 'e2e-saved', poll_interval_seconds: 16 });
  expect(savedInstance).not.toHaveProperty('token');
  expect(savedInstance).not.toHaveProperty('token_ciphertext');
  expect(savedInstance).not.toHaveProperty('token_iv');

  await page.getByRole('link', { name: '종합 현황' }).click();
  await page.getByRole('link', { name: '설정', exact: true }).click();
  await page.getByRole('link', { name: '인스턴스 관리' }).click();
  await expect(page.getByLabel('인스턴스 local-01 새 토큰')).toHaveValue('');
  await page.getByLabel('인스턴스 local-01 새 토큰').fill(credentials.agentToken);
  await Promise.all([
    page.waitForResponse((response) => response.request().method() === 'PUT'
      && response.url().endsWith('/api/v1/projects/sample-a/instances/local-01') && response.ok()),
    page.getByRole('button', { name: '인스턴스 local-01 저장' }).click(),
  ]);
  await expect(page.getByLabel('인스턴스 local-01 새 토큰')).toHaveValue('');

  await page.getByRole('link', { name: '임계치 관리' }).click();
  await page.getByLabel('SYSTEM_CPU 경고').fill('0.81');
  await Promise.all([
    page.waitForResponse((response) => response.request().method() === 'PUT'
      && response.url().endsWith('/api/v1/settings/thresholds') && response.ok()),
    page.getByRole('button', { name: '임계치 저장' }).click(),
  ]);
  await expect(page.getByLabel('SYSTEM_CPU 경고')).toHaveValue('0.81');

  await page.getByRole('link', { name: '인증서 대상 관리' }).click();
  await createCertificateTarget(page, 18443);
  await createCertificateTarget(page, 18444);
  const hosts = page.getByRole('textbox', { name: /^인증서 \d+ 호스트$/ });
  await expect(hosts).toHaveCount(2);
  const hostLabel = await hosts.first().getAttribute('aria-label');
  const targetId = hostLabel?.match(/^인증서 (\d+) 호스트$/)?.[1];
  expect(targetId).toBeTruthy();
  await page.getByLabel(`인증서 ${targetId} 점검 간격`).fill('2');
  const certificateRow = page.getByLabel(`인증서 ${targetId} 호스트`).locator('xpath=ancestor::tr');
  await Promise.all([
    page.waitForResponse((response) => response.request().method() === 'PUT'
      && response.url().endsWith(`/api/v1/certificates/${targetId}`) && response.ok()),
    certificateRow.getByRole('button', { name: '저장' }).click(),
  ]);
  const certificates = await certificateRows(page);
  expect(certificates.find((item) => item.certificate_target_id === Number(targetId)))
    .toMatchObject({ check_interval_minutes: 2 });
});

test('certificate success, failure, and rerun results persist through the real center', async ({ page }) => {
  test.setTimeout(60_000);
  await login(page);
  const existingPorts = new Set((await certificateRows(page)).map((item) => item.port));
  if (!existingPorts.has(18443) || !existingPorts.has(18444)) {
    await page.getByRole('link', { name: '설정', exact: true }).click();
    await page.getByRole('link', { name: '인증서 대상 관리' }).click();
    if (!existingPorts.has(18443)) await createCertificateTarget(page, 18443);
    if (!existingPorts.has(18444)) await createCertificateTarget(page, 18444);
  }
  await page.getByRole('link', { name: '인증서 관리' }).click();

  const successRow = page.getByRole('row', { name: /localhost:18443/ });
  await successRow.getByRole('button', { name: '즉시 재검사' }).click();
  await expect.poll(async () => certificateByPort(page, 18443), {
    timeout: 10_000,
  }).toMatchObject({ status: 'UP', message: 'TLS_CHECK_SUCCEEDED' });

  const failureRow = page.getByRole('row', { name: /localhost:18444/ });
  await failureRow.getByRole('button', { name: '즉시 재검사' }).click();
  await expect.poll(async () => certificateByPort(page, 18444), {
    timeout: 10_000,
  }).toMatchObject({ status: 'DOWN', message: 'TLS_CHECK_FAILED', subject: null });

  const beforeRerun = (await certificateByPort(page, 18443))?.checked_at;
  await successRow.getByRole('button', { name: '즉시 재검사' }).click();
  await expect.poll(async () => (await certificateByPort(page, 18443))?.checked_at, {
    timeout: 10_000,
  }).not.toBe(beforeRerun);

  await page.reload();
  await expect(page.getByRole('row', { name: /localhost:18443.*정상/ })).toBeVisible();
  await expect(page.getByRole('row', { name: /localhost:18444.*장애/ })).toBeVisible();
});

test('cached detail data becomes a safe stale/error UI while PostgreSQL is down', async ({ page }) => {
  test.setTimeout(90_000);
  await login(page);
  await page.getByRole('link', { name: '프로젝트', exact: true }).click();
  await page.locator('a[href="/projects/sample-a"]').click();
  await page.locator('a[href="/projects/sample-a/instances/local-02"]').click();
  await expect(page.getByRole('grid', { name: '디스크', exact: true })).toBeVisible();

  const control = JSON.parse(readFileSync(resolve(runDirectory, 'control.json'), 'utf8')) as {
    composeProject: string;
  };
  const stopped = spawnSync('docker', [
    'compose', '-p', control.composeProject, 'stop', 'postgres',
  ], { encoding: 'utf8' });
  expect(stopped.status).toBe(0);
  try {
    await expect(page.getByText(/마지막 정상 데이터를 표시합니다/)).toBeVisible({ timeout: 50_000 });
    await expect(page.getByRole('grid', { name: '디스크', exact: true })).toBeVisible();
  } finally {
    const started = spawnSync('docker', [
      'compose', '-p', control.composeProject, 'start', 'postgres',
    ], { encoding: 'utf8' });
    expect(started.status).toBe(0);
    await expect.poll(async () => {
      const response = await page.request.get('/actuator/health');
      return response.status();
    }, { timeout: 30_000 }).toBe(200);
  }
});

test('dashboard has no serious accessibility violations after the real flows', async ({ page }) => {
  await login(page);
  const result = await new AxeBuilder({ page }).analyze();
  expect(result.violations).toEqual([]);
});

async function assertDashboardLayout(page: Page) {
  await expect(page.locator('.comparison-panel canvas')).toBeVisible();
  const layout = await page.evaluate(() => {
    const root = document.documentElement;
    const main = document.querySelector('main')!.getBoundingClientRect();
    const tolerance = 1;
    const boxes = ['.issue-panel', '.project-card', '.comparison-panel', '.metric-chart-card', '.chart', '.chart canvas']
      .flatMap((selector) => [...document.querySelectorAll<HTMLElement>(selector)])
      .filter((element) => element.offsetParent !== null)
      .map((element) => {
        const box = element.getBoundingClientRect();
        return { selector: element.className || element.tagName, left: box.left, right: box.right,
          width: box.width, insideMain: box.left >= main.left - tolerance && box.right <= main.right + tolerance,
          insideViewport: box.left >= -tolerance && box.right <= innerWidth + tolerance };
      });
    const unclipped = [...document.querySelectorAll<HTMLElement>('.project-card, .metric-chart-card, .chart')]
      .filter((element) => element.offsetParent !== null)
      .every((element) => element.scrollWidth <= element.clientWidth + tolerance);
    const workspace = document.querySelector<HTMLElement>('.workspace');
    const body = document.body;
    return {
      noDocumentOverflow: root.scrollWidth <= innerWidth,
      boxes,
      unclipped,
      canvasToBottom: root.scrollHeight >= innerHeight
        && getComputedStyle(body).backgroundColor !== 'rgba(0, 0, 0, 0)',
      background: workspace ? getComputedStyle(workspace).backgroundColor : getComputedStyle(body).backgroundColor,
    };
  });
  expect(layout.noDocumentOverflow).toBe(true);
  expect(layout.boxes.length).toBeGreaterThanOrEqual(5);
  expect(layout.boxes.every((box) => box.insideMain && box.insideViewport), JSON.stringify(layout.boxes)).toBe(true);
  expect(layout.unclipped).toBe(true);
  expect(layout.canvasToBottom).toBe(true);
  expect(layout.background).not.toBe('rgba(0, 0, 0, 0)');
}

async function assertFullPageCanvas(page: Page) {
  const canvas = await page.evaluate(() => {
    const documentHeight = document.documentElement.scrollHeight;
    const selectors = ['html', 'body', '#root', '.app-shell', '.workspace', 'main'];
    return selectors.map((selector) => {
      const element = document.querySelector<HTMLElement>(selector)!;
      return {
        selector,
        height: element.getBoundingClientRect().height,
        background: getComputedStyle(element).backgroundColor,
        documentHeight,
      };
    });
  });
  const fullHeightSelectors = new Set(['#root', '.app-shell', '.workspace', 'main']);
  const fullHeightCanvas = canvas.filter(({ selector }) => fullHeightSelectors.has(selector));
  expect(fullHeightCanvas.every(({ height, documentHeight }) => Math.abs(height - documentHeight) <= 1),
    JSON.stringify(fullHeightCanvas)).toBe(true);
  expect(canvas.every(({ background }) => background === 'rgb(247, 247, 249)'), JSON.stringify(canvas)).toBe(true);
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function createCertificateTarget(page: Page, port: number) {
  const project = page.getByLabel('인증서 프로젝트');
  await expect(project).toBeEnabled();
  await expect(project.locator('option[value="sample-a"]')).toHaveCount(1);
  await project.selectOption('sample-a');
  await expect(project).toHaveValue('sample-a');
  await page.getByLabel('인증서 호스트').fill('localhost');
  await page.getByLabel('인증서 포트').fill(String(port));
  await page.getByLabel('SNI 호스트').fill('localhost');
  await Promise.all([
    page.waitForResponse((response) => response.request().method() === 'POST'
      && response.url().endsWith('/api/v1/certificates') && response.status() === 201),
    page.getByRole('button', { name: '인증서 대상 등록' }).click(),
  ]);
}

async function browserJson<T>(page: Page, path: string): Promise<T> {
  return page.evaluate(async (url) => {
    const response = await fetch(url, { credentials: 'same-origin' });
    if (!response.ok) throw new Error(`request failed: ${response.status}`);
    return response.json();
  }, path) as Promise<T>;
}

function seedResourceHistory() {
  const control = JSON.parse(readFileSync(resolve(runDirectory, 'control.json'), 'utf8')) as {
    composeProject: string;
  };
  const sql = `
    insert into instance_metric_samples(
      sampled_at,project_id,instance_id,system_cpu_ratio,
      physical_memory_used_bytes,heap_used_bytes)
    values
      (date_trunc('minute',now())-interval '2 minutes'+interval '10 seconds',
       'sample-a','local-01',0.11,256000000,32000000),
      (date_trunc('minute',now())-interval '1 minute'+interval '10 seconds',
       'sample-a','local-01',0.2,256000000,32000000)
    on conflict do nothing;
  `;
  const seeded = spawnSync('docker', [
    'compose', '-p', control.composeProject, 'exec', '-T', 'postgres',
    'psql', '-U', 'hermes', '-d', 'hermes_monitor', '-v', 'ON_ERROR_STOP=1', '-c', sql,
  ], { encoding: 'utf8' });
  expect(seeded.status, `${seeded.stdout}\n${seeded.stderr}`).toBe(0);
}

async function certificateRows(page: Page): Promise<Array<CertificateRow & Record<string, unknown>>> {
  const response = await browserJson<{ items: Array<CertificateRow & Record<string, unknown>> }>(
    page, '/api/v1/certificates?page=0&size=200');
  return response.items;
}

async function certificateByPort(page: Page, port: number) {
  return (await certificateRows(page)).find((item) => item.port === port);
}
