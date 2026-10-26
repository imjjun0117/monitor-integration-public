// 프로젝트별 수집 상태와 자원 사용량 비교
import { chartPeriods, liveWindowMs, type ChartPeriod } from '../utils/chartPeriod';
import type { DashboardProject, DashboardResourceSample } from '../generated';
import { useProjectScope } from './ProjectScope';
import { Select, Space } from 'antd';
import MetricChart from './MetricChart';

const metrics = [
  { key: 'system_cpu_ratio', title: 'CPU' },
  { key: 'physical_memory_ratio', title: 'RAM' },
  { key: 'heap_ratio', title: 'JVM Heap' },
  { key: 'disk_ratio', title: '디스크' },
] as const;

export default function ProjectComparison({
  projects,
  history,
  period = '24h',
  onPeriodChange,
}: {
  projects: DashboardProject[];
  history: DashboardResourceSample[];
  period?: ChartPeriod;
  onPeriodChange?: (period: ChartPeriod) => void;
}) {
  const { project: projectId, select: setProjectId } = useProjectScope();
  const indexed = new Map<string, DashboardResourceSample[]>();
  for (const row of history) {
    const rows = indexed.get(row.project_id) ?? [];
    rows.push(row);
    indexed.set(row.project_id, rows);
  }
  return (
    <section className="project-comparison" aria-label="전체 프로젝트 자원 추이">
      <Space wrap>
        <Select
          aria-label="차트 프로젝트"
          value={projectId}
          onChange={setProjectId}
          showSearch
          optionFilterProp="label"
          options={[
            { value: '', label: '전체 프로젝트' },
            ...projects.map((project) => ({
              value: project.project_id,
              label: `${project.display_name} (${project.project_id})`,
            })),
          ]}
        />
        {onPeriodChange && (
          <Select
            aria-label="차트 조회 기간"
            value={period}
            onChange={(value) => onPeriodChange(value as ChartPeriod)}
            options={Object.entries(chartPeriods).map(([value, label]) => ({ value, label }))}
          />
        )}
      </Space>
      <div className="chart-grid">
        {metrics.map((metric) => (
          <MetricChart
            key={`${metric.key}/${period}`}
            liveWindow={liveWindowMs(period)}
            title={metric.title}
            points={[]}
            xKey="sampled_at"
            yKey="value"
            unit="ratio"
            context={
              projects.find((project) => project.project_id === projectId)?.display_name ??
              '전체 프로젝트'
            }
            showLegend
            series={projects
              .map((project, index) => ({
                name: project.display_name + ' (' + project.project_id + ')',
                styleIndex: index,
                projectId: project.project_id,
                points: (indexed.get(project.project_id) ?? []).map((row) => ({
                  sampled_at: row.sampled_at,
                  value: row[metric.key],
                })),
              }))
              .filter((series) => !projectId || series.projectId === projectId)}
          />
        ))}
      </div>
    </section>
  );
}
