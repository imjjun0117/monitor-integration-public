// 인스턴스 자원·점검·로그 조회 화면
import { chartPeriods, liveWindowMs, type ChartPeriod } from '../utils/chartPeriod';
import { Alert, Button, Card, Select, Space, Tabs, Tag, Typography } from 'antd';
import { ProDescriptions, ProTable } from '@ant-design/pro-components';
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

import TransportPanel from '../components/TransportPanel';
import InstanceThresholdSettings from './settings/InstanceThresholdSettings';
import CollectorEvents from '../components/CollectorEvents';
import XlogOverview from '../components/XlogOverview';

type TabKey =
  | 'resources'
  | 'db-pools'
  | 'internal-checks'
  | 'logs'
  | 'xlog'
  | 'log-history'
  | 'thresholds';

export default function InstanceDetailPage() {
  const { projectId = '', instanceId = '' } = useParams();
  const [search, setSearch] = useSearchParams();
  const current = (search.get('tab') ?? 'resources') as TabKey;
  const { canWrite } = usePermissions();
  return (
    <>
      <PageBackLink to={`/projects/${projectId}`}>{`${projectId} 인스턴스 목록으로`}</PageBackLink>
      <TransportPanel projectId={projectId} instanceId={instanceId} />
      <Tabs
        activeKey={current}
        onChange={(key) => setSearch({ tab: key })}
        items={[
          {
            key: 'resources',
            label: 'JVM·서버 자원',
            children: current === 'resources' && (
              <Resources projectId={projectId} instanceId={instanceId} />
            ),
          },
          {
            key: 'thresholds',
            label: '임계치 관리',
            children: current === 'thresholds' && (
              <InstanceThresholdSettings
                key={`${projectId}/${instanceId}`}
                projectId={projectId}
                instanceId={instanceId}
              />
            ),
          },
          {
            key: 'db-pools',
            label: 'DB Pool',
            children: current === 'db-pools' && (
              <Pools projectId={projectId} instanceId={instanceId} />
            ),
          },
          {
            key: 'internal-checks',
            label: '내부 점검',
            children: current === 'internal-checks' && (
              <Checks projectId={projectId} instanceId={instanceId} />
            ),
          },
          {
            key: 'xlog',
            label: 'XLog',
            children: current === 'xlog' && (
              <XlogOverview project={projectId} instance={instanceId} detailed />
            ),
          },
          ...(canWrite
            ? [
                {
                  key: 'log-history',
                  label: '저장된 로그',
                  children: current === 'log-history' && (
                    <CollectorEvents projectId={projectId} instanceId={instanceId} kind="LOG" />
                  ),
                },
                {
                  key: 'logs',
                  label: '실시간 로그',
                  children: current === 'logs' && (
                    <LogPanel projectId={projectId} instanceId={instanceId} />
                  ),
                },
              ]
            : []),
        ]}
      />
    </>
  );
}

function Resources({ projectId, instanceId }: { projectId: string; instanceId: string }) {
  const [period, setPeriod] = useState<ChartPeriod>('15m');
  const query = useQuery({
    queryKey: ['resources', projectId, instanceId, period],
    queryFn: () => getResources(projectId, instanceId, period),
    refetchInterval: liveWindowMs(period) ? 5_000 : 15_000,
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
      <div className="period-field">
        <label htmlFor="resource-period">조회 기간</label>
        <Select
          id="resource-period"
          aria-label="조회 기간"
          value={period}
          onChange={(value) => setPeriod(value as ChartPeriod)}
          options={Object.entries(chartPeriods).map(([value, label]) => ({ value, label }))}
        />
      </div>
      <div className="chart-grid">
        <MetricChart
          key={`cpu/${period}`}
          liveWindow={liveWindowMs(period)}
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
          key={`ram/${period}`}
          liveWindow={liveWindowMs(period)}
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
          key={`heap/${period}`}
          liveWindow={liveWindowMs(period)}
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
            key={`${disk.path_id}/${period}`}
            liveWindow={liveWindowMs(period)}
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
      <Card title="디스크 상세">
        <ProTable<(typeof data.disks)[number]>
          aria-label="디스크"
          rowKey="path_id"
          columns={[
            { title: '경로', dataIndex: 'path_display' },
            { title: '사용', render: (_, disk) => formatBytes(disk.used_bytes) },
            { title: '전체', render: (_, disk) => formatBytes(disk.total_bytes) },
            { title: '상태', render: (_, disk) => <StatusLabel status={disk.status} /> },
          ]}
          dataSource={data.disks}
          search={false}
          options={false}
          pagination={false}
          scroll={{ x: 'max-content' }}
        />
      </Card>
      <ProDescriptions
        title="JVM 실행 정보"
        column={2}
        dataSource={latest}
        columns={[
          { title: 'PID', render: () => formatCount(latest.pid) },
          {
            title: 'JVM 시작',
            render: () =>
              latest.jvm_start_time
                ? new Date(latest.jvm_start_time).toLocaleString('ko-KR')
                : '미지원',
          },
          { title: '가동시간', render: () => formatDuration(latest.uptime_ms) },
          { title: '프로세스 CPU', render: () => formatPercent(latest.process_cpu_ratio) },
          { title: 'Non-Heap', render: () => formatBytes(latest.non_heap_used_bytes) },
          {
            title: 'Threads Live/Peak',
            render: () =>
              `${formatCount(latest.thread_live_count)} / ${formatCount(latest.thread_peak_count)}`,
          },
          {
            title: 'GC Count/Time',
            render: () => `${formatCount(latest.gc_count)} / ${formatDuration(latest.gc_time_ms)}`,
          },
        ]}
      />
    </div>
  );
}

function Pools({ projectId, instanceId }: { projectId: string; instanceId: string }) {
  const [period, setPeriod] = useState<ChartPeriod>('15m');
  const query = useQuery({
    queryKey: ['pools', projectId, instanceId, period],
    queryFn: () => getDbPools(projectId, instanceId, period),
    refetchInterval: liveWindowMs(period) ? 5_000 : 15_000,
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
      <div className="period-field">
        <label htmlFor="pool-period">조회 기간</label>
        <Select
          id="pool-period"
          aria-label="DB Pool 조회 기간"
          value={period}
          onChange={(value) => setPeriod(value as ChartPeriod)}
          options={Object.entries(chartPeriods).map(([value, label]) => ({ value, label }))}
        />
      </div>
      <ProTable<(typeof data.items)[number]>
        aria-label="DB Pool"
        rowKey="pool_id"
        columns={[
          { title: 'Pool', dataIndex: 'name' },
          { title: 'Active', render: (_, pool) => formatCount(pool.active) },
          { title: 'Idle', render: (_, pool) => formatCount(pool.idle) },
          { title: 'Max', render: (_, pool) => formatCount(pool.max_size) },
          { title: 'Min Idle', render: (_, pool) => formatCount(pool.min_idle) },
          { title: 'Waiters', render: (_, pool) => formatCount(pool.waiters) },
          { title: 'Max Wait', render: (_, pool) => formatDuration(pool.max_wait_ms) },
          { title: '검증 지연', render: (_, pool) => formatDuration(pool.validation_latency_ms) },
          { title: '상태', render: (_, pool) => <StatusLabel status={pool.status} /> },
        ]}
        dataSource={data.items}
        search={false}
        options={false}
        pagination={false}
        scroll={{ x: 'max-content' }}
      />
      <div className="chart-grid">
        <MetricChart
          key={`pool-active/${period}`}
          liveWindow={liveWindowMs(period)}
          title="DB Pool Active"
          points={data.history}
          xKey="sampled_at"
          yKey="active"
        />
        <MetricChart
          key={`pool-idle/${period}`}
          liveWindow={liveWindowMs(period)}
          title="DB Pool Idle"
          points={data.history}
          xKey="sampled_at"
          yKey="idle"
        />
        <MetricChart
          key={`pool-max/${period}`}
          liveWindow={liveWindowMs(period)}
          title="DB Pool Max"
          points={data.history}
          xKey="sampled_at"
          yKey="max_size"
        />
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
        <label htmlFor="internal-check-usage">사용 여부</label>
        <Select
          id="internal-check-usage"
          aria-label="내부 점검 사용 여부 필터"
          value={usage}
          onChange={setUsage}
          options={[
            { value: '', label: '전체 점검' },
            { value: 'used', label: '사용 점검' },
            { value: 'unused', label: '미사용 점검' },
          ]}
        />
      </div>
      {query.isPending ? (
        <Loading />
      ) : query.isError && !query.data ? (
        <Failure />
      ) : items.length === 0 ? (
        <Empty />
      ) : (
        <ProTable<ApiCheck>
          aria-label="내부 점검"
          rowKey="check_id"
          columns={[
            { title: '점검', render: (_, check) => checkName(check) },
            {
              title: '현재 상태 / 자동 실행',
              render: (_, check) => (
                <Space wrap>
                  {check.monitoring_enabled === false ? (
                    <Tag>미사용</Tag>
                  ) : (
                    <StatusLabel status={check.status} />
                  )}
                  <Typography.Text type="secondary">{scheduleLabel(check)}</Typography.Text>
                </Space>
              ),
            },
            { title: '응답시간', render: (_, check) => `${metric(check.duration_ms)} ms` },
            {
              title: '최근 점검',
              render: (_, check) =>
                check.checked_at ? new Date(check.checked_at).toLocaleString() : '미수집',
            },
            { title: '마지막 결과', render: (_, check) => checkOutcome(check) },
            {
              title: '관리 / 실행',
              render: (_, check) => (
                <InternalCheckActions
                  check={check}
                  projectId={projectId}
                  instanceId={instanceId}
                  refetch={query.refetch}
                />
              ),
            },
          ]}
          dataSource={items}
          search={false}
          options={false}
          pagination={false}
          scroll={{ x: 'max-content' }}
        />
      )}
    </>
  );
}

function InternalCheckActions({
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
  const { canWrite } = usePermissions();
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
    <Space wrap>
      <CheckSettingsButton check={check} />
      {canWrite && (
        <>
          <Button
            aria-label={`${name} ${check.monitoring_enabled === false ? '사용으로 전환' : '미사용으로 전환'}`}
            loading={usage.isPending}
            disabled={usage.isPending}
            onClick={() => usage.mutate()}
          >
            {check.monitoring_enabled === false ? '사용 재개' : '사용 중지'}
          </Button>
          <Button
            aria-label={`${name} 즉시 점검`}
            loading={rerun.isPending}
            disabled={polling.isPolling || check.monitoring_enabled === false || usage.isPending}
            onClick={() => rerun.mutate()}
          >
            지금 점검
          </Button>
        </>
      )}
      {usage.isError && <Alert type="error" message="사용 여부를 저장하지 못했습니다." />}
      {polling.isPolling && <span role="status">결과 대기 중 (최대 15초)</span>}
      {polling.didTimeOut && <span role="status">새 결과가 아직 도착하지 않았습니다.</span>}
      {rerun.isError && <span role="alert">점검 요청에 실패했습니다.</span>}
    </Space>
  );
}

function metric(value: unknown) {
  return value == null ? '미지원' : String(value);
}
function percent(value: unknown) {
  return typeof value === 'number' ? `${Math.round(value * 100)}%` : '미지원';
}
