// 프로젝트 요약과 확인할 항목 표시
import { Button, FormSelect, FormSelectOption, TextInput, Title, Table } from './ui';
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
  const rows = projects
    .map((project) => ({
      project,
      peaks: Object.fromEntries(
        metrics.map((metric) => [metric.key, peak(project.instances, metric.key)]),
      ) as Record<MetricKey, ReturnType<typeof peak>>,
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
  return (
    <section className="project-overview" aria-labelledby="project-overview-title">
      <div className="project-overview-heading">
        <div>
          <Title headingLevel="h2" id="project-overview-title">
            전체 프로젝트 관제
          </Title>
          <p>
            모든 프로젝트의 현재 상태와 최고 사용률을 비교합니다. 프로젝트를 선택하면 서버별 상세를
            확인할 수 있습니다.
          </p>
        </div>
        <span>
          {rows.length}/{projects.length}개 프로젝트
        </span>
      </div>
      <div className="project-overview-filters">
        <div className="field">
          <label className="field-label" htmlFor="overview-search">
            검색
          </label>
          <TextInput
            id="overview-search"
            aria-label="프로젝트 검색"
            placeholder="프로젝트 · 인스턴스 · 호스트"
            value={search}
            onChange={(_, value) => {
              setSearch(value);
              setPage(0);
            }}
          />
        </div>
        <div className="field">
          <label className="field-label" htmlFor="overview-status">
            상태
          </label>
          <FormSelect
            id="overview-status"
            aria-label="프로젝트 상태 필터"
            value={status}
            onChange={(_, value) => {
              setStatus(value);
              setPage(0);
            }}
          >
            <FormSelectOption value="" label="전체 상태" />
            <FormSelectOption value="attention" label="확인 필요" />
            <FormSelectOption value="DOWN" label="문제 발생" />
            <FormSelectOption value="WARN" label="주의 필요" />
            <FormSelectOption value="UNKNOWN" label="미수집" />
            <FormSelectOption value="UP" label="정상" />
          </FormSelect>
        </div>
        <div className="field">
          <label className="field-label" htmlFor="overview-sort">
            정렬
          </label>
          <FormSelect
            id="overview-sort"
            aria-label="프로젝트 정렬"
            value={sort}
            onChange={(_, value) => {
              setSort(value);
              setPage(0);
            }}
          >
            <FormSelectOption value="severity" label="확인 필요 우선" />
            <FormSelectOption value="name" label="프로젝트 이름" />
            {metrics.map((metric) => (
              <FormSelectOption
                key={metric.key}
                value={metric.key}
                label={`${metric.label} 사용률 높은 순`}
              />
            ))}
          </FormSelect>
        </div>
      </div>
      <div
        className="project-overview-scroll"
        role="region"
        tabIndex={0}
        aria-label="전체 프로젝트 자원 비교"
      >
        <Table className="project-overview-table">
          <caption className="sr-only">프로젝트 상태와 자원 사용률 비교</caption>
          <thead>
            <tr>
              <th scope="col">프로젝트 / 상태</th>
              <th scope="col">수집 정상 서버</th>
              {metrics.map((metric) => (
                <th scope="col" key={metric.key}>
                  {metric.label}
                </th>
              ))}
              <th scope="col">내부 점검 이상</th>
              <th scope="col">API 이상</th>
              <th scope="col">인증서 이상</th>
            </tr>
          </thead>
          <tbody>
            {visible.map(({ project, peaks, issues }) => (
              <tr
                key={project.project_id}
                className={project.project_id === selectedProject ? 'selected' : ''}
              >
                <th scope="row">
                  <button
                    type="button"
                    className="project-select-button"
                    aria-label={`${project.display_name} 자원 보기`}
                    aria-pressed={project.project_id === selectedProject}
                    onClick={() => onSelect(project.project_id)}
                  >
                    <strong>{project.display_name}</strong>
                    <small>{project.project_id}</small>
                  </button>
                  <StatusLabel status={project.status} context="overview" />
                </th>
                <td>
                  {
                    project.instances.filter(
                      (instance) => (instance.collection_status ?? instance.status) === 'UP',
                    ).length
                  }
                  /{project.instances.length}
                </td>
                {metrics.map((metric) => {
                  const highest = peaks[metric.key];
                  return (
                    <td key={metric.key}>
                      {highest ? (
                        <div
                          className="project-usage-cell"
                          title={`${highest.instance.display_name} · ${highest.count}/${project.instances.length}개 인스턴스 수집`}
                        >
                          <meter
                            className="resource-usage-meter"
                            min={0}
                            max={1}
                            value={Math.min(1, highest.value)}
                            aria-label={`${project.display_name} ${metric.label} 최고 사용률`}
                            aria-valuetext={`${formatPercent(highest.value)}, ${highest.count}/${project.instances.length}개 인스턴스 수집`}
                          />
                          <span>{formatPercent(highest.value)}</span>
                          {highest.count < project.instances.length && (
                            <small>일부 미수집/미지원</small>
                          )}
                        </div>
                      ) : (
                        <span className="project-usage-unknown">미수집/미지원</span>
                      )}
                    </td>
                  );
                })}
                <td>
                  {
                    issues.filter(
                      (cause) => cause.kind === 'CHECK' && cause.check_category === 'INTERNAL',
                    ).length
                  }
                </td>
                <td>
                  {
                    issues.filter(
                      (cause) => cause.kind === 'CHECK' && cause.check_category === 'API',
                    ).length
                  }
                </td>
                <td>{issues.filter((cause) => cause.kind === 'CERTIFICATE').length}</td>
              </tr>
            ))}
          </tbody>
        </Table>
        {rows.length === 0 && (
          <p className="project-overview-empty">검색 조건에 맞는 프로젝트가 없습니다.</p>
        )}
      </div>
      <div className="project-overview-pagination" aria-label="프로젝트 페이지 이동">
        <span>
          {rows.length
            ? `${activePage * pageSize + 1}–${Math.min((activePage + 1) * pageSize, rows.length)}`
            : '0'}{' '}
          / {rows.length}개
        </span>
        <Button
          variant="secondary"
          size="sm"
          aria-label="이전 프로젝트 페이지"
          isDisabled={activePage === 0}
          onClick={() => setPage(activePage - 1)}
        >
          이전
        </Button>
        <span>
          {activePage + 1} / {pageCount}
        </span>
        <Button
          variant="secondary"
          size="sm"
          aria-label="다음 프로젝트 페이지"
          isDisabled={activePage >= pageCount - 1}
          onClick={() => setPage(activePage + 1)}
        >
          다음
        </Button>
      </div>
    </section>
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
