// 프로젝트의 인스턴스 목록 조회 화면
import { Table, Tbody, Td, Th, Thead, Tr } from '../components/ui';
import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { getInstances } from '../api';
import { Empty, Failure, Loading, RefreshFailure } from '../components/QueryState';
import PageBackLink from '../components/PageBackLink';
import StatusLabel from '../components/StatusLabel';

export default function InstancesPage() {
  const { projectId = '' } = useParams();
  const query = useQuery({
    queryKey: ['instances', projectId],
    queryFn: () => getInstances(projectId),
    refetchInterval: 15_000,
    enabled: Boolean(projectId),
  });
  if (query.isPending) {
    return <Loading />;
  }
  if (query.isError && !query.data) {
    return <Failure />;
  }
  const instances = query.data?.items ?? [];
  return (
    <>
      <PageBackLink to="/projects">프로젝트 목록으로</PageBackLink>
      <RefreshFailure
        visible={query.isError && Boolean(query.data)}
        updatedAt={query.dataUpdatedAt}
        retry={() => void query.refetch()}
      />
      {instances.length === 0 ? (
        <Empty>
          등록된 인스턴스가 없습니다. <Link to="/settings/instances">인스턴스 등록 →</Link>
        </Empty>
      ) : (
        <Table variant="compact" aria-label="인스턴스 목록">
          <Thead>
            <Tr>
              <Th>인스턴스</Th>
              <Th>ID</Th>
              <Th>호스트</Th>
              <Th>시스템 CPU</Th>
              <Th>JVM Heap</Th>
              <Th>DB Pool Active/Max</Th>
              <Th>내부 점검</Th>
              <Th>최근 수집</Th>
              <Th>상태</Th>
            </Tr>
          </Thead>
          <Tbody>
            {instances.map((instance) => (
              <Tr key={instance.instance_id}>
                <Td>
                  <Link to={`/projects/${projectId}/instances/${instance.instance_id}`}>
                    {instance.display_name}
                  </Link>
                </Td>
                <Td>{instance.instance_id}</Td>
                <Td>{instance.host_name || '미지원'}</Td>
                <Td>{ratio(instance.system_cpu_ratio)}</Td>
                <Td>{ratio(instance.heap_ratio)}</Td>
                <Td>{instance.db_pool || '미지원'}</Td>
                <Td>{instance.internal_checks || '0/0'}</Td>
                <Td>
                  {instance.last_seen_at
                    ? new Date(instance.last_seen_at).toLocaleString()
                    : '미수집'}
                </Td>
                <Td>
                  <StatusLabel status={instance.status} />
                </Td>
              </Tr>
            ))}
          </Tbody>
        </Table>
      )}
    </>
  );
}

function ratio(value?: number | null) {
  return value == null ? '미지원' : `${Math.round(value * 100)}%`;
}
