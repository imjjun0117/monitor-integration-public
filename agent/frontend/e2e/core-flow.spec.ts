import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import type { DbPoolResponse, InstanceThresholdSettings, ResourceResponse } from '../src/generated';

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
const screenshotDirectory = resolve(runDirectory, 'screenshots');
const tlsPort = Number(process.env.HERMES_E2E_TLS_PORT ?? 18443);
const tlsFailurePort = Number(process.env.HERMES_E2E_TLS_FAILURE_PORT ?? 18444);
const credentials = JSON.parse(
  readFileSync(resolve(runDirectory, 'credentials.json'), 'utf8'),
) as Credentials;

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

async function chooseOption(page: Page, label: string, option: string) {
  await page.getByRole('combobox', { name: label, exact: true }).click();
  await page.locator('.ant-select-dropdown:visible').getByText(option, { exact: true }).click();
  await expect(page.getByRole('combobox', { name: label, exact: true })).toBeVisible();
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
    await page.evaluate(() => sessionStorage.clear());
    const loginBrand = page.getByText('Monitoring', { exact: true });
    await expect(loginBrand).toHaveCount(1);
    await expect(loginBrand).toBeVisible();
    await expect(page.locator('h1')).toHaveCount(1);
    await expect(page.locator('h1')).toHaveText('Login');
    await expect(page.getByText(/Hermes|운영|Please sign in|통합 모니터링/)).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await page.screenshot({
      path: resolve(screenshotDirectory, `login-${viewport.name}.png`),
      fullPage: true,
    });

    await login(page);
    if (viewport.width === 390) {
      await page.getByRole('button', { name: '메뉴 열기' }).click();
    }
    await expect(page.getByRole('menu', { name: '주 메뉴' }).getByRole('menuitem')).toHaveCount(8);
    await expect(page.getByRole('link', { name: '종합 현황' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    if (viewport.width === 390) {
      await page.getByRole('link', { name: '종합 현황', exact: true }).click();
      await expect(page.getByRole('menu', { name: '주 메뉴' })).not.toBeVisible();
    }
    await expect(page.getByRole('heading', { name: /평균/ })).toHaveCount(0);
    await expect(page.getByRole('combobox', { name: '프로젝트 선택' })).toBeVisible();
    await chooseOption(page, '프로젝트 선택', '샘플 A');
    await expect(page.getByRole('link', { name: /샘플 A \/ 샘플 A 1/ })).toBeVisible();
    // docs/project-scoped-dashboard-plan.md: 한 서버의 조회 범위 유지와 프로젝트 변경 시 초기화 검증
    const resourceResponse = page.waitForResponse((response) => {
      const url = new URL(response.url());
      return url.pathname.endsWith('/projects/sample-a/instances/local-02/resources');
    });
    await chooseOption(page, '인스턴스 선택', '샘플 A 2');
    const resources = await resourceResponse;
    expect(resources.ok()).toBe(true);
    const resourceData = (await resources.json()) as ResourceResponse;
    expect(resourceData.latest?.system_cpu_ratio).toBeNull();
    expect(resourceData.history.length).toBeGreaterThan(0);
    await expect(
      page.getByRole('region', { name: '샘플 A / 샘플 A 2', exact: true }),
    ).toBeVisible();
    await expect(page.locator('.instance-dashboard')).toHaveCount(1);
    await expect(page.getByRole('region', { name: '샘플 A / 샘플 A 1', exact: true })).toHaveCount(
      0,
    );
    await expect(page).toHaveURL(/instance=local-02/);
    await page.reload();
    await expect(
      page.getByRole('region', { name: '샘플 A / 샘플 A 2', exact: true }),
    ).toBeVisible();
    await expect(page).toHaveURL(/instance=local-02/);
    await chooseOption(page, '프로젝트 선택', '샘플 B');
    await expect(
      page.getByRole('region', { name: '샘플 B / 샘플 B 1', exact: true }),
    ).toBeVisible();
    await expect(page).toHaveURL(/project=sample-b.*instance=local-01/);
    await expect(page.getByRole('region', { name: '샘플 A / 샘플 A 2', exact: true })).toHaveCount(
      0,
    );
    for (const title of ['CPU', 'RAM', 'JVM Heap', '디스크']) {
      await expect(
        page.getByRole('region', { name: `샘플 B / 샘플 B 1 · ${title} 그래프`, exact: true }),
      ).toBeVisible();
    }
    await assertDashboardLayout(page);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await page.screenshot({
      path: resolve(screenshotDirectory, `dashboard-${viewport.name}.png`),
      fullPage: true,
    });
    if (viewport.width === 390) {
      await page.goto('/settings/projects');
      await expect(page.getByText(/모바일에서는 조회만 지원/)).toBeVisible();
      await expect(page.getByRole('button', { name: '프로젝트 등록', exact: true })).toBeDisabled();
    }
  }
});

test('authenticated UI reaches four real HTTP agents and persisted detail data', async ({
  page,
}) => {
  await login(page);
  await page.goto('/projects?project=');
  await page.getByRole('link', { name: '샘플 A', exact: true }).click();
  const projectBack = page.getByRole('link', { name: '프로젝트 목록으로' });
  await projectBack.focus();
  await expect(projectBack).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/projects\?project=$/);
  await page.goto('/projects?project=');
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
  await expect(page.getByRole('table', { name: '디스크', exact: true })).toBeVisible();
  await expect(page.getByRole('region', { name: '디스크 사용량 그래프' })).toBeVisible();
  await expect(page.getByLabel(/^디스크 사용량: /)).toBeVisible();
  await expect(page.getByLabel(/디스크 사용량 \(/)).toHaveCount(0);
  await assertFullPageCanvas(page);
  await page.getByRole('tab', { name: 'DB Pool' }).click();
  await expect(page.getByText('Sample Pool')).toBeVisible();
  await page.getByRole('tab', { name: '내부 점검' }).click();
  await expect(page.getByText('Internal health')).toBeVisible();

  await page.goto('/projects?project=');
  await page.getByRole('link', { name: '샘플 B', exact: true }).click();
  await expect(page.getByRole('link', { name: '샘플 B 1' })).toBeVisible();
  await expect(page.getByRole('link', { name: '샘플 B 2' })).toBeVisible();
});

test('all acceptance resource metrics use real latest and 24h/7d graph API data', async ({
  page,
}) => {
  await login(page);
  seedResourceHistory();
  const resourcePath = '/api/v1/projects/sample-a/instances/local-01/resources';
  const poolsPath = '/api/v1/projects/sample-a/instances/local-01/db-pools';
  for (const period of ['24h', '7d'] as const) {
    const resources = await browserJson<ResourceResponse>(
      page,
      `${resourcePath}?period=${period}&max_points=1000`,
    );
    expect(resources.latest).toMatchObject({
      system_cpu_ratio: 0.2,
      physical_memory_used_bytes: 256_000_000,
      physical_memory_total_bytes: 1_024_000_000,
      heap_used_bytes: 32_000_000,
      heap_max_bytes: 128_000_000,
    });
    expect(resources.disks[0]).toMatchObject({
      used_bytes: 100_000_000,
      total_bytes: 1_000_000_000,
    });
    expect(resources.history.find((point) => point.system_cpu_ratio === 0.2)).toMatchObject({
      system_cpu_ratio: 0.2,
      physical_memory_used_bytes: 256_000_000,
      heap_used_bytes: 32_000_000,
    });
    expect(resources.disk_history[0]).toMatchObject({ used_bytes: 100_000_000 });
    const resourceTimes = resources.history.map((point) => Date.parse(point.sampled_at));
    expect(resourceTimes.length).toBeGreaterThanOrEqual(3);
    // 24시간 원본은 오래된 순, 7일 버킷은 최신 순으로 반환.
    expect(resourceTimes).toEqual(
      [...resourceTimes].sort((left, right) => (period === '24h' ? left - right : right - left)),
    );

    const pools = await browserJson<DbPoolResponse>(
      page,
      `${poolsPath}?period=${period}&max_points=1000`,
    );
    expect(pools.items[0]).toMatchObject({ active: 1, idle: 2, max_size: 10 });
    expect(pools.history[0]).toMatchObject({ active: 1, idle: 2, max_size: 10 });
  }

  await page.goto('/projects/sample-a/instances/local-01');
  await expect(page.getByLabel('시스템 CPU 값')).toHaveText('20%');
  await expect(page.getByLabel('물리 메모리 값')).toHaveText('244.14 MB / 976.56 MB');
  await expect(page.getByLabel('JVM Heap 값')).toHaveText('30.52 MB / 122.07 MB');
  await expect(
    page.getByRole('row', { name: /Temporary filesystem 95\.37 MB 953\.67 MB/ }),
  ).toBeVisible();
  for (const title of ['시스템 CPU', '물리 메모리 사용량', 'JVM Heap 사용량', '디스크 사용량']) {
    await expect(page.getByLabel(new RegExp(`^${title}: [1-9]\\d*개 지점`))).toBeVisible();
  }
  await expect(
    page.getByLabel(/^시스템 CPU: (?:[3-9]|[1-9]\d+)개 지점, 최근 값 20%$/),
  ).toBeVisible();
  const resourceSevenDay = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return url.pathname.endsWith(resourcePath) && url.searchParams.get('period') === '7d';
  });
  await chooseOption(page, '조회 기간', '일주일');
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
  await chooseOption(page, 'DB Pool 조회 기간', '일주일');
  expect((await poolSevenDay).ok()).toBe(true);

  await page.goto('/projects/sample-a/instances/local-02');
  await expect(page.getByLabel('시스템 CPU 값')).toHaveText('미지원');
  await expect(page.getByLabel('물리 메모리 값')).toHaveText('미지원 / 미지원');
  await expect(page.getByLabel('JVM Heap 값')).toHaveText('미지원 / 미지원');
  await expect(page.getByRole('row', { name: /Temporary filesystem 미지원 미지원/ })).toBeVisible();
  for (const title of ['시스템 CPU', '물리 메모리 사용량', 'JVM Heap 사용량', '디스크 사용량']) {
    await expect(page.getByLabel(new RegExp(`^${title}: 수집된 지점 없음$`))).toBeVisible();
  }
  await page.getByRole('tab', { name: 'DB Pool' }).click();
  await expect(page.getByRole('row', { name: /Sample Pool 미지원 미지원 미지원/ })).toBeVisible();
  for (const title of ['DB Pool Active', 'DB Pool Idle', 'DB Pool Max']) {
    await expect(page.getByLabel(`${title}: 수집된 지점 없음`)).toBeVisible();
  }
});

test('all five real API filters, INTERNAL/EXTERNAL UI, and bounded rerun polling work', async ({
  page,
}) => {
  await login(page);
  await page.getByRole('link', { name: 'API 모니터링' }).click();
  await page.getByRole('combobox', { name: '내외부 필터' }).click();
  await expect(page.getByText('내부 API', { exact: true }).last()).toBeVisible();
  await expect(page.getByText('외부 API', { exact: true }).last()).toBeVisible();
  await page.keyboard.press('Escape');

  const projectFilter = page.getByRole('combobox', { name: '프로젝트 필터' });
  await chooseOption(page, '프로젝트 필터', '샘플 A (sample-a)');
  await expect(projectFilter.locator('xpath=..')).toContainText('샘플 A (sample-a)');
  const instanceFilter = page.getByRole('combobox', { name: '인스턴스 필터' });
  await expect(instanceFilter).toBeEnabled();
  await chooseOption(page, '인스턴스 필터', '샘플 A 1 (local-01)');
  await expect(instanceFilter.locator('xpath=..')).toContainText('샘플 A 1 (local-01)');
  await chooseOption(page, '내외부 필터', '외부 API');
  await chooseOption(page, '상태 필터', '정상');
  const filtered = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      url.pathname.endsWith('/api/v1/api-checks') &&
      url.searchParams.get('project') === 'sample-a' &&
      url.searchParams.get('instance') === 'local-01' &&
      url.searchParams.get('direction') === 'EXTERNAL' &&
      url.searchParams.get('status') === 'UP' &&
      url.searchParams.get('name') === 'Sample API'
    );
  });
  await page.getByLabel('API 이름').fill('Sample API');
  await filtered;

  const sampleRow = page.getByRole('row', { name: /외부 API Sample API/ });
  await expect(sampleRow).toBeVisible();
  await sampleRow.getByRole('button', { name: 'Sample API', exact: true }).click();
  const detail = page.getByRole('dialog', { name: 'API 점검 상세' });
  await expect(detail.getByRole('heading', { name: 'Sample API' })).toBeVisible();
  await expect(detail.getByRole('row', { name: '결과 코드 200' })).toBeVisible();
  const rerunResponse = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' &&
      response.url().endsWith('/api/v1/api-checks/sample-a/local-01/sample-api/run'),
  );
  const startedAt = Date.now();
  await page.getByRole('button', { name: '지금 테스트 실행' }).click();
  const accepted = await rerunResponse;
  expect(accepted.status()).toBe(202);
  await expect(page.getByText('테스트 결과를 기다리고 있습니다.')).toBeVisible();
  await expect(page.getByText('테스트 결과를 기다리고 있습니다.')).not.toBeVisible({
    timeout: 15_500,
  });
  expect(Date.now() - startedAt).toBeLessThanOrEqual(15_500);
  await expect(page.getByText(/아직 새 결과가 도착하지 않았습니다/)).toHaveCount(0);

  await page.getByRole('button', { name: '상세 닫기' }).click();
  await chooseOption(page, '내외부 필터', '내부 API');
  await chooseOption(page, '상태 필터', '정상');
  await page.getByLabel('API 이름').fill('E2E Internal API');
  await expect(page.getByRole('row', { name: /내부 API E2E Internal API/ })).toBeVisible();
});

test('settings edits persist and agent tokens remain write-only', async ({ page }) => {
  await login(page);
  await chooseOption(page, '프로젝트 선택', '샘플 A');
  await page.goto('/settings/projects');

  const projectTable = page.getByRole('table', { name: '프로젝트 설정' });
  await expect(projectTable.getByRole('columnheader')).toHaveCount(3);
  await expect(projectTable.getByRole('columnheader', { name: '표시명' })).toHaveCount(0);
  await expect(projectTable.getByRole('columnheader', { name: '프로젝트 상태' })).toHaveCount(0);
  await expect(page.getByLabel('프로젝트 sample-a 표시명')).toHaveCount(0);
  await expect(page.getByLabel('프로젝트 sample-a 프로젝트 상태')).toHaveCount(0);
  await expect(page.getByRole('button', { name: '프로젝트 sample-a 저장' })).toHaveCount(0);
  await expect(
    projectTable.getByRole('button', { name: '삭제', exact: true }).first(),
  ).toBeVisible();

  await page.goto('/settings/instances');
  await chooseOption(page, '소속 프로젝트', '샘플 A (sample-a)');
  await page.getByRole('button', { name: '인스턴스 local-01 수정' }).click();
  const edit = page.getByRole('dialog', { name: '인스턴스 수정' });
  await edit.getByLabel('인스턴스 local-01 환경').fill('e2e-saved');
  await edit.getByLabel('인스턴스 local-01 폴링 간격').fill('16');
  const token = edit.getByLabel('새 토큰');
  await expect(token).toHaveValue('');
  await token.fill(credentials.replacementToken);
  const replacementRequest = page.waitForRequest(
    (request) =>
      request.method() === 'PUT' &&
      request.url().endsWith('/api/v1/projects/sample-a/instances/local-01'),
  );
  await edit.getByRole('button', { name: '인스턴스 local-01 저장' }).click();
  const submitted = (await replacementRequest).postDataJSON() as Record<string, unknown>;
  expect(typeof submitted.token).toBe('string');
  expect(new TextEncoder().encode(String(submitted.token)).length).toBeGreaterThanOrEqual(32);
  await expect(edit).not.toBeVisible();

  const instances = await browserJson<{ items: Array<Record<string, unknown>> }>(
    page,
    '/api/v1/projects/sample-a/instances?page=0&size=200',
  );
  const savedInstance = instances.items.find((item) => item.instance_id === 'local-01');
  expect(savedInstance).toMatchObject({ environment: 'e2e-saved', poll_interval_seconds: 16 });
  expect(savedInstance).not.toHaveProperty('token');
  expect(savedInstance).not.toHaveProperty('token_ciphertext');
  expect(savedInstance).not.toHaveProperty('token_iv');

  await page.goto('/');
  await page.goto('/settings/instances');
  await chooseOption(page, '소속 프로젝트', '샘플 A (sample-a)');
  await page.getByRole('button', { name: '인스턴스 local-01 수정' }).click();
  await expect(edit.getByLabel('새 토큰')).toHaveValue('');
  await edit.getByLabel('새 토큰').fill(credentials.agentToken);
  await Promise.all([
    page.waitForResponse(
      (response) =>
        response.request().method() === 'PUT' &&
        response.url().endsWith('/api/v1/projects/sample-a/instances/local-01') &&
        response.ok(),
    ),
    edit.getByRole('button', { name: '인스턴스 local-01 저장' }).click(),
  ]);
  await expect(edit).not.toBeVisible();

  await page.goto('/settings/thresholds');
  // docs/instance-threshold-settings.md: 선택 서버의 항목 등록과 저장 후 재조회 검증
  await chooseOption(page, '프로젝트', '샘플 A');
  await chooseOption(page, '인스턴스', '샘플 A 1');
  await page.getByRole('button', { name: '추가', exact: true }).click();
  const thresholdDialog = page.getByRole('dialog', { name: '임계치 추가' });
  await chooseOption(page, '항목 :', 'CPU 사용률');
  await thresholdDialog.getByLabel('경고 기준', { exact: true }).fill('81');
  await thresholdDialog.getByLabel('위험 기준', { exact: true }).fill('90');
  const thresholdPath = '/api/v1/projects/sample-a/instances/local-01/thresholds';
  await Promise.all([
    page.waitForResponse(
      (response) =>
        response.request().method() === 'PUT' &&
        new URL(response.url()).pathname === thresholdPath &&
        response.ok(),
    ),
    thresholdDialog.getByRole('button', { name: '등록', exact: true }).click(),
  ]);
  await expect(thresholdDialog).not.toBeVisible();
  const savedThresholds = await browserJson<InstanceThresholdSettings>(page, thresholdPath);
  expect(savedThresholds.metrics).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        metricKey: 'SYSTEM_CPU',
        warningValue: 0.81,
        criticalValue: 0.9,
        useDefault: false,
      }),
    ]),
  );
  await page.reload();
  await chooseOption(page, '인스턴스', '샘플 A 1');
  await page.getByRole('button', { name: 'CPU 사용률 수정' }).click();
  const savedThresholdDialog = page.getByRole('dialog', { name: '임계치 수정' });
  await expect(savedThresholdDialog.getByLabel('경고 기준', { exact: true })).toHaveValue('81');
  await expect(savedThresholdDialog.getByLabel('위험 기준', { exact: true })).toHaveValue('90');
  await savedThresholdDialog.getByRole('button', { name: '취소', exact: true }).click();

  await page.goto('/settings/certificates');
  await createCertificateTarget(page, tlsPort);
  await createCertificateTarget(page, tlsFailurePort);
  const targets = page.getByRole('table', { name: '인증서 대상 설정' });
  await expect(
    targets.getByRole('row', { name: new RegExp(`localhost.*${tlsPort}`) }),
  ).toBeVisible();
  await expect(
    targets.getByRole('row', { name: new RegExp(`localhost.*${tlsFailurePort}`) }),
  ).toBeVisible();
  const certificateRow = targets.getByRole('row', { name: new RegExp(`localhost.*${tlsPort}`) });
  const editCertificate = certificateRow.getByRole('button', { name: /^인증서 \d+ 수정$/ });
  const targetId = (await editCertificate.getAttribute('aria-label'))?.match(
    /^인증서 (\d+) 수정$/,
  )?.[1];
  expect(targetId).toBeTruthy();
  await editCertificate.click();
  const certificateDialog = page.getByRole('dialog', { name: '인증서 대상 수정' });
  await certificateDialog.getByLabel(`인증서 ${targetId} 점검 간격`).fill('2');
  await Promise.all([
    page.waitForResponse(
      (response) =>
        response.request().method() === 'PUT' &&
        response.url().endsWith(`/api/v1/certificates/${targetId}`) &&
        response.ok(),
    ),
    certificateDialog.getByRole('button', { name: `인증서 ${targetId} 저장` }).click(),
  ]);
  const certificates = await certificateRows(page);
  expect(
    certificates.find((item) => item.certificate_target_id === Number(targetId)),
  ).toMatchObject({ check_interval_minutes: 2 });
});

test('certificate success, failure, and rerun results persist through the real center', async ({
  page,
}) => {
  test.setTimeout(60_000);
  await login(page);
  const existingPorts = new Set((await certificateRows(page)).map((item) => item.port));
  if (!existingPorts.has(tlsPort) || !existingPorts.has(tlsFailurePort)) {
    await page.goto('/settings/certificates');
    if (!existingPorts.has(tlsPort)) await createCertificateTarget(page, tlsPort);
    if (!existingPorts.has(tlsFailurePort)) await createCertificateTarget(page, tlsFailurePort);
  }
  await page.goto('/certificates?project=');

  const successRow = page.getByRole('row', { name: new RegExp(`localhost:${tlsPort}`) });
  await successRow.getByRole('button', { name: '지금 확인' }).click();
  await expect
    .poll(async () => certificateByPort(page, tlsPort), {
      timeout: 10_000,
    })
    .toMatchObject({ status: 'UP', message: 'TLS_CHECK_SUCCEEDED' });
  await page.getByRole('button', { name: '상세 닫기' }).click();

  const failureRow = page.getByRole('row', { name: new RegExp(`localhost:${tlsFailurePort}`) });
  await failureRow.getByRole('button', { name: '지금 확인' }).click();
  await expect
    .poll(async () => certificateByPort(page, tlsFailurePort), {
      timeout: 10_000,
    })
    .toMatchObject({ status: 'DOWN', message: 'TLS_CONNECTION_FAILED', subject: null });
  await page.getByRole('button', { name: '상세 닫기' }).click();

  const beforeRerun = (await certificateByPort(page, tlsPort))?.checked_at;
  await successRow.getByRole('button', { name: '지금 확인' }).click();
  await expect
    .poll(async () => (await certificateByPort(page, tlsPort))?.checked_at, {
      timeout: 10_000,
    })
    .not.toBe(beforeRerun);

  await page.reload();
  await expect(
    page.getByRole('row', { name: new RegExp(`localhost:${tlsPort}.*정상`) }),
  ).toBeVisible();
  await expect(
    page.getByRole('row', { name: new RegExp(`localhost:${tlsFailurePort}.*장애`) }),
  ).toBeVisible();
});

test('cached detail data becomes a safe stale/error UI while PostgreSQL is down', async ({
  page,
}) => {
  test.setTimeout(90_000);
  await login(page);
  await page.goto('/projects/sample-a/instances/local-02');
  await expect(page.getByRole('table', { name: '디스크', exact: true })).toBeVisible();

  const control = JSON.parse(readFileSync(resolve(runDirectory, 'control.json'), 'utf8')) as {
    composeProject: string;
  };
  const stopped = spawnSync(
    'docker',
    ['compose', '-p', control.composeProject, 'stop', 'postgres'],
    { encoding: 'utf8' },
  );
  expect(stopped.status).toBe(0);
  try {
    await expect(page.getByText(/마지막 정상 데이터를 표시합니다/)).toBeVisible({
      timeout: 50_000,
    });
    await expect(page.getByRole('table', { name: '디스크', exact: true })).toBeVisible();
  } finally {
    const started = spawnSync(
      'docker',
      ['compose', '-p', control.composeProject, 'start', 'postgres'],
      { encoding: 'utf8' },
    );
    expect(started.status).toBe(0);
    await expect
      .poll(
        async () => {
          const response = await page.request.get('/actuator/health');
          return response.status();
        },
        { timeout: 30_000 },
      )
      .toBe(200);
  }
});

test('dashboard has no serious accessibility violations after the real flows', async ({ page }) => {
  await login(page);
  const result = await new AxeBuilder({ page }).analyze();
  expect(result.violations).toEqual([]);
});

test('project-limited viewer sees read-only UI and server denies privileged routes', async ({
  page,
}) => {
  await login(page);
  const viewerPassword = randomBytes(24).toString('hex');
  await page.goto('/settings/users');
  await page.getByRole('button', { name: '사용자 등록' }).click();
  const dialog = page.getByRole('dialog', { name: '사용자 등록' });
  await dialog.getByRole('textbox', { name: '계정 ID' }).fill('e2e-viewer');
  await dialog.getByLabel('비밀번호').fill(viewerPassword);
  await dialog.getByRole('checkbox', { name: '샘플 A (sample-a)' }).check();
  const created = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' &&
      new URL(response.url()).pathname === '/api/v1/settings/users',
  );
  await dialog.getByRole('button', { name: '저장' }).click();
  expect((await created).status()).toBe(201);
  await expect(dialog).not.toBeVisible();

  await page.context().clearCookies();
  await page.goto('/login');
  await page.getByRole('textbox', { name: '아이디' }).fill('e2e-viewer');
  await page.locator('input[name="password"]').fill(viewerPassword);
  await page.getByRole('button', { name: 'Login' }).click();
  await expect(page.getByRole('heading', { name: '종합 현황' })).toBeVisible();
  await expect(page.getByRole('combobox', { name: '프로젝트 선택' })).toBeVisible();
  await expect(page.getByRole('link', { name: /샘플 A \/ 샘플 A 1/ })).toBeVisible();
  await page.goto('/settings/projects');
  await expect(page.getByRole('button', { name: '프로젝트 등록' })).toHaveCount(0);
  await page.goto('/settings/instances');
  await expect(page.getByRole('alert')).toContainText(
    '조회 전용 계정입니다. 설정을 변경할 수 없습니다.',
  );
  await expect(page.getByRole('button', { name: '등록', exact: true })).toBeDisabled();
  const forbidden = await page.request.get('/api/v1/settings/users?page=0&size=50');
  expect(forbidden.status()).toBe(403);
});

async function assertDashboardLayout(page: Page) {
  await expect(page.getByRole('region', { name: /CPU 그래프/ })).toBeVisible();
  const layout = await page.evaluate(() => {
    const root = document.documentElement;
    const mainElement = document.querySelector('main')!;
    const main = mainElement.getBoundingClientRect();
    const tolerance = 1;
    // 사이드바 아이콘과 구분하여 본문 카드·차트의 경계 검증
    const boxes = ['.ant-card', '[role="region"][aria-label*="그래프"]', '[role="img"]']
      .flatMap((selector) => [...mainElement.querySelectorAll<HTMLElement>(selector)])
      .filter((element) => element.offsetParent !== null)
      .map((element) => {
        const box = element.getBoundingClientRect();
        return {
          selector: element.className || element.tagName,
          left: box.left,
          right: box.right,
          width: box.width,
          insideMain: box.left >= main.left - tolerance && box.right <= main.right + tolerance,
          insideViewport: box.left >= -tolerance && box.right <= innerWidth + tolerance,
        };
      });
    const unclipped = [
      ...document.querySelectorAll<HTMLElement>('[role="img"], .ant-card-head-title'),
    ]
      .filter((element) => element.offsetParent !== null)
      .every((element) => element.scrollWidth <= element.clientWidth + tolerance);
    const canvas = document.querySelector<HTMLElement>('.monitor-app-canvas')!;
    return {
      noDocumentOverflow: root.scrollWidth <= innerWidth,
      boxes,
      unclipped,
      canvasToBottom: canvas.getBoundingClientRect().bottom >= root.scrollHeight - tolerance,
      background: getComputedStyle(canvas).backgroundColor,
    };
  });
  expect(layout.noDocumentOverflow).toBe(true);
  expect(layout.boxes.length).toBeGreaterThanOrEqual(5);
  expect(
    layout.boxes.every((box) => box.insideMain && box.insideViewport),
    JSON.stringify(layout.boxes),
  ).toBe(true);
  expect(layout.unclipped).toBe(true);
  expect(layout.canvasToBottom).toBe(true);
  expect(layout.background).not.toBe('rgba(0, 0, 0, 0)');
}

async function assertFullPageCanvas(page: Page) {
  const canvas = await page.evaluate(() => {
    const documentHeight = document.documentElement.scrollHeight;
    const selectors = ['#root', '.monitor-app-canvas', 'main'];
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
  const fullHeightSelectors = new Set(['#root', '.monitor-app-canvas']);
  const fullHeightCanvas = canvas.filter(({ selector }) => fullHeightSelectors.has(selector));
  expect(
    fullHeightCanvas.every(({ height, documentHeight }) => height >= documentHeight - 1),
    JSON.stringify(fullHeightCanvas),
  ).toBe(true);
  expect(
    canvas.find(({ selector }) => selector === '.monitor-app-canvas')?.background,
    JSON.stringify(canvas),
  ).not.toBe('rgba(0, 0, 0, 0)');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}

async function createCertificateTarget(page: Page, port: number) {
  await page.getByRole('button', { name: '인증서 대상 등록' }).click();
  const dialog = page.getByRole('dialog', { name: '인증서 대상 등록' });
  await expect(dialog).toBeVisible();
  await chooseOption(page, '인증서 프로젝트', '샘플 A (sample-a)');
  await dialog.getByLabel('인증서 호스트').fill('localhost');
  await dialog.getByLabel('인증서 포트').fill(String(port));
  await dialog.getByLabel('SNI 호스트').fill('localhost');
  await Promise.all([
    page.waitForResponse(
      (response) =>
        response.request().method() === 'POST' &&
        response.url().endsWith('/api/v1/certificates') &&
        response.status() === 201,
    ),
    dialog.getByRole('button', { name: '인증서 대상 등록 확인' }).click(),
  ]);
  await expect(dialog).not.toBeVisible();
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
      (date_trunc('minute',now())-interval '22 minutes'+interval '10 seconds',
       'sample-a','local-01',0.11,256000000,32000000),
      (date_trunc('minute',now())-interval '11 minutes'+interval '10 seconds',
       'sample-a','local-01',0.2,256000000,32000000),
      (date_trunc('minute',now())-interval '2 minutes'+interval '10 seconds',
       'sample-a','local-01',0.2,256000000,32000000),
      (date_trunc('minute',now())-interval '1 minute'+interval '10 seconds',
       'sample-a','local-01',0.2,256000000,32000000)
    on conflict do nothing;
  `;
  const seeded = spawnSync(
    'docker',
    [
      'compose',
      '-p',
      control.composeProject,
      'exec',
      '-T',
      'postgres',
      'psql',
      '-U',
      'hermes',
      '-d',
      'hermes_monitor',
      '-v',
      'ON_ERROR_STOP=1',
      '-c',
      sql,
    ],
    { encoding: 'utf8' },
  );
  expect(seeded.status, `${seeded.stdout}\n${seeded.stderr}`).toBe(0);
}

async function certificateRows(
  page: Page,
): Promise<Array<CertificateRow & Record<string, unknown>>> {
  const response = await browserJson<{ items: Array<CertificateRow & Record<string, unknown>> }>(
    page,
    '/api/v1/certificates?page=0&size=200',
  );
  return response.items;
}

async function certificateByPort(page: Page, port: number) {
  return (await certificateRows(page)).find((item) => item.port === port);
}
