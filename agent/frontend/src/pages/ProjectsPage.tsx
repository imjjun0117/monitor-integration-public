// 프로젝트 목록 및 자원 현황 조회 화면
import { ProTable, type ProColumns } from '@ant-design/pro-components';
import { useQuery } from '@tanstack/react-query';
import { Link, Navigate } from 'react-router-dom';
import { getProjects } from '../api';
import type { Project } from '../generated';
import { Empty, Failure, Loading, RefreshFailure } from '../components/QueryState';
import StatusLabel from '../components/StatusLabel';
import { useProjectScope } from '../components/ProjectScope';

const columns: ProColumns<Project>[] = [
  {
    title: '프로젝트명',
    dataIndex: 'display_name',
    render: (_, project) => (
      <Link to={`/projects/${project.project_id}`}>{project.display_name}</Link>
    ),
  },
  { title: '프로젝트 ID', dataIndex: 'project_id' },
  {
    title: '정상 인스턴스',
    render: (_, project) => `${project.up_instances ?? 0}/${project.total_instances ?? 0}`,
  },
  { title: '상태', render: (_, project) => <StatusLabel status={project.status} /> },
  {
    title: '최근 수집',
    render: (_, project) =>
      project.last_seen_at ? new Date(project.last_seen_at).toLocaleString() : '미수집',
  },
];

export default function ProjectsPage() {
  const { project: selectedProject } = useProjectScope();
  const query = useQuery({ queryKey: ['projects'], queryFn: getProjects, refetchInterval: 15_000 });
  // 상단에서 선택한 프로젝트는 재선택 없이 인스턴스 목록으로 이동
  if (selectedProject) {
    return <Navigate to={`/projects/${encodeURIComponent(selectedProject)}`} replace />;
  }

  if (query.isPending) {
    return <Loading />;
  }
  if (query.isError && !query.data) {
    return <Failure />;
  }
  const projects = query.data?.items ?? [];
  return (
    <>
      <RefreshFailure
        visible={query.isError && Boolean(query.data)}
        updatedAt={query.dataUpdatedAt}
        retry={() => void query.refetch()}
      />
      {projects.length === 0 ? (
        <Empty>
          등록된 프로젝트가 없습니다. <Link to="/settings/projects">프로젝트 등록 →</Link>
        </Empty>
      ) : (
        <ProTable<Project>
          aria-label="프로젝트 목록"
          rowKey="project_id"
          columns={columns}
          dataSource={projects}
          search={false}
          options={false}
          pagination={false}
        />
      )}
    </>
  );
}
