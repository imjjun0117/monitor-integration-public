import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import type { DashboardProject } from '../generated';
import { Status } from '../generated';
import ProjectOverview from './ProjectOverview';
import { selectOption } from '../test-select';

afterEach(cleanup);
function project(index: number, status: Status = Status.UP): DashboardProject {
  return {
    project_id: `project-${index}`,
    display_name: `Project ${String(index).padStart(3, '0')}`,
    enabled: true,
    status,
    instances: [
      {
        project_id: `project-${index}`,
        instance_id: `server-${index}`,
        display_name: `Server ${index}`,
        host_name: `host-${index}`,
        system_cpu_ratio: index === 0 ? 0 : index / 100,
        physical_memory_ratio: 0.5,
        heap_ratio: 0.25,
        disk_ratio: 0.8,
        db_pool: '',
        internal_checks: '',
        last_seen_at: null,
        status,
      },
    ],
  };
}
function view(projects: DashboardProject[], onSelect = vi.fn()) {
  return render(
    <ProjectOverview
      projects={projects}
      causes={[]}
      selectedProject={projects[0].project_id}
      onSelect={onSelect}
    />,
  );
}

test('search and pagination cover a hundred projects with twenty rows per page', () => {
  view(Array.from({ length: 100 }, (_, index) => project(index)));
  const rows = () => screen.getByRole('table').querySelectorAll('tbody tr');
  expect(rows()).toHaveLength(20);
  expect(screen.getByText('1–20 / 100개')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '다음 프로젝트 페이지' }));
  expect(screen.getByText('21–40 / 100개')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Project 020 자원 보기' })).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('프로젝트 검색'), { target: { value: 'host-97' } });
  expect(rows()).toHaveLength(1);
  expect(screen.getByRole('button', { name: 'Project 097 자원 보기' })).toBeInTheDocument();
  expect(screen.getByText('1–1 / 1개')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '다음 프로젝트 페이지' })).toBeDisabled();
});

test('prioritizes incidents and filters status or sorts by usage across the entire dataset', async () => {
  view([project(1), project(2, Status.DOWN), project(3, Status.WARN), project(4, Status.UNKNOWN)]);
  const names = () =>
    Array.from(screen.getByRole('table').querySelectorAll('tbody tr')).map(
      (row) => row.querySelector('strong')?.textContent,
    );
  expect(names()).toEqual(['Project 002', 'Project 003', 'Project 004', 'Project 001']);
  await selectOption(screen.getByLabelText('프로젝트 상태 필터'), '확인 필요');
  expect(names()).toEqual(['Project 002', 'Project 003', 'Project 004']);
  await selectOption(screen.getByLabelText('프로젝트 상태 필터'), '전체 상태');
  await selectOption(screen.getByLabelText('프로젝트 정렬'), 'CPU 사용률 높은 순');
  expect(names()).toEqual(['Project 004', 'Project 003', 'Project 002', 'Project 001']);
});

test('shows actual maxima rather than averages and preserves zero and unavailable capacities', () => {
  const item = project(0);
  item.instances.push({
    ...item.instances[0],
    instance_id: 'other',
    display_name: 'Other',
    system_cpu_ratio: 0,
    physical_memory_ratio: 0.9,
    heap_ratio: null,
    disk_ratio: null,
  });
  view([item]);
  expect(screen.getByRole('meter', { name: 'Project 000 CPU 최고 사용률' })).toHaveAttribute(
    'aria-valuetext',
    '0%, 2/2개 인스턴스 수집',
  );
  expect(screen.getByRole('meter', { name: 'Project 000 RAM 최고 사용률' })).toHaveAttribute(
    'aria-valuetext',
    '90%, 2/2개 인스턴스 수집',
  );
  expect(screen.getByRole('meter', { name: 'Project 000 JVM Heap 최고 사용률' })).toHaveAttribute(
    'aria-valuetext',
    '25%, 1/2개 인스턴스 수집',
  );
  expect(screen.getAllByText('일부 미수집/미지원')).toHaveLength(2);
});

test('selects a project without navigating away and keeps the active selection identifiable', () => {
  const onSelect = vi.fn();
  view([project(0), project(1)], onSelect);
  expect(screen.getByRole('button', { name: 'Project 000 자원 보기' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  fireEvent.click(screen.getByRole('button', { name: 'Project 001 자원 보기' }));
  expect(onSelect).toHaveBeenCalledWith('project-1');
});

test('empty search results have an explicit message rather than hiding the selected detail panel', () => {
  view([project(0)]);
  fireEvent.change(screen.getByLabelText('프로젝트 검색'), { target: { value: 'missing' } });
  expect(screen.getByText('검색 조건에 맞는 프로젝트가 없습니다.')).toBeInTheDocument();
  expect(within(screen.getByRole('table')).queryByRole('button')).not.toBeInTheDocument();
});
