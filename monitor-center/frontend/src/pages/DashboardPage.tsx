// 전체 프로젝트 현황과 자원 추이 비교 화면
import { chartPeriods, type ChartPeriod } from '../utils/chartPeriod';
import { Alert, Button, FormSelect, FormSelectOption, Title } from '../components/ui';
import { useQueries, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { getDashboard, getResources } from '../api';
import type { DashboardProject, DashboardStatusCause, ResourceResponse } from '../generated';
import MetricChart, { metricSeriesStyle, type NamedMetricSeries } from '../components/MetricChart';
import ResourceUsage from '../components/ResourceUsage';
import ProjectOverview from '../components/ProjectOverview';
import ProjectComparison from '../components/ProjectComparison';
import ServiceOverview from '../components/ServiceOverview';
import ServiceInfoCard from '../components/ServiceInfoCard';
import { Empty, Failure, Loading } from '../components/QueryState';
import StatusLabel from '../components/StatusLabel';
import { LabeledField } from './settings/forms';
import { formatPercent } from '../utils/format';
import { checkFailure, checkName } from '../utils/checkPresentation';

export default function DashboardPage() {
  const [selectedProject, setSelectedProject] = useState('');
  const [period, setPeriod] = useState<ChartPeriod>('24h');
  const query = useQuery({
    queryKey: ['dashboard', period],
    queryFn: () => getDashboard(period),
    refetchInterval: 15_000,
  });
  if (query.isPending) {
    return <Loading />;
  }
  if (query.isError && !query.data) {
    return <Failure />;
  }
  const data = query.data!;
  const causes = data.status_causes ?? [];
  const instances = data.projects.flatMap((item) => item.instances);
  const collecting = instances.filter(
    (item) => (item.collection_status ?? item.status) === 'UP',
  ).length;
  const selected = data.projects.find((item) => item.project_id === selectedProject);
  const issues = causes.length > 0 && (
    <section className="issue-panel" aria-labelledby="cause-title">
      <Title headingLevel="h2" id="cause-title">
        확인 필요 <small>{causes.length}</small>
      </Title>
      <div className="issue-scroll" role="region" tabIndex={0} aria-label="상태 이상 목록">
        <ul className="issue-list">
          {causes.map((cause, index) => (
            <li
              className="issue-row"
              key={`${cause.project_id}-${cause.instance_id}-${cause.kind}-${cause.subject_id}-${index}`}
            >
              <span className="issue-category">{causeCategory(cause)}</span>
              <strong>
                {projectName(data, cause.project_id)}
                {cause.instance_id
                  ? ` / ${instanceName(data, cause.project_id, cause.instance_id)}`
                  : ''}
              </strong>
              <span className="issue-reason">{causeReason(cause)}</span>
              <time>{formatTime(cause.observed_at)}</time>
              <Link to={causeLink(cause)}>상세 보기</Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
  return (
    <>
      {query.isError && (
        <Alert variant="warning" title="갱신에 실패해 마지막 데이터를 표시합니다." />
      )}
      <div className="summary-bar" aria-label="전체 요약">
        <span className="summary-item">
          프로젝트{' '}
          <Link
            className="summary-number"
            to="/projects"
            aria-label={`프로젝트 ${data.projects.length}개 목록`}
          >
            <strong className="summary-value">{data.projects.length}</strong>
          </Link>
        </span>
        <span className="summary-item">
          수집 정상 서버{' '}
          <Link
            className="summary-number"
            to="/instances?collection=UP"
            aria-label={`수집 정상 서버 ${collecting}/${instances.length} 목록`}
          >
            <strong className="summary-value">
              {collecting}/{instances.length}
            </strong>
          </Link>
        </span>
        <span className="summary-item">
          실패 API{' '}
          <Link
            className="summary-number"
            to="/api-monitoring?status=DOWN&usage=used"
            aria-label={`실패 API ${data.failed_api_count}개 목록`}
          >
            <strong className={data.failed_api_count ? 'summary-value attention' : 'summary-value'}>
              {data.failed_api_count}
            </strong>
          </Link>
        </span>
        <span className="summary-item">
          만료 예정 인증서{' '}
          <Link
            className="summary-number"
            to="/certificates?expiry=soon"
            aria-label={`만료 예정 인증서 ${data.expiring_certificate_count}개 목록`}
          >
            <strong
              className={
                data.expiring_certificate_count ? 'summary-value attention' : 'summary-value'
              }
            >
              {data.expiring_certificate_count}
            </strong>
          </Link>
        </span>
      </div>
      {data.projects.length === 0 ? (
        <Empty>프로젝트와 인스턴스를 등록하면 상태와 자원 추이가 표시됩니다.</Empty>
      ) : (
        <>
          {!selected ? (
            <>
              <ProjectComparison
                projects={data.projects}
                history={data.history.resources}
                period={period}
                onPeriodChange={setPeriod}
              />
            </>
          ) : (
            <>
              <section className="monitor-toolbar" aria-label="프로젝트 관제 필터">
                <div>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setSelectedProject('')}
                    aria-label="전체 프로젝트 보기"
                  >
                    전체 보기
                  </Button>
                  <Title headingLevel="h2">선택 프로젝트 상세</Title>
                  <p>{selected.display_name}의 서버별 사용량과 추이를 표시합니다.</p>
                </div>
                <div className="monitor-filters">
                  <LabeledField id="monitor-period" label="조회 기간">
                    <FormSelect
                      id="monitor-period"
                      aria-label="관제 조회 기간"
                      value={period}
                      onChange={(_, next) => setPeriod(next as typeof period)}
                    >
                      {Object.entries(chartPeriods).map(([value, label]) => (
                        <FormSelectOption key={value} value={value} label={label} />
                      ))}
                    </FormSelect>
                  </LabeledField>
                </div>
              </section>
              <ProjectMonitor
                key={selected.project_id}
                project={selected}
                period={period}
                causes={causes}
              />
              {(data.service_balances ?? []).some(
                (check) => check.project_id === selected.project_id,
              ) && (
                <section className="service-balances" aria-label="선택 프로젝트 서비스 정보">
                  <Title headingLevel="h2">외부 서비스 정보</Title>
                  <p className="service-balances-help">
                    마지막 API 점검에서 조회한 값입니다. 화면 갱신과 API 실행 주기는 별개입니다.
                  </p>
                  <div className="service-balance-grid">
                    {(data.service_balances ?? [])
                      .filter((check) => check.project_id === selected.project_id)
                      .map((check) => (
                        <ServiceInfoCard
                          key={`${check.project_id}/${check.instance_id}/${check.check_id}`}
                          check={check}
                          action={
                            <Link
                              to={`/api-monitoring?${new URLSearchParams({ project: check.project_id, instance: check.instance_id, check: check.check_id })}`}
                            >
                              상세 · 다시 조회 →
                            </Link>
                          }
                        />
                      ))}
                  </div>
                </section>
              )}
            </>
          )}
          <div className={`dashboard-status-row${causes.length > 0 ? ' has-issues' : ''}`}>
            <ProjectOverview
              projects={data.projects}
              causes={causes}
              selectedProject={selected?.project_id ?? ''}
              onSelect={setSelectedProject}
            />
            {issues}
          </div>
          {!selected && <ServiceOverview checks={data.service_balances ?? []} />}
        </>
      )}
    </>
  );
}

function ProjectMonitor({
  project,
  period,
  causes,
}: {
  project: DashboardProject;
  period: ChartPeriod;
  causes: DashboardStatusCause[];
}) {
  const resourceQueries = useQueries({
    queries: project.instances.map((instance) => ({
      queryKey: ['resources', project.project_id, instance.instance_id, period] as const,
      queryFn: () => getResources(project.project_id, instance.instance_id, period),
      refetchInterval: 15_000,
      retry: false,
    })),
  });
  const resources = resourceQueries.map((query) => query.data);
  const series = resourceSeries(project, resources);
  const titleId = `monitor-${project.project_id}`;
  const chartContext = `${project.display_name} (${project.project_id})`;
  return (
    <section className="project-monitor" aria-labelledby={titleId}>
      <header className="project-monitor-header">
        <div>
          <Title headingLevel="h2" id={titleId}>
            {project.display_name}
          </Title>
          <StatusLabel status={project.status} context="overview" />
          <span>
            {project.instances.length}개 인스턴스 · {chartPeriods[period]}
          </span>
        </div>
        <Link to={`/projects/${project.project_id}`}>프로젝트 상세 →</Link>
      </header>
      {project.instances.length === 0 ? (
        <Empty>등록된 인스턴스가 없습니다.</Empty>
      ) : (
        <div className="project-monitor-layout">
          <ul
            className="monitor-instances"
            tabIndex={0}
            aria-label={`${project.display_name} 인스턴스 현황`}
          >
            {project.instances.map((instance, index) => {
              const query = resourceQueries[index];
              const resource = query.data;
              const latest = resource?.latest;
              const priorData = resource?.stale || (query.isError && Boolean(resource));
              const issues = causes.filter(
                (cause) =>
                  cause.project_id === project.project_id &&
                  cause.instance_id === instance.instance_id,
              );
              const collection = instance.collection_status ?? instance.status;
              return (
                <li
                  key={instance.instance_id}
                  className={`monitor-instance monitor-instance-${instance.status.toLowerCase()}`}
                >
                  <header>
                    <SeriesMark index={index} />
                    <Link to={`/projects/${project.project_id}/instances/${instance.instance_id}`}>
                      {instance.display_name}
                    </Link>
                    <StatusLabel status={instance.status} context="overview" />
                  </header>
                  <p className="monitor-instance-host">
                    {instance.instance_id}
                    {instance.host_name ? ` · ${instance.host_name}` : ''}
                  </p>
                  <div className="monitor-collection-state">
                    <StatusLabel status={collection} context="collection" />
                    <span>
                      {collection === 'UP'
                        ? '에이전트 응답·자원 수집 정상'
                        : '에이전트 응답과 최근 수집을 확인하세요.'}
                    </span>
                  </div>
                  {issues.length > 0 && (
                    <details className="monitor-check-issues" open>
                      <summary>
                        확인할 항목 {issues.length}건 <span>{issueCounts(issues)}</span>
                      </summary>
                      <ul>
                        {issues.map((cause, issueIndex) => (
                          <li key={`${cause.kind}-${cause.subject_id}-${issueIndex}`}>
                            <Link to={causeLink(cause)}>
                              <small>{causeCategory(cause)}</small>
                              <strong>{causeSubject(cause)}</strong>
                            </Link>
                            <p>{causeReason(cause, false)}</p>
                          </li>
                        ))}
                      </ul>
                    </details>
                  )}
                  <p
                    className={
                      priorData || query.isError
                        ? 'monitor-data-state attention'
                        : 'monitor-data-state'
                    }
                  >
                    {query.isPending
                      ? '자원 불러오는 중'
                      : !resource
                        ? '자원 조회 실패'
                        : !Object.keys(latest ?? {}).length
                          ? '자원 미수집'
                          : priorData
                            ? '마지막 정상 데이터'
                            : '최근 수집'}
                    {resource && (
                      <time
                        dateTime={latest?.central_received_at ?? instance.last_seen_at ?? undefined}
                      >
                        {formatTime(latest?.central_received_at ?? instance.last_seen_at)}
                      </time>
                    )}
                  </p>
                  {resource && (
                    <div className="monitor-resource-grid">
                      <ResourceUsage
                        label="시스템 CPU"
                        used={latest?.system_cpu_ratio}
                        total={1}
                        unit="ratio"
                      />
                      <ResourceUsage
                        label="RAM (물리 메모리)"
                        used={latest?.physical_memory_used_bytes}
                        total={latest?.physical_memory_total_bytes}
                        capacityLabel="전체 RAM"
                      />
                      <ResourceUsage
                        label="JVM Heap"
                        used={latest?.heap_used_bytes}
                        total={latest?.heap_max_bytes}
                        capacityLabel="최대 힙"
                      />
                      {(resource.disks ?? []).map((disk) => (
                        <ResourceUsage
                          key={disk.path_id}
                          label={`디스크 · ${disk.path_display}`}
                          used={disk.used_bytes}
                          total={disk.total_bytes}
                          capacityLabel="전체 볼륨"
                        />
                      ))}
                      {!resource.disks?.length && (
                        <p className="monitor-no-disk">디스크 수집 데이터 없음</p>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
          <div className="monitor-trends">
            <p className="monitor-trend-note">
              CPU·RAM·Heap 선 색상은 왼쪽 인스턴스와 동일합니다. 디스크는 경로별 범례를 확인하세요.
            </p>
            {resourceQueries.every((query) => query.isPending) ? (
              <Loading />
            ) : resourceQueries.every((query) => query.isError && !query.data) ? (
              <Failure message="프로젝트 자원을 불러오지 못했습니다." />
            ) : (
              <div className="chart-grid monitor-chart-grid">
                <MetricChart
                  context={chartContext}
                  title="시스템 CPU"
                  points={[]}
                  series={series.cpu}
                  xKey="sampled_at"
                  yKey="value"
                  unit="ratio"
                />
                <MetricChart
                  context={chartContext}
                  title="RAM 사용률"
                  points={[]}
                  series={series.ram}
                  xKey="sampled_at"
                  yKey="value"
                  unit="ratio"
                />
                <MetricChart
                  context={chartContext}
                  title="JVM Heap 사용률"
                  points={[]}
                  series={series.heap}
                  xKey="sampled_at"
                  yKey="value"
                  unit="ratio"
                />
                <MetricChart
                  context={chartContext}
                  title="디스크 사용률"
                  points={[]}
                  series={series.disk}
                  xKey="sampled_at"
                  yKey="value"
                  unit="ratio"
                  summary={
                    series.disk.length > 0 ? (
                      <ul
                        className="monitor-disk-legend"
                        aria-label={`${project.display_name} 디스크 범례`}
                      >
                        {series.disk.map((disk) => (
                          <li key={disk.name}>
                            <SeriesMark index={disk.styleIndex!} />
                            <span>{disk.name}</span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="monitor-no-disk">디스크 수집 데이터 없음</p>
                    )
                  }
                />
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

function SeriesMark({ index }: { index: number }) {
  const style = metricSeriesStyle(index);
  return (
    <span
      className="series-mark"
      style={{ borderColor: style.color, borderStyle: style.borderStyle }}
      aria-hidden="true"
    />
  );
}

function resourceSeries(project: DashboardProject, resources: Array<ResourceResponse | undefined>) {
  const series: Record<'cpu' | 'ram' | 'heap' | 'disk', NamedMetricSeries[]> = {
    cpu: [],
    ram: [],
    heap: [],
    disk: [],
  };
  project.instances.forEach((instance, index) => {
    const resource = resources[index];
    const name = `${instance.display_name} (${instance.instance_id})`;
    const history = resource?.history ?? [];
    series.cpu.push({
      name,
      styleIndex: index,
      points: history.map((point) => ({
        sampled_at: point.sampled_at,
        value: safeNumber(point.system_cpu_ratio),
      })),
    });
    series.ram.push({
      name,
      styleIndex: index,
      points: history.map((point) => ({
        sampled_at: point.sampled_at,
        value: safeRatio(point.physical_memory_used_bytes, point.physical_memory_total_bytes),
      })),
    });
    series.heap.push({
      name,
      styleIndex: index,
      points: history.map((point) => ({
        sampled_at: point.sampled_at,
        value: safeRatio(point.heap_used_bytes, point.heap_max_bytes),
      })),
    });
    // 경로 합산 시 같은 디스크가 중복 계산될 수 있어 볼륨별로 표시
    const paths = new Map((resource?.disks ?? []).map((disk) => [disk.path_id, disk.path_display]));
    for (const point of resource?.disk_history ?? []) {
      if (!paths.has(point.path_id)) {
        paths.set(point.path_id, point.path_id);
      }
    }
    for (const [pathId, display] of paths) {
      series.disk.push({
        name: `${name} · ${display}`,
        styleIndex: series.disk.length,
        points: (resource?.disk_history ?? [])
          .filter((point) => point.path_id === pathId)
          .map((point) => ({
            sampled_at: point.sampled_at,
            value: safeRatio(point.used_bytes, point.total_bytes),
          })),
      });
    }
  });
  return series;
}

function safeNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}
function safeRatio(used: number | null | undefined, total: number | null | undefined) {
  return safeNumber(used) != null && safeNumber(total) != null && total! > 0
    ? used! / total!
    : null;
}
function causeReason(cause: DashboardStatusCause, includeSubject = true) {
  const metricNames: Record<string, string> = {
    SYSTEM_CPU: '시스템 CPU',
    JVM_HEAP: 'JVM Heap',
    PHYSICAL_MEMORY: '물리 메모리',
    DISK: '디스크',
    DB_POOL: 'DB 풀',
    CERTIFICATE_DAYS: '인증서 잔여일',
  };
  if (cause.kind === 'CERTIFICATE' && cause.result_code) {
    return `${cause.subject_name ?? '인증서'} · ${resultCode(cause.result_code)}`;
  }
  if (cause.kind === 'METRIC' || cause.kind === 'CERTIFICATE') {
    const value =
      cause.metric_key === 'CERTIFICATE_DAYS'
        ? `${cause.value}일`
        : formatPercent(cause.value ?? null);
    const warn =
      cause.metric_key === 'CERTIFICATE_DAYS'
        ? `${cause.warning_value}일`
        : formatPercent(cause.warning_value ?? null);
    const critical =
      cause.metric_key === 'CERTIFICATE_DAYS'
        ? `${cause.critical_value}일`
        : formatPercent(cause.critical_value ?? null);
    return `${metricNames[cause.metric_key ?? ''] ?? '지표'} ${value} (경고 ${warn}, 위험 ${critical})${cause.subject_name ? ` · ${cause.subject_name}` : ''}`;
  }
  if (cause.kind === 'CHECK') {
    const subject = includeSubject ? `${causeSubject(cause)} · ` : '';
    if (
      cause.check_category === 'API' &&
      cause.metric_key === 'API_LATENCY_MS' &&
      cause.value != null &&
      (!cause.result_code || cause.result_code === 'HTTP_ASSERTIONS_PASSED')
    ) {
      return `${includeSubject ? `${causeSubject(cause)} ` : ''}${cause.value}ms (경고 ${cause.warning_value}ms, 위험 ${cause.critical_value}ms)`;
    }
    return subject + resultCode(cause.result_code, cause.subject_id ?? '', true);
  }
  if (cause.kind === 'CLOCK_SKEW') {
    return '에이전트와 서버 시간 차이 감지';
  }
  if (cause.kind === 'PARTIAL_COLLECTION') {
    return '일부 항목 수집 실패';
  }
  if (cause.status === 'UNKNOWN') {
    return '아직 수집되지 않음';
  }
  if (!cause.result_code) {
    return cause.status === 'DOWN'
      ? '마지막 수집 이후 허용 시간 초과'
      : '수집이 일시적으로 지연되거나 누락됨';
  }
  return cause.status === 'DOWN'
    ? `수집 중단 · ${resultCode(cause.result_code)}`
    : `수집 일시 실패 · ${resultCode(cause.result_code)}`;
}
function resultCode(code?: string | null, checkId = '', isCheck = false) {
  const known: Record<string, string> = {
    ADDRESS_NOT_ALLOWED: '허용되지 않은 주소',
    ALLOWLIST_CONFIG_ERROR: '접속 허용 목록 설정 오류',
    AUTH_ERROR: '에이전트 인증 실패',
    REDIRECT_REJECTED: '리디렉션 거부',
    AGENT_TIMEOUT: '응답 시간 초과',
    AGENT_HTTP_ERROR: '에이전트 HTTP 오류',
    IDENTITY_MISMATCH: '에이전트 식별 불일치',
    TLS_ERROR: 'TLS 연결 실패',
    DNS_ERROR: '호스트 이름 확인 실패',
    CONNECTION_ERROR: '연결 실패',
    TIMEOUT: '응답 시간 초과',
    CONNECTION_REFUSED: '연결 거부',
    HTTP_ERROR: 'HTTP 오류',
    AUTH_FAILED: '인증 실패',
    API_CHECK_ERROR: 'API 점검 실패',
    CERT_CHAIN_INVALID: '인증서 체인 오류',
    CERT_HOSTNAME_INVALID: '호스트 이름 불일치',
    CERT_SHA1_DETECTED: 'SHA-1 서명 감지',
    TLS_CHECK_FAILED: 'TLS 점검 실패',
  };
  return isCheck
    ? (code && known[code]) || checkFailure(code, checkId)
    : code
      ? (known[code] ?? '수집 결과 확인 필요')
      : '원인 코드 없음';
}
function causeCategory(cause: DashboardStatusCause) {
  return cause.kind === 'CHECK'
    ? cause.check_category === 'API'
      ? 'API 점검'
      : '내부 점검'
    : cause.kind === 'CERTIFICATE'
      ? 'SSL 인증서'
      : cause.kind === 'METRIC'
        ? '자원 사용량'
        : '서버 수집';
}
function causeSubject(cause: DashboardStatusCause) {
  return cause.kind === 'CHECK'
    ? checkName({ check_id: cause.subject_id ?? '', name: cause.subject_name ?? '점검' })
    : (cause.subject_name ?? causeCategory(cause));
}
function issueCounts(causes: DashboardStatusCause[]) {
  return [...new Set(causes.map(causeCategory))]
    .map(
      (category) =>
        `${category} ${causes.filter((cause) => causeCategory(cause) === category).length}`,
    )
    .join(' · ');
}
function causeLink(cause: DashboardStatusCause) {
  return cause.kind === 'CHECK' && cause.check_category === 'API'
    ? '/api-monitoring'
    : cause.instance_id
      ? `/projects/${cause.project_id}/instances/${cause.instance_id}${cause.kind === 'CHECK' ? '?tab=internal-checks' : ''}`
      : cause.kind === 'CERTIFICATE'
        ? '/certificates'
        : `/projects/${cause.project_id}`;
}
function projectName(
  data: { projects: Array<{ project_id: string; display_name: string }> },
  id: string,
) {
  return data.projects.find((item) => item.project_id === id)?.display_name ?? id;
}
function instanceName(
  data: {
    projects: Array<{
      project_id: string;
      instances: Array<{ instance_id: string; display_name: string }>;
    }>;
  },
  projectId: string,
  instanceId: string,
) {
  return (
    data.projects
      .find((item) => item.project_id === projectId)
      ?.instances.find((item) => item.instance_id === instanceId)?.display_name ?? instanceId
  );
}
function formatTime(value?: string | null) {
  return value ? new Date(value).toLocaleString('ko-KR') : '시각 미수집';
}
