// 프로젝트의 인스턴스 목록 조회 화면
import { ProTable, type ProColumns } from '@ant-design/pro-components';
import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { getInstances } from '../api';
import type { Instance } from '../generated';
import { Empty, Failure, Loading, RefreshFailure } from '../components/QueryState';
import PageBackLink from '../components/PageBackLink';
import StatusLabel from '../components/StatusLabel';

function ratio(value?: number | null) {
  return value == null ? '미지원' : `${Math.round(value * 100)}%`;
}

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
  const columns: ProColumns<Instance>[] = [
    {
      title: '인스턴스',
      render: (_, instance) => (
        <Link to={`/projects/${projectId}/instances/${instance.instance_id}`}>
          {instance.display_name}
        </Link>
      ),
    },
    { title: 'ID', dataIndex: 'instance_id' },
    { title: '호스트', render: (_, instance) => instance.host_name || '미지원' },
    { title: '시스템 CPU', render: (_, instance) => ratio(instance.system_cpu_ratio) },
    { title: 'JVM Heap', render: (_, instance) => ratio(instance.heap_ratio) },
    { title: 'DB Pool Active/Max', render: (_, instance) => instance.db_pool || '미지원' },
    { title: '내부 점검', render: (_, instance) => instance.internal_checks || '0/0' },
    {
      title: '최근 수집',
      render: (_, instance) =>
        instance.last_seen_at ? new Date(instance.last_seen_at).toLocaleString() : '미수집',
    },
    { title: '상태', render: (_, instance) => <StatusLabel status={instance.status} /> },
    {
      title: '설정',
      render: (_, instance) => (
        <Link to={`/projects/${projectId}/instances/${instance.instance_id}?tab=thresholds`}>
          임계치 관리
        </Link>
      ),
    },
  ];
  return (
    <>
      <PageBackLink to="/projects?project=">프로젝트 목록으로</PageBackLink>
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
        <ProTable<Instance>
          aria-label="인스턴스 목록"
          rowKey="instance_id"
          columns={columns}
          dataSource={instances}
          search={false}
          options={false}
          pagination={false}
          scroll={{ x: 'max-content' }}
        />
      )}
    </>
  );
}
