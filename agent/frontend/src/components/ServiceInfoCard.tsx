// 외부 서비스의 잔여량 및 응답 지표 표시
import type { ReactNode } from 'react';
import type { ApiCheck } from '../api';
import type { ServiceMetric } from '../generated';
import { Label } from './ui';

export default function ServiceInfoCard({
  check,
  action,
  showServer = true,
}: {
  check: ApiCheck;
  action?: ReactNode;
  showServer?: boolean;
}) {
  const info = check.service_info;
  if (!info) {
    return null;
  }
  const unused = check.monitoring_enabled === false;
  const color = unused
    ? 'grey'
    : info.status === 'DOWN'
      ? 'red'
      : info.status === 'WARN'
        ? 'orange'
        : info.status === 'UP'
          ? 'green'
          : 'grey';
  const label = unused
    ? '미사용 · 마지막 기록'
    : info.status === 'DOWN'
      ? '정보 위험'
      : info.status === 'WARN'
        ? '정보 경고'
        : info.status === 'UP'
          ? '정보 정상'
          : '정보 미확인';
  return (
    <section
      className="service-balance-card"
      aria-label={`서비스 정보 · ${info.title} · ${check.project_name ?? check.project_id} / ${check.instance_name ?? check.instance_id}`}
    >
      <header>
        <div>
          <h3>{info.title}</h3>
          {showServer && (
            <p>
              {check.project_name ?? check.project_id} / {check.instance_name ?? check.instance_id}
            </p>
          )}
        </div>
        <Label color={color}>{label}</Label>
      </header>
      <dl className="service-info-metrics">
        {info.metrics.slice(0, 4).map((metric) => (
          <Metric key={metric.key} metric={metric} unused={unused} />
        ))}
      </dl>
      {info.metrics.length > 4 && (
        <details className="service-info-more">
          <summary>추가 항목 {info.metrics.length - 4}개 보기</summary>
          <dl className="service-info-metrics">
            {info.metrics.slice(4).map((metric) => (
              <Metric key={metric.key} metric={metric} unused={unused} />
            ))}
          </dl>
        </details>
      )}
      <p className="service-balance-note">{info.description}</p>
      <p className="service-balance-note">
        {info.metrics.length}개 항목 중 {info.collected}개 수집 · 정보 경고는 표시 항목의 기준이며
        API 요청 상태와 별도로 표시합니다.
      </p>
      <footer>
        <span>
          마지막 조회{' '}
          <time dateTime={check.checked_at ?? undefined}>
            {check.checked_at ? new Date(check.checked_at).toLocaleString('ko-KR') : '기록 없음'}
          </time>
        </span>
        {action}
      </footer>
    </section>
  );
}

function Metric({ metric, unused }: { metric: ServiceMetric; unused: boolean }) {
  const color =
    unused || metric.status === 'UNKNOWN'
      ? 'grey'
      : metric.status === 'DOWN'
        ? 'red'
        : metric.status === 'WARN'
          ? 'orange'
          : undefined;
  const label =
    metric.status === 'DOWN' ? '위험 기준' : metric.status === 'WARN' ? '경고 기준' : '미수집';
  const format = (value: number) => value.toLocaleString('ko-KR', { maximumFractionDigits: 4 });
  const value =
    metric.value == null
      ? '미수집'
      : typeof metric.value === 'number'
        ? Number.isFinite(metric.value)
          ? format(metric.value)
          : '미수집'
        : typeof metric.value === 'boolean'
          ? metric.value
            ? '예'
            : '아니요'
          : metric.value;
  return (
    <div className="service-info-metric">
      <dt>{metric.label}</dt>
      <dd>
        {value}
        {value !== '미수집' && metric.unit && (
          <span className="service-info-unit">{metric.unit}</span>
        )}
      </dd>
      {color && <Label color={color}>{unused ? '마지막 기록' : label}</Label>}
      {(metric.warning != null || metric.critical != null) && (
        <small>
          {metric.warning != null &&
            `경고 ${format(metric.warning)}${metric.unit} ${metric.direction === 'HIGH' ? '이상' : '이하'}`}
          {metric.warning != null && metric.critical != null && ' · '}
          {metric.critical != null &&
            `위험 ${format(metric.critical)}${metric.unit} ${metric.direction === 'HIGH' ? '이상' : '이하'}`}
        </small>
      )}
    </div>
  );
}
