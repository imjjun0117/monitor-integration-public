// 서버 수집 상태와 접속 오류 조회 화면
import { ProTable, type ProColumns } from '@ant-design/pro-components';
import { Button } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import { getDashboard } from '../api';
import type { DashboardInstance } from '../generated';
import { Empty, Failure, Loading, RefreshFailure } from '../components/QueryState';
import PageBackLink from '../components/PageBackLink';
import StatusLabel from '../components/StatusLabel';
import { useProjectScope } from '../components/ProjectScope';

type Server = DashboardInstance & { projectName: string; projectId: string };
const columns: ProColumns<Server>[] = [
  {
    title: '프로젝트',
    render: (_, server) => <Link to={`/projects/${server.projectId}`}>{server.projectName}</Link>,
  },
  {
    title: '서버',
    render: (_, server) => (
      <Link to={`/projects/${server.projectId}/instances/${server.instance_id}`}>
        {server.display_name}
      </Link>
    ),
  },
  { title: '호스트', render: (_, server) => server.host_name || '미수집' },
  {
    title: '수집 상태',
    render: (_, server) => (
      <StatusLabel status={server.collection_status ?? server.status} context="collection" />
    ),
  },
  {
    title: '최근 수집',
    render: (_, server) =>
      server.last_seen_at ? new Date(server.last_seen_at).toLocaleString() : '미수집',
  },
];

export default function ServerCollectionPage() {
  const { project } = useProjectScope();
  const [params, setParams] = useSearchParams();
  const normalOnly = params.get('collection') === 'UP';
  const query = useQuery({
    queryKey: ['dashboard', '24h', project, params.get('instance') ?? ''],
    queryFn: () => getDashboard('24h', project, params.get('instance') ?? ''),
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
      <Button onClick={() => setParams(normalOnly ? {} : { collection: 'UP' })}>
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
        <ProTable<Server>
          aria-label="서버 수집 현황"
          rowKey={(server) => `${server.projectId}/${server.instance_id}`}
          columns={columns}
          dataSource={servers}
          search={false}
          options={false}
          pagination={false}
          scroll={{ x: 'max-content' }}
        />
      )}
    </>
  );
}
