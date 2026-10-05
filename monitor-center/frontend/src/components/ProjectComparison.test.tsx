import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import { Status, type DashboardProject, type DashboardResourceSample } from '../generated';
import ProjectComparison from './ProjectComparison';
import { selectOption } from '../test-select';

vi.mock('./MetricChart', () => ({
  metricSeriesStyle: (index: number) => ({ color: '#00000' + index, borderStyle: 'solid' }),
  default: ({ title, series }: { title: string; series: object[] }) => (
    <div data-testid={title}>{JSON.stringify(series)}</div>
  ),
}));
afterEach(cleanup);
const projects: DashboardProject[] = [
  { project_id: 'a', display_name: 'Alpha', enabled: true, status: Status.UP, instances: [] },
  { project_id: 'b', display_name: 'Beta', enabled: true, status: Status.UP, instances: [] },
];
const history: DashboardResourceSample[] = [
  {
    project_id: 'a',
    sampled_at: '2026-10-04T00:00:00Z',
    system_cpu_ratio: 0,
    heap_ratio: 0.2,
    physical_memory_ratio: 0.7,
    disk_ratio: 0.9,
  },
  {
    project_id: 'a',
    sampled_at: '2026-10-04T01:00:00Z',
    system_cpu_ratio: null,
    heap_ratio: null,
    physical_memory_ratio: null,
    disk_ratio: null,
  },
  {
    project_id: 'b',
    sampled_at: '2026-10-04T00:00:00Z',
    system_cpu_ratio: 0.8,
    heap_ratio: 0.6,
    physical_memory_ratio: 0.4,
    disk_ratio: null,
  },
];
function read(title: string) {
  return JSON.parse(screen.getByTestId(title).textContent!);
}

test('keeps projects separate and preserves actual zero and missing collection gaps', () => {
  render(<ProjectComparison projects={projects} history={history} />);
  const series = read('CPU');
  expect(series.map((item: { name: string }) => item.name)).toEqual(['Alpha (a)', 'Beta (b)']);
  expect(series[0].points.map((item: { value: number | null }) => item.value)).toEqual([0, null]);
  expect(series[1].points[0].value).toBe(0.8);
  expect(read('디스크')[1].points[0].value).toBeNull();
});

test('project filter updates all charts and preserves project styles when returning to all projects', async () => {
  render(<ProjectComparison projects={projects} history={history} />);
  await selectOption(screen.getByLabelText('차트 프로젝트'), 'Beta (b)');
  for (const title of ['CPU', 'RAM', 'JVM Heap', '디스크']) {
    expect(read(title).map((item: { name: string }) => item.name)).toEqual(['Beta (b)']);
    expect(read(title)[0].styleIndex).toBe(1);
  }
  await selectOption(screen.getByLabelText('차트 프로젝트'), '전체 프로젝트');
  expect(read('CPU')).toHaveLength(2);
  expect(read('CPU')[1].styleIndex).toBe(1);
});

test('hundreds of projects remain available without inventing zero values for missing data', async () => {
  const many = Array.from({ length: 100 }, (_, index) => ({
    ...projects[0],
    project_id: 'p' + index,
    display_name: 'Project ' + index,
  }));
  render(<ProjectComparison projects={many} history={[]} />);
  expect(read('CPU')).toHaveLength(100);
  expect(read('CPU')[99].points).toEqual([]);
  await selectOption(screen.getByLabelText('차트 프로젝트'), 'Project 99 (p99)');
  expect(read('CPU')).toHaveLength(1);
  expect(read('CPU')[0].points).toEqual([]);
});
