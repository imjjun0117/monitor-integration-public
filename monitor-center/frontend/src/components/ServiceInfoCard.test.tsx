import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, expect, test } from 'vitest';
import { Check, Status, ServiceMetric, type ServiceInfo } from '../generated';
import type { ApiCheck } from '../api';
import ServiceInfoCard from './ServiceInfoCard';

afterEach(cleanup);
const base: ApiCheck = {
  project_id: 'different-project',
  instance_id: 'prod',
  check_id: 'different-vendor',
  name: '외부 API',
  category: Check.category.API,
  direction: 'EXTERNAL',
  status: Status.UP,
  duration_ms: 20,
  result_code: null,
  message: null,
  checked_at: '2026-10-03T12:00:00Z',
  history: [],
};
const metric = (
  key: string,
  value: number | boolean | string | null,
  status = Status.UP,
): ServiceMetric => ({
  key,
  label: key,
  value,
  status,
  kind: ServiceMetric.kind.NUMBER,
  unit: '건',
  direction: ServiceMetric.direction.LOW,
  warning: null,
  critical: null,
});
const info = (metrics: ServiceMetric[], status = Status.UP): ServiceInfo => ({
  title: '다른 문자 업체',
  description: '업체별 실제 응답에서 읽은 값',
  dashboard: true,
  status,
  collected: metrics.filter((item) => item.value != null).length,
  metrics,
});

test('renders another provider without check ID or project-specific branches', () => {
  render(
    <ServiceInfoCard
      check={{ ...base, service_info: info([metric('잔여 건수', 37), metric('실제 잔액', 0)]) }}
    />,
  );
  expect(screen.getByRole('heading', { name: '다른 문자 업체' })).toBeVisible();
  expect(screen.getByText('정보 정상')).toBeVisible();
  expect(screen.getByText('잔여 건수').closest('div')).toHaveTextContent('37건');
  expect(screen.getByText('실제 잔액').closest('div')).toHaveTextContent('0건');
  expect(screen.getByText('different-project / prod')).toBeVisible();
});
test('uncollected values and false booleans are not silently converted to zero', () => {
  render(
    <ServiceInfoCard
      check={{
        ...base,
        service_info: info(
          [
            metric('잔액', null, Status.UNKNOWN),
            { ...metric('자동 충전', false), unit: '', kind: ServiceMetric.kind.BOOLEAN },
          ],
          Status.UNKNOWN,
        ),
      }}
    />,
  );
  expect(screen.getByText('정보 미확인')).toBeVisible();
  expect(screen.getByText('잔액').closest('div')).toHaveTextContent('미수집');
  expect(screen.getByText('자동 충전').closest('div')).toHaveTextContent('아니요');
  expect(screen.queryByText('0건')).toBeNull();
});
test('information thresholds are distinct from API connectivity and retain unused history', () => {
  const check = {
    ...base,
    service_info: info([{ ...metric('잔여량', 0, Status.DOWN), critical: 0 }], Status.DOWN),
  };
  const view = render(<ServiceInfoCard check={check} />);
  expect(screen.getByText('정보 위험')).toBeVisible();
  expect(screen.getByText(/위험 0건 이하/)).toBeVisible();
  expect(screen.queryByText('API 장애')).toBeNull();
  view.rerender(<ServiceInfoCard check={{ ...check, monitoring_enabled: false }} />);
  expect(screen.getByText('미사용 · 마지막 기록')).toBeVisible();
});
test('extra metrics can be expanded and server strings are rendered as inert text', () => {
  render(
    <ServiceInfoCard
      check={{
        ...base,
        service_info: info([
          metric('a', 1),
          metric('b', 2),
          metric('c', 3),
          metric('d', 4),
          {
            ...metric('담당 서비스', '<script>bad()</script>'),
            kind: ServiceMetric.kind.TEXT,
            unit: '',
          },
        ]),
      }}
    />,
  );
  fireEvent.click(screen.getByText('추가 항목 1개 보기'));
  expect(screen.getByText('<script>bad()</script>')).toBeVisible();
  expect(document.querySelector('script')).toBeNull();
  expect(
    within(screen.getByText('추가 항목 1개 보기').closest('details')!).getByText('담당 서비스'),
  ).toBeVisible();
});
