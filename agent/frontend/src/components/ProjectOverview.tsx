// 프로젝트 요약과 확인할 항목 표시
import { ProTable, type ProColumns } from '@ant-design/pro-components';
import { Button, Card, Empty, Input, Progress, Select, Space, Typography } from 'antd';
import { useState } from 'react';
import type { DashboardInstance, DashboardProject, DashboardStatusCause } from '../generated';
import StatusLabel from './StatusLabel';
import { formatPercent } from '../utils/format';

const severity = ['DOWN', 'WARN', 'UNKNOWN', 'UP'];
const pageSize = 20;
const metrics = [
  { key: 'system_cpu_ratio', label: 'CPU' },
  { key: 'physical_memory_ratio', label: 'RAM' },
  { key: 'heap_ratio', label: 'JVM Heap' },
  { key: 'disk_ratio', label: '디스크' },
] as const;
type MetricKey = (typeof metrics)[number]['key'];
type OverviewRow = {
  project: DashboardProject;
  peaks: Record<MetricKey, ReturnType<typeof peak>>;
  issues: DashboardStatusCause[];
};

export default function ProjectOverview({
  projects,
  causes,
  selectedProject,
  onSelect,
}: {
  projects: DashboardProject[];
  causes: DashboardStatusCause[];
  selectedProject: string;
  onSelect: (id: string) => void;
}) {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [sort, setSort] = useState('severity');
  const [page, setPage] = useState(0);
  const searchTerm = search.trim().toLocaleLowerCase();
  const rows: OverviewRow[] = projects
    .map((project) => ({
      project,
      peaks: Object.fromEntries(
        metrics.map((metric) => [metric.key, peak(project.instances, metric.key)]),
      ) as OverviewRow['peaks'],
      issues: causes.filter((cause) => cause.project_id === project.project_id),
    }))
    .filter(
      ({ project, issues }) =>
        (!status ||
          (status === 'attention'
            ? project.status !== 'UP' || issues.length > 0
            : project.status === status)) &&
        (!searchTerm ||
          [
            project.project_id,
            project.display_name,
            ...project.instances.flatMap((instance) => [
              instance.instance_id,
              instance.display_name,
              instance.host_name,
            ]),
          ].some((value) => value?.toLocaleLowerCase().includes(searchTerm))),
    )
    .sort(
      (a, b) =>
        (sort === 'severity'
          ? severity.indexOf(a.project.status) - severity.indexOf(b.project.status)
          : sort === 'name'
            ? 0
            : (b.peaks[sort as MetricKey]?.value ?? -1) -
              (a.peaks[sort as MetricKey]?.value ?? -1)) ||
        a.project.display_name.localeCompare(b.project.display_name, 'ko-KR') ||
        a.project.project_id.localeCompare(b.project.project_id),
    );
  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));
  const activePage = Math.min(page, pageCount - 1);
  const visible = rows.slice(activePage * pageSize, (activePage + 1) * pageSize);
  const columns: ProColumns<OverviewRow>[] = [
    {
      title: '프로젝트 / 상태',
      render: (_, { project }) => (
        <Space>
          <Button
            type="link"
            aria-label={`${project.display_name} 자원 보기`}
            aria-pressed={project.project_id === selectedProject}
            onClick={() => onSelect(project.project_id)}
          >
            <strong>{project.display_name}</strong> <small>{project.project_id}</small>
          </Button>
          <StatusLabel status={project.status} context="overview" />
        </Space>
      ),
    },
    {
      title: '수집 정상 서버',
      render: (_, { project }) =>
        `${project.instances.filter((instance) => (instance.collection_status ?? instance.status) === 'UP').length}/${project.instances.length}`,
    },
    ...metrics.map(
      (metric): ProColumns<OverviewRow> => ({
        title: metric.label,
        render: (_, { project, peaks }) => {
          const highest = peaks[metric.key];
          if (!highest) {
            return '미수집/미지원';
          }
          return (
            <div
              title={`${highest.instance.display_name} · ${highest.count}/${project.instances.length}개 인스턴스 수집`}
            >
              <Progress percent={Math.min(100, highest.value * 100)} showInfo={false} />
              <span
                role="meter"
                aria-label={`${project.display_name} ${metric.label} 최고 사용률`}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.min(100, highest.value * 100)}
                aria-valuetext={`${formatPercent(highest.value)}, ${highest.count}/${project.instances.length}개 인스턴스 수집`}
              >
                {formatPercent(highest.value)}
              </span>
              {highest.count < project.instances.length && <small>일부 미수집/미지원</small>}
            </div>
          );
        },
      }),
    ),
    {
      title: '내부 점검 이상',
      render: (_, { issues }) =>
        issues.filter((cause) => cause.kind === 'CHECK' && cause.check_category === 'INTERNAL')
          .length,
    },
    {
      title: 'API 이상',
      render: (_, { issues }) =>
        issues.filter((cause) => cause.kind === 'CHECK' && cause.check_category === 'API').length,
    },
    {
      title: '인증서 이상',
      render: (_, { issues }) => issues.filter((cause) => cause.kind === 'CERTIFICATE').length,
    },
  ];
  return (
    <Card
      title={<Typography.Title level={4}>전체 프로젝트 관제</Typography.Title>}
      extra={`${rows.length}/${projects.length}개 프로젝트`}
    >
      <p>
        모든 프로젝트의 현재 상태와 최고 사용률을 비교합니다. 프로젝트를 선택하면 서버별 상세를
        확인할 수 있습니다.
      </p>
      <Space wrap>
        <label htmlFor="overview-search">검색</label>
        <Input
          id="overview-search"
          aria-label="프로젝트 검색"
          placeholder="프로젝트 · 인스턴스 · 호스트"
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            setPage(0);
          }}
        />
        <label htmlFor="overview-status">상태</label>
        <Select
          id="overview-status"
          aria-label="프로젝트 상태 필터"
          value={status}
          onChange={(value) => {
            setStatus(value);
            setPage(0);
          }}
          options={[
            { value: '', label: '전체 상태' },
            { value: 'attention', label: '확인 필요' },
            { value: 'DOWN', label: '문제 발생' },
            { value: 'WARN', label: '주의 필요' },
            { value: 'UNKNOWN', label: '미수집' },
            { value: 'UP', label: '정상' },
          ]}
        />
        <label htmlFor="overview-sort">정렬</label>
        <Select
          id="overview-sort"
          aria-label="프로젝트 정렬"
          value={sort}
          onChange={(value) => {
            setSort(value);
            setPage(0);
          }}
          options={[
            { value: 'severity', label: '확인 필요 우선' },
            { value: 'name', label: '프로젝트 이름' },
            ...metrics.map((metric) => ({
              value: metric.key,
              label: `${metric.label} 사용률 높은 순`,
            })),
          ]}
        />
      </Space>
      <div role="region" tabIndex={0} aria-label="전체 프로젝트 자원 비교">
        <ProTable<OverviewRow>
          aria-label="프로젝트 상태와 자원 사용률 비교"
          rowKey={({ project }) => project.project_id}
          columns={columns}
          dataSource={visible}
          search={false}
          options={false}
          pagination={false}
          scroll={{ x: 'max-content' }}
          locale={{ emptyText: <Empty description="검색 조건에 맞는 프로젝트가 없습니다." /> }}
        />
      </div>
      <Space aria-label="프로젝트 페이지 이동">
        <span>
          {rows.length
            ? `${activePage * pageSize + 1}–${Math.min((activePage + 1) * pageSize, rows.length)}`
            : '0'}{' '}
          / {rows.length}개
        </span>
        <Button
          aria-label="이전 프로젝트 페이지"
          disabled={activePage === 0}
          onClick={() => setPage(activePage - 1)}
        >
          이전
        </Button>
        <span>
          {activePage + 1} / {pageCount}
        </span>
        <Button
          aria-label="다음 프로젝트 페이지"
          disabled={activePage >= pageCount - 1}
          onClick={() => setPage(activePage + 1)}
        >
          다음
        </Button>
      </Space>
    </Card>
  );
}

function peak(instances: DashboardInstance[], key: MetricKey) {
  const valid = instances.flatMap((instance) => {
    const value = instance[key];
    return typeof value === 'number' && Number.isFinite(value) && value >= 0
      ? [{ value, instance }]
      : [];
  });
  const highest = valid.sort((a, b) => b.value - a.value)[0];
  return highest ? { ...highest, count: valid.length } : null;
}
