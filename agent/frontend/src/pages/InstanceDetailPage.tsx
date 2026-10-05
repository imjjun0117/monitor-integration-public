// 인스턴스 자원·점검·로그 조회 화면
import { chartPeriods, type ChartPeriod } from '../utils/chartPeriod';
import {
  Button,
  Label,
  Alert,
  FormSelect,
  FormSelectOption,
  Tab,
  Tabs,
  TabTitleText,
  Title,
} from '../components/ui';
import { Table, Tbody, Td, Th, Thead, Tr } from '../components/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams, useSearchParams } from 'react-router-dom';
import {
  getDbPools,
  getInternalChecks,
  getResources,
  runApiCheck,
  saveApiCheckUsage,
  type ApiCheck,
} from '../api';
import CheckSettingsButton from '../components/CheckSettingsButton';
import { checkName, checkOutcome, scheduleLabel } from '../utils/checkPresentation';
import { LabeledField } from './settings/forms';
import MetricChart from '../components/MetricChart';
import ResourceUsage from '../components/ResourceUsage';
import PageBackLink from '../components/PageBackLink';
import { Empty, Failure, Loading, Stale } from '../components/QueryState';
import StatusLabel from '../components/StatusLabel';
import { useMemo, useState } from 'react';
import { formatBytes, formatCount, formatDuration, formatPercent } from '../utils/format';
import { useManualRerunPolling } from '../hooks/useManualRerunPolling';
import LogPanel from '../components/LogPanel';
import { usePermissions } from '../components/PermissionContext';

type TabKey = 'resources' | 'db-pools' | 'internal-checks' | 'logs';

export default function InstanceDetailPage() {
  const { projectId = '', instanceId = '' } = useParams();
  const [search, setSearch] = useSearchParams();
  const current = (search.get('tab') ?? 'resources') as TabKey;
  const { canWrite } = usePermissions();
  return (
    <>
      <PageBackLink to={`/projects/${projectId}`}>{`${projectId} 인스턴스 목록으로`}</PageBackLink>
      <Tabs activeKey={current} onSelect={(_, key) => setSearch({ tab: String(key) })}>
        <Tab eventKey="resources" title={<TabTitleText>JVM·서버 자원</TabTitleText>}>
          {current === 'resources' && <Resources projectId={projectId} instanceId={instanceId} />}
        </Tab>
        <Tab eventKey="db-pools" title={<TabTitleText>DB Pool</TabTitleText>}>
          {current === 'db-pools' && <Pools projectId={projectId} instanceId={instanceId} />}
        </Tab>
        <Tab eventKey="internal-checks" title={<TabTitleText>내부 점검</TabTitleText>}>
          {current === 'internal-checks' && (
            <Checks projectId={projectId} instanceId={instanceId} />
          )}
        </Tab>
        {canWrite && (
          <Tab eventKey="logs" title={<TabTitleText>실시간 로그</TabTitleText>}>
            {current === 'logs' && <LogPanel projectId={projectId} instanceId={instanceId} />}
          </Tab>
        )}
      </Tabs>
    </>
  );
}

function Resources({ projectId, instanceId }: { projectId: string; instanceId: string }) {
  const [period, setPeriod] = useState<ChartPeriod>('24h');
  const query = useQuery({
    queryKey: ['resources', projectId, instanceId, period],
    queryFn: () => getResources(projectId, instanceId, period),
    refetchInterval: 15_000,
    retry: false,
  });
  const diskSeries = useMemo(() => {
    const grouped = new Map<string, NonNullable<typeof query.data>['disk_history']>();
    for (const point of query.data?.disk_history ?? []) {
      const existing = grouped.get(point.path_id) ?? [];
      existing.push(point);
      grouped.set(point.path_id, existing);
    }
    return grouped;
  }, [query.data?.disk_history]);
  if (query.isPending) {
    return <Loading />;
  }
  if (query.isError && !query.data) {
    return <Failure />;
  }
  const data = query.data!;
  const latest = data.latest;
  return (
    <div className="resource-detail">
      <Stale visible={data.stale || query.isError} />
      <div className="period-field field">
        <label className="field-label" htmlFor="resource-period">
          조회 기간
        </label>
        <FormSelect
          id="resource-period"
          aria-label="조회 기간"
          value={period}
          onChange={(_, value) => setPeriod(value as ChartPeriod)}
        >
          {Object.entries(chartPeriods).map(([value, label]) => (
            <FormSelectOption key={value} value={value} label={label} />
          ))}
        </FormSelect>
      </div>
      <div className="chart-grid">
        <MetricChart
          title="시스템 CPU"
          points={data.history}
          xKey="sampled_at"
          yKey="system_cpu_ratio"
          unit="ratio"
          summary={
            <ResourceUsage
              used={latest.system_cpu_ratio}
              total={1}
              unit="ratio"
              valueLabel="시스템 CPU 값"
            />
          }
        />
        <MetricChart
          title="물리 메모리 사용량"
          points={data.history}
          xKey="sampled_at"
          yKey="physical_memory_used_bytes"
          unit="bytes"
          capacity={latest.physical_memory_total_bytes}
          summary={
            <ResourceUsage
              used={latest.physical_memory_used_bytes}
              total={latest.physical_memory_total_bytes}
              capacityLabel="서버 RAM 전체"
              valueLabel="물리 메모리 값"
            />
          }
        />
        <MetricChart
          title="JVM Heap 사용량"
          points={data.history}
          xKey="sampled_at"
          yKey="heap_used_bytes"
          unit="bytes"
          capacity={latest.heap_max_bytes}
          summary={
            <ResourceUsage
              used={latest.heap_used_bytes}
              total={latest.heap_max_bytes}
              capacityLabel="JVM 최대 힙"
              valueLabel="JVM Heap 값"
            />
          }
        />
        {data.disks.map((disk) => (
          <MetricChart
            key={disk.path_id}
            title={
              disk.path_id === 'application'
                ? '웹앱 디스크'
                : disk.path_display.includes('첨부파일')
                  ? '첨부파일 디스크'
                  : '디스크 사용량'
            }
            points={diskSeries.get(disk.path_id) ?? []}
            xKey="sampled_at"
            yKey="used_bytes"
            unit="bytes"
            capacity={disk.total_bytes}
            summary={
              <ResourceUsage
                used={disk.used_bytes}
                total={disk.total_bytes}
                capacityLabel={`전체 디스크 · ${disk.path_display}`}
              />
            }
          />
        ))}
      </div>
      <Title headingLevel="h2" className="resource-section-title">
        디스크 상세
      </Title>
      <div className="resource-overflow">
        <Table variant="compact" aria-label="디스크">
          <Thead>
            <Tr>
              <Th>경로</Th>
              <Th>사용</Th>
              <Th>전체</Th>
              <Th>상태</Th>
            </Tr>
          </Thead>
          <Tbody>
            {data.disks.map((disk) => (
              <Tr key={disk.path_id}>
                <Td>{disk.path_display}</Td>
                <Td>{formatBytes(disk.used_bytes)}</Td>
                <Td>{formatBytes(disk.total_bytes)}</Td>
                <Td>
                  <StatusLabel status={disk.status} />
                </Td>
              </Tr>
            ))}
          </Tbody>
        </Table>
      </div>
      <Title headingLevel="h2" className="resource-section-title">
        JVM 실행 정보
      </Title>
      <dl>
        <dt>PID</dt>
        <dd>{formatCount(latest.pid)}</dd>
        <dt>JVM 시작</dt>
        <dd>
          {latest.jvm_start_time
            ? new Date(latest.jvm_start_time).toLocaleString('ko-KR')
            : '미지원'}
        </dd>
        <dt>가동시간</dt>
        <dd>{formatDuration(latest.uptime_ms)}</dd>
        <dt>프로세스 CPU</dt>
        <dd>{formatPercent(latest.process_cpu_ratio)}</dd>
        <dt>Non-Heap</dt>
        <dd>{formatBytes(latest.non_heap_used_bytes)}</dd>
        <dt>Threads Live/Peak</dt>
        <dd>
          {formatCount(latest.thread_live_count)} / {formatCount(latest.thread_peak_count)}
        </dd>
        <dt>GC Count/Time</dt>
        <dd>
          {formatCount(latest.gc_count)} / {formatDuration(latest.gc_time_ms)}
        </dd>
      </dl>
    </div>
  );
}

function Pools({ projectId, instanceId }: { projectId: string; instanceId: string }) {
  const [period, setPeriod] = useState<ChartPeriod>('24h');
  const query = useQuery({
    queryKey: ['pools', projectId, instanceId, period],
    queryFn: () => getDbPools(projectId, instanceId, period),
    refetchInterval: 15_000,
    retry: false,
  });
  if (query.isPending) {
    return <Loading />;
  }
  if (query.isError && !query.data) {
    return <Failure />;
  }
  const data = query.data!;
  if (data.items.length === 0) {
    return <Empty>DB Pool 수집이 지원되지 않습니다.</Empty>;
  }
  return (
    <div className="resource-detail">
      <Stale visible={data.stale || query.isError} />
      <div className="period-field field">
        <label className="field-label" htmlFor="pool-period">
          조회 기간
        </label>
        <FormSelect
          id="pool-period"
          aria-label="DB Pool 조회 기간"
          value={period}
          onChange={(_, value) => setPeriod(value as ChartPeriod)}
        >
          {Object.entries(chartPeriods).map(([value, label]) => (
            <FormSelectOption key={value} value={value} label={label} />
          ))}
        </FormSelect>
      </div>
      <div className="resource-overflow">
        <Table variant="compact" aria-label="DB Pool">
          <Thead>
            <Tr>
              <Th>Pool</Th>
              <Th>Active</Th>
              <Th>Idle</Th>
              <Th>Max</Th>
              <Th>Min Idle</Th>
              <Th>Waiters</Th>
              <Th>Max Wait</Th>
              <Th>검증 지연</Th>
              <Th>상태</Th>
            </Tr>
          </Thead>
          <Tbody>
            {data.items.map((pool) => (
              <Tr key={pool.pool_id}>
                <Td>{pool.name}</Td>
                <Td>{formatCount(pool.active)}</Td>
                <Td>{formatCount(pool.idle)}</Td>
                <Td>{formatCount(pool.max_size)}</Td>
                <Td>{formatCount(pool.min_idle)}</Td>
                <Td>{formatCount(pool.waiters)}</Td>
                <Td>{formatDuration(pool.max_wait_ms)}</Td>
                <Td>{formatDuration(pool.validation_latency_ms)}</Td>
                <Td>
                  <StatusLabel status={pool.status} />
                </Td>
              </Tr>
            ))}
          </Tbody>
        </Table>
      </div>
      <div className="chart-grid">
        <MetricChart title="DB Pool Active" points={data.history} xKey="sampled_at" yKey="active" />
        <MetricChart title="DB Pool Idle" points={data.history} xKey="sampled_at" yKey="idle" />
        <MetricChart title="DB Pool Max" points={data.history} xKey="sampled_at" yKey="max_size" />
      </div>
    </div>
  );
}

function Checks({ projectId, instanceId }: { projectId: string; instanceId: string }) {
  const [usage, setUsage] = useState('');
  const query = useQuery({
    queryKey: ['internal-checks', projectId, instanceId, usage],
    queryFn: () => getInternalChecks(projectId, instanceId, usage),
    refetchInterval: 15_000,
  });
  const items = query.data?.items ?? [];
  return (
    <>
      <p className="api-page-help">
        DB·폴더·배치·검색 등 이 서버에 필요한 항목을 확인합니다. 미사용은 점검과 상태 집계에서
        제외하며, 점검 설정에서 자동 실행 여부와 주기를 정할 수 있습니다.
      </p>
      <div className="internal-check-filter">
        <LabeledField id="internal-check-usage" label="사용 여부">
          <FormSelect
            id="internal-check-usage"
            aria-label="내부 점검 사용 여부 필터"
            value={usage}
            onChange={(_, value) => setUsage(value)}
          >
            <FormSelectOption value="" label="전체 점검" />
            <FormSelectOption value="used" label="사용 점검" />
            <FormSelectOption value="unused" label="미사용 점검" />
          </FormSelect>
        </LabeledField>
      </div>
      {query.isPending ? (
        <Loading />
      ) : query.isError && !query.data ? (
        <Failure />
      ) : items.length === 0 ? (
        <Empty />
      ) : (
        <Table variant="compact" className="internal-check-table" aria-label="내부 점검">
          <Thead>
            <Tr>
              <Th>점검</Th>
              <Th>현재 상태 / 자동 실행</Th>
              <Th>응답시간</Th>
              <Th>최근 점검</Th>
              <Th>마지막 결과</Th>
              <Th>관리 / 실행</Th>
            </Tr>
          </Thead>
          <Tbody>
            {items.map((check) => (
              <InternalCheckRow
                key={check.check_id}
                check={check}
                projectId={projectId}
                instanceId={instanceId}
                refetch={query.refetch}
              />
            ))}
          </Tbody>
        </Table>
      )}
    </>
  );
}

function InternalCheckRow({
  check,
  projectId,
  instanceId,
  refetch,
}: {
  check: ApiCheck;
  projectId: string;
  instanceId: string;
  refetch: () => Promise<unknown>;
}) {
  const polling = useManualRerunPolling(check.checked_at, refetch);
  const client = useQueryClient();
  const usage = useMutation({
    mutationFn: () => saveApiCheckUsage(check, check.monitoring_enabled === false),
    onSuccess: async () => {
      polling.reset();
      await Promise.all(
        ['internal-checks', 'dashboard', 'projects', 'instances', 'resources'].map((key) =>
          client.invalidateQueries({ queryKey: [key] }),
        ),
      );
    },
  });
  const rerun = useMutation({
    mutationFn: () => runApiCheck(projectId, instanceId, check.check_id),
    onSuccess: () => {
      polling.start();
      void refetch();
    },
  });
  const name = checkName(check);
  return (
    <Tr>
      <Td>{name}</Td>
      <Td>
        {check.monitoring_enabled === false ? (
          <Label color="grey">미사용</Label>
        ) : (
          <StatusLabel status={check.status} />
        )}
        <small>{scheduleLabel(check)}</small>
      </Td>
      <Td>{metric(check.duration_ms)} ms</Td>
      <Td>{check.checked_at ? new Date(check.checked_at).toLocaleString() : '미수집'}</Td>
      <Td>{checkOutcome(check)}</Td>
      <Td>
        <div className="internal-check-action check-row-actions">
          <CheckSettingsButton check={check} />
          <Button
            permission="write"
            variant="secondary"
            size="sm"
            aria-label={`${name} ${check.monitoring_enabled === false ? '사용으로 전환' : '미사용으로 전환'}`}
            isLoading={usage.isPending}
            onClick={() => usage.mutate()}
          >
            {check.monitoring_enabled === false ? '사용 재개' : '사용 중지'}
          </Button>
          <Button
            permission="write"
            variant="secondary"
            size="sm"
            aria-label={`${name} 즉시 점검`}
            isLoading={rerun.isPending}
            isDisabled={polling.isPolling || check.monitoring_enabled === false || usage.isPending}
            onClick={() => rerun.mutate()}
          >
            지금 점검
          </Button>
          {usage.isError && <Alert variant="danger" title="사용 여부를 저장하지 못했습니다." />}
          {polling.isPolling && <span role="status">결과 대기 중 (최대 15초)</span>}
          {polling.didTimeOut && <span role="status">새 결과가 아직 도착하지 않았습니다.</span>}
          {rerun.isError && <span role="alert">점검 요청에 실패했습니다.</span>}
        </div>
      </Td>
    </Tr>
  );
}

function metric(value: unknown) {
  return value == null ? '미지원' : String(value);
}
function percent(value: unknown) {
  return typeof value === 'number' ? `${Math.round(value * 100)}%` : '미지원';
}
