// 서버 수집 상태와 접속 오류 조회 화면
import { useQuery } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import { Button, Table, Tbody, Td, Th, Thead, Tr } from '../components/ui';
import { getDashboard } from '../api';
import { Empty, Failure, Loading, RefreshFailure } from '../components/QueryState';
import PageBackLink from '../components/PageBackLink';
import StatusLabel from '../components/StatusLabel';

export default function ServerCollectionPage() {
  const [params, setParams] = useSearchParams();
  const normalOnly = params.get('collection') === 'UP';
  const query = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => getDashboard(),
    refetchInterval: 15_000,
  });
  if (query.isPending) {
    return <Loading />;
  }
  if (query.isError && !query.data) {
    return <Failure />;
  }
  const servers = query
    .data!.projects.flatMap((project) =>
      project.instances.map((instance) => ({
        ...instance,
        projectName: project.display_name,
        projectId: project.project_id,
      })),
    )
    .filter((instance) => !normalOnly || (instance.collection_status ?? instance.status) === 'UP');
  return (
    <>
      <PageBackLink to="/">종합 현황으로</PageBackLink>
      <p className="api-page-help">
        자원 수집 상태입니다. API·내부 점검의 상태는 서버 상세에서 별도로 확인할 수 있습니다.
      </p>
      <Button variant="secondary" onClick={() => setParams(normalOnly ? {} : { collection: 'UP' })}>
        {normalOnly ? '전체 서버 보기' : '수집 정상 서버만 보기'}
      </Button>
      <RefreshFailure
        visible={query.isError && Boolean(query.data)}
        updatedAt={query.dataUpdatedAt}
        retry={() => void query.refetch()}
      />
      {servers.length === 0 ? (
        <Empty>조건에 해당하는 서버가 없습니다.</Empty>
      ) : (
        <Table variant="compact" aria-label="서버 수집 현황">
          <Thead>
            <Tr>
              <Th>프로젝트</Th>
              <Th>서버</Th>
              <Th>호스트</Th>
              <Th>수집 상태</Th>
              <Th>최근 수집</Th>
            </Tr>
          </Thead>
          <Tbody>
            {servers.map((server) => (
              <Tr key={`${server.projectId}/${server.instance_id}`}>
                <Td>
                  <Link to={`/projects/${server.projectId}`}>{server.projectName}</Link>
                </Td>
                <Td>
                  <Link to={`/projects/${server.projectId}/instances/${server.instance_id}`}>
                    {server.display_name}
                  </Link>
                </Td>
                <Td>{server.host_name || '미수집'}</Td>
                <Td>
                  <StatusLabel
                    status={server.collection_status ?? server.status}
                    context="collection"
                  />
                </Td>
                <Td>
                  {server.last_seen_at ? new Date(server.last_seen_at).toLocaleString() : '미수집'}
                </Td>
              </Tr>
            ))}
          </Tbody>
        </Table>
      )}
    </>
  );
}
