// 선택 프로젝트·인스턴스의 상태와 자원 차트 표시
import { chartPeriods, liveWindowMs, type ChartPeriod } from '../utils/chartPeriod';
import { Alert, FormSelect, FormSelectOption, Title } from '../components/ui';
import { useQuery } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import { getDashboard, getResources } from '../api';
import type { DashboardProject, DashboardStatusCause, ResourceResponse } from '../generated';
import MetricChart, { type NamedMetricSeries } from '../components/MetricChart';
import ResourceUsage from '../components/ResourceUsage';
import ServiceInfoCard from '../components/ServiceInfoCard';
import { Empty, Failure, Loading } from '../components/QueryState';
import StatusLabel from '../components/StatusLabel';
import { formatPercent } from '../utils/format';
import { checkFailure, checkName } from '../utils/checkPresentation';
import { useProjectScope } from '../components/ProjectScope';
import InstanceScope from '../components/InstanceScope';
import XlogOverview from '../components/XlogOverview';
import { usePermissions } from '../components/PermissionContext';

export default function DashboardPage() {
  const { project } = useProjectScope();
  const [params, setParams] = useSearchParams();
  const instance = params.get('instance') ?? '';
  const requestedPeriod = params.get('period') ?? '15m';
  const period: ChartPeriod = Object.hasOwn(chartPeriods, requestedPeriod)
    ? (requestedPeriod as ChartPeriod)
    : '15m';
  const permissions = usePermissions();
  const query = useQuery({
    queryKey: ['dashboard', period, project, instance],
    queryFn: () => getDashboard(period, project, instance),
    enabled: Boolean(project && instance),
    refetchInterval: liveWindowMs(period) ? 5_000 : 15_000,
  });
  const filters = (
    <div className="dashboard-scope-toolbar" aria-label="대시보드 조회 범위">
      <InstanceScope
        key={project}
        project={project}
        instance={instance}
        defaultFirst
        onChange={(value) => {
          params.set('project', project);
          params.set('instance', value);
          setParams(params, { replace: true });
        }}
      />
      <div className="dashboard-period-select">
        <FormSelect
          aria-label="관제 조회 기간"
          value={period}
          onChange={(_, value) => {
            params.set('period', value);
            setParams(params);
          }}
        >
          {Object.entries(chartPeriods).map(([value, label]) => (
            <FormSelectOption key={value} value={value} label={label} />
          ))}
        </FormSelect>
      </div>
    </div>
  );
  if (!project || !instance) {
    return (
      <>
        {filters}
        <Empty>프로젝트와 인스턴스를 선택하세요.</Empty>
      </>
    );
  }
  if (query.isPending) {
    return (
      <>
        {filters}
        <Loading />
      </>
    );
  }
  if (!query.data) {
    return (
      <>
        {filters}
        <Failure />
      </>
    );
  }
  const data = query.data;
  const selectedProject = data.projects.find((item) => item.project_id === project);
  const selectedInstance = selectedProject?.instances.find((item) => item.instance_id === instance);
  const causes = (data.status_causes ?? []).filter(
    (cause) =>
      cause.project_id === project && (!cause.instance_id || cause.instance_id === instance),
  );
  const balances = (data.service_balances ?? []).filter(
    (item) => item.project_id === project && item.instance_id === instance,
  );
  const scope = new URLSearchParams({ project, instance });
  return (
    <>
      {filters}
      {query.isError && (
        <Alert variant="warning" title="갱신에 실패해 마지막 데이터를 표시합니다." />
      )}
      <div className="summary-bar" aria-label="선택 인스턴스 요약">
        <span className="summary-item">
          수집 상태{' '}
          <StatusLabel
            status={selectedInstance?.collection_status ?? selectedInstance?.status}
            context="collection"
          />
        </span>
        <span className="summary-item">
          실패 API{' '}
          <Link
            className="summary-number"
            aria-label={`실패 API ${data.failed_api_count}개 목록`}
            to={`/api-monitoring?${scope}&status=DOWN&usage=used`}
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
            aria-label={`만료 예정 인증서 ${data.expiring_certificate_count}개 목록`}
            to={`/certificates?${scope}&expiry=soon`}
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
        <span className="summary-item">
          확인 필요{' '}
          <strong className={causes.length ? 'summary-value attention' : 'summary-value'}>
            {causes.length}
          </strong>
        </span>
      </div>
      {selectedProject && selectedInstance ? (
        <InstanceDashboard
          key={`${project}/${instance}/${period}`}
          project={{ ...selectedProject, instances: [selectedInstance] }}
          period={period}
          showXlog={
            permissions.isAdmin ||
            Boolean(permissions.menus?.some((menu) => menu.menuId === 'xlog' && menu.canRead))
          }
        />
      ) : (
        <Empty>선택한 인스턴스의 정보가 없습니다.</Empty>
      )}
      {(causes.length > 0 || balances.length > 0) && (
        <div className="dashboard-status-row has-issues">
          {balances.length > 0 && (
            <section className="service-balances" aria-label="선택 프로젝트 서비스 정보">
              <Title headingLevel="h2">외부 서비스 정보</Title>
              <div className="service-balance-grid">
                {balances.map((check) => (
                  <ServiceInfoCard
                    key={check.check_id}
                    check={check}
                    action={
                      <Link
                        to={`/api-monitoring?${scope}&check=${encodeURIComponent(check.check_id)}`}
                      >
                        요청 기록 →
                      </Link>
                    }
                  />
                ))}
              </div>
            </section>
          )}
          {causes.length > 0 && (
            <section className="issue-panel" aria-labelledby="cause-title">
              <Title headingLevel="h2" id="cause-title">
                확인 필요 <small>{causes.length}</small>
              </Title>
              <div className="issue-scroll" role="region" tabIndex={0} aria-label="상태 이상 목록">
                <ul className="issue-list">
                  {causes.map((cause, index) => (
                    <li className="issue-row" key={`${cause.kind}-${cause.subject_id}-${index}`}>
                      <span className="issue-category">{causeCategory(cause)}</span>
                      <strong>{causeSubject(cause)}</strong>
                      <span className="issue-reason">{causeReason(cause)}</span>
                      <time>{formatTime(cause.observed_at)}</time>
                      <Link to={causeLink(cause)}>확인 →</Link>
                    </li>
                  ))}
                </ul>
              </div>
            </section>
          )}
        </div>
      )}
    </>
  );
}

function InstanceDashboard({
  project,
  period,
  showXlog,
}: {
  project: DashboardProject;
  period: ChartPeriod;
  showXlog: boolean;
}) {
  const instance = project.instances[0];
  const query = useQuery({
    queryKey: ['resources', project.project_id, instance.instance_id, period],
    queryFn: () => getResources(project.project_id, instance.instance_id, period),
    refetchInterval: liveWindowMs(period) ? 5_000 : 15_000,
    retry: false,
  });
  const resource = query.data;
  const latest = resource?.latest;
  const series = resourceSeries(project, [resource]);
  const context = `${project.display_name} / ${instance.display_name}`;
  return (
    <section className="instance-dashboard" aria-label={context}>
      <div className="instance-dashboard-heading">
        <Link to={`/projects/${project.project_id}/instances/${instance.instance_id}`}>
          {context}
        </Link>
        <StatusLabel status={instance.status} context="overview" />
        <time>{formatTime(latest?.central_received_at ?? instance.last_seen_at)}</time>
      </div>
      {(resource?.stale || query.isError) && (
        <Alert variant="warning" title="마지막 정상 자원 데이터를 표시합니다." />
      )}
      {query.isPending ? (
        <Loading />
      ) : !resource ? (
        <Failure message="인스턴스 자원을 불러오지 못했습니다." />
      ) : (
        <div className="chart-grid instance-chart-grid">
          <MetricChart
            liveWindow={liveWindowMs(period)}
            context={context}
            title="CPU"
            points={[]}
            series={series.cpu}
            xKey="sampled_at"
            yKey="value"
            unit="ratio"
            summary={
              <ResourceUsage
                capacityLabel="CPU"
                used={latest?.system_cpu_ratio}
                total={1}
                unit="ratio"
              />
            }
          />
          <MetricChart
            liveWindow={liveWindowMs(period)}
            context={context}
            title="RAM"
            points={[]}
            series={series.ram}
            xKey="sampled_at"
            yKey="value"
            unit="ratio"
            summary={
              <ResourceUsage
                used={latest?.physical_memory_used_bytes}
                total={latest?.physical_memory_total_bytes}
                capacityLabel="전체 RAM"
              />
            }
          />
          {showXlog && (
            <XlogOverview compact project={project.project_id} instance={instance.instance_id} />
          )}
          <MetricChart
            liveWindow={liveWindowMs(period)}
            context={context}
            title="JVM Heap"
            points={[]}
            series={series.heap}
            xKey="sampled_at"
            yKey="value"
            unit="ratio"
            summary={
              <ResourceUsage
                used={latest?.heap_used_bytes}
                total={latest?.heap_max_bytes}
                capacityLabel="최대 힙"
              />
            }
          />
          <MetricChart
            liveWindow={liveWindowMs(period)}
            context={context}
            title="디스크"
            points={[]}
            series={series.disk}
            xKey="sampled_at"
            yKey="value"
            unit="ratio"
            summary={
              <div className="dashboard-disk-usage">
                {(resource.disks ?? []).map((disk) => (
                  <ResourceUsage
                    key={disk.path_id}
                    label={disk.path_display}
                    used={disk.used_bytes}
                    total={disk.total_bytes}
                    capacityLabel="전체 볼륨"
                  />
                ))}
              </div>
            }
          />
        </div>
      )}
    </section>
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
    return 'Collector와 서버 시간 차이 감지';
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
    AUTH_ERROR: 'Collector 인증 실패',
    REDIRECT_REJECTED: '리디렉션 거부',
    AGENT_TIMEOUT: '응답 시간 초과',
    AGENT_HTTP_ERROR: 'Collector HTTP 오류',
    IDENTITY_MISMATCH: 'Collector 식별 불일치',
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
function causeLink(cause: DashboardStatusCause) {
  return cause.kind === 'CHECK' && cause.check_category === 'API'
    ? '/api-monitoring'
    : cause.instance_id
      ? `/projects/${cause.project_id}/instances/${cause.instance_id}${cause.kind === 'CHECK' ? '?tab=internal-checks' : ''}`
      : cause.kind === 'CERTIFICATE'
        ? '/certificates'
        : `/projects/${cause.project_id}`;
}
function formatTime(value?: string | null) {
  return value ? new Date(value).toLocaleString('ko-KR') : '시각 미수집';
}
