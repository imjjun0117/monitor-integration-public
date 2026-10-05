// 프로젝트 목록 및 자원 현황 조회 화면
import { Table, Tbody, Td, Th, Thead, Tr } from '../components/ui';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { getProjects } from '../api';
import { Empty, Failure, Loading, RefreshFailure } from '../components/QueryState';
import StatusLabel from '../components/StatusLabel';

export default function ProjectsPage() {
  const query = useQuery({ queryKey: ['projects'], queryFn: getProjects, refetchInterval: 15_000 });
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
        <Table variant="compact" aria-label="프로젝트 목록">
          <Thead>
            <Tr>
              <Th>프로젝트명</Th>
              <Th>프로젝트 ID</Th>
              <Th>정상 인스턴스</Th>
              <Th>상태</Th>
              <Th>최근 수집</Th>
            </Tr>
          </Thead>
          <Tbody>
            {projects.map((project) => (
              <Tr key={project.project_id}>
                <Td>
                  <Link to={`/projects/${project.project_id}`}>{project.display_name}</Link>
                </Td>
                <Td>{project.project_id}</Td>
                <Td>
                  {project.up_instances ?? 0}/{project.total_instances ?? 0}
                </Td>
                <Td>
                  <StatusLabel status={project.status} />
                </Td>
                <Td>
                  {project.last_seen_at
                    ? new Date(project.last_seen_at).toLocaleString()
                    : '미수집'}
                </Td>
              </Tr>
            ))}
          </Tbody>
        </Table>
      )}
    </>
  );
}
