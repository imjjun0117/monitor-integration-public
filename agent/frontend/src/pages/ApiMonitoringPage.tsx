// 프로젝트별 API 점검 및 서비스 지표 조회 화면
import { ProTable, type ProColumns } from '@ant-design/pro-components';
import { Alert, Button, Form, Input, Select, Space, Tag } from 'antd';
import { usePermissions } from '../components/PermissionContext';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  getApiChecks,
  getInstances,
  getProjects,
  runApiCheck,
  saveApiCheckUsage,
  type ApiCheck,
} from '../api';
import ApiCheckDetail, { checkName, checkOutcome } from './ApiCheckDetail';
import { Empty, Failure, Loading, RefreshFailure } from '../components/QueryState';
import StatusLabel, { statusLabels } from '../components/StatusLabel';
import { useManualRerunPolling } from '../hooks/useManualRerunPolling';
import CheckSettingsButton from '../components/CheckSettingsButton';
import { scheduleLabel } from '../utils/checkPresentation';
import ServiceInfoCard from '../components/ServiceInfoCard';
import ServiceSettingsButton from '../components/ServiceSettingsButton';
import { useProjectScope } from '../components/ProjectScope';

const initialFilters = {
  project: '',
  instance: '',
  direction: '',
  status: '',
  name: '',
  usage: '',
};

export default function ApiMonitoringPage() {
  const { project: scopedProject, select: selectProject } = useProjectScope();
  const [searchParams, setSearchParams] = useSearchParams();
  const [filters, setFilters] = useState(() => ({
    ...initialFilters,
    project: searchParams.get('project') ?? scopedProject,
    instance: searchParams.get('instance') ?? '',
    status: searchParams.get('status') ?? '',
    usage: searchParams.get('usage') ?? '',
  }));
  const [selected, setSelected] = useState<ApiCheck>();
  const client = useQueryClient();
  const projects = useQuery({ queryKey: ['projects'], queryFn: getProjects });
  const instances = useQuery({
    queryKey: ['instances', filters.project],
    queryFn: () => getInstances(filters.project),
    enabled: Boolean(filters.project),
  });
  const query = useQuery({
    queryKey: ['api-checks', filters],
    queryFn: () => getApiChecks(filters),
    refetchInterval: 15_000,
  });
  useEffect(() => {
    const checkId = searchParams.get('check');
    const target =
      checkId &&
      query.data?.items.find(
        (check) =>
          check.check_id === checkId &&
          check.project_id === searchParams.get('project') &&
          check.instance_id === searchParams.get('instance'),
      );
    if (target) {
      setSelected(target);
      const next = new URLSearchParams(searchParams);
      next.delete('check');
      setSearchParams(next, { replace: true });
    }
  }, [query.data, searchParams, setSearchParams]);
  const currentSelected =
    selected && (query.data?.items.find((check) => sameCheck(check, selected)) ?? selected);
  const polling = useManualRerunPolling(currentSelected?.checked_at, async () => {
    await query.refetch();
  });
  const rerun = useMutation({
    mutationFn: (check: ApiCheck) =>
      runApiCheck(check.project_id, check.instance_id, check.check_id),
    onSuccess: () => {
      polling.start();
      void client.invalidateQueries({ queryKey: ['api-checks'] });
    },
  });
  const usage = useMutation({
    mutationFn: (check: ApiCheck) => saveApiCheckUsage(check, check.monitoring_enabled === false),
    onSuccess: async (_, check) => {
      if (selected && sameCheck(selected, check)) {
        polling.reset();
        setSelected({ ...check, monitoring_enabled: check.monitoring_enabled === false });
      }
      await Promise.all(
        ['api-checks', 'dashboard', 'projects', 'instances'].map((key) =>
          client.invalidateQueries({ queryKey: [key] }),
        ),
      );
    },
  });
  const panel = currentSelected ? (
    <ApiCheckDetail
      check={currentSelected}
      close={() => {
        polling.reset();
        setSelected(undefined);
      }}
      run={() => rerun.mutate(currentSelected)}
      running={rerun.isPending}
      waiting={polling.isPolling}
      timedOut={polling.didTimeOut}
    />
  ) : undefined;
  return (
    <>
      <p className="api-page-help">API를 선택하면 요청·응답과 결과를 확인할 수 있습니다.</p>
      <details className="api-management-help">
        <summary>점검 안내</summary>
        <p>
          <strong>사용 중지</strong> 점검과 장애 집계에서 제외됩니다. 기존 기록은 유지됩니다.
        </p>
        <p>
          <strong>자동 점검</strong> 설정에서 사용 여부와 주기를 정합니다. 자동 점검을 끄면 수동으로
          실행할 수 있습니다.
        </p>
        <p>
          자동 점검은 인스턴스의 API 자동 점검도 켜져 있어야 합니다. 진행 중인 점검은 완료될 수
          있습니다.
        </p>
      </details>
      {Object.values(filters).some(Boolean) && (
        <div className="filter-actions">
          <Button
            type="link"
            onClick={() => {
              setFilters(initialFilters);
              setSearchParams({}, { replace: true });
            }}
          >
            필터 초기화
          </Button>
        </div>
      )}
      <Form layout="vertical">
        <div className="query-filters">
          <Form.Item label="사용 여부" htmlFor="api-usage-filter">
            <Select
              id="api-usage-filter"
              aria-label="사용 여부 필터"
              value={filters.usage}
              onChange={(usage) => setFilters({ ...filters, usage })}
              options={[
                { value: '', label: '전체 API' },
                { value: 'used', label: '사용 API' },
                { value: 'unused', label: '미사용 API' },
              ]}
              style={{ minWidth: 150 }}
            />
          </Form.Item>
          <Form.Item label="프로젝트" htmlFor="api-project-filter">
            <Select
              id="api-project-filter"
              aria-label="프로젝트 필터"
              showSearch
              optionFilterProp="label"
              value={filters.project}
              onChange={(project) => {
                setFilters({ ...filters, project, instance: '' });
                selectProject(project);
              }}
              disabled={projects.isPending || projects.isError}
              options={[
                {
                  value: '',
                  label: projects.isPending
                    ? '프로젝트 불러오는 중…'
                    : projects.isError
                      ? '프로젝트를 불러오지 못했습니다'
                      : projects.data?.items.length === 0
                        ? '등록된 프로젝트가 없습니다'
                        : '전체 프로젝트',
                },
                ...(projects.data?.items.map((project) => ({
                  value: project.project_id,
                  label: `${project.display_name} (${project.project_id})`,
                })) ?? []),
              ]}
              style={{ minWidth: 200 }}
            />
          </Form.Item>
          <Form.Item label="인스턴스" htmlFor="api-instance-filter">
            <Select
              id="api-instance-filter"
              aria-label="인스턴스 필터"
              showSearch
              optionFilterProp="label"
              value={filters.instance}
              onChange={(instance) => setFilters({ ...filters, instance })}
              disabled={!filters.project || instances.isPending || instances.isError}
              options={[
                {
                  value: '',
                  label: !filters.project
                    ? '프로젝트를 먼저 선택하세요'
                    : instances.isPending
                      ? '인스턴스 불러오는 중…'
                      : instances.isError
                        ? '인스턴스를 불러오지 못했습니다'
                        : instances.data?.items.length === 0
                          ? '등록된 인스턴스가 없습니다'
                          : '전체 인스턴스',
                },
                ...(instances.data?.items.map((instance) => ({
                  value: instance.instance_id,
                  label: `${instance.display_name} (${instance.instance_id})`,
                })) ?? []),
              ]}
              style={{ minWidth: 200 }}
            />
          </Form.Item>
          <Form.Item label="구분" htmlFor="api-direction-filter">
            <Select
              id="api-direction-filter"
              aria-label="내외부 필터"
              value={filters.direction}
              onChange={(direction) => setFilters({ ...filters, direction })}
              options={[
                { value: '', label: '전체' },
                { value: 'INTERNAL', label: '내부 API' },
                { value: 'EXTERNAL', label: '외부 API' },
              ]}
              style={{ minWidth: 130 }}
            />
          </Form.Item>
          <Form.Item label="상태" htmlFor="api-status-filter">
            <Select
              id="api-status-filter"
              aria-label="상태 필터"
              value={filters.status}
              onChange={(status) => setFilters({ ...filters, status })}
              options={[
                { value: '', label: '전체' },
                ...(['UP', 'WARN', 'DOWN', 'UNKNOWN'] as const).map((value) => ({
                  value,
                  label: statusLabels[value],
                })),
              ]}
              style={{ minWidth: 130 }}
            />
          </Form.Item>
          <Form.Item
            label="API 이름"
            htmlFor="api-name-filter"
            extra="입력 즉시 결과에 적용됩니다."
          >
            <Input
              id="api-name-filter"
              aria-label="API 이름"
              value={filters.name}
              onChange={(event) => setFilters({ ...filters, name: event.target.value })}
            />
          </Form.Item>
        </div>
      </Form>
      {rerun.isError && <Alert type="error" title="재점검 요청에 실패했습니다." />}
      {usage.isError && (
        <Alert type="error" title="사용 여부를 저장하지 못했습니다. 기존 설정을 유지합니다." />
      )}
      {usage.isSuccess && (
        <Alert
          type="success"
          title={
            usage.variables.monitoring_enabled === false
              ? '사용으로 전환했습니다. 다음 자동 점검 대상에 포함됩니다.'
              : '미사용으로 전환했습니다. 점검과 장애 집계에서 제외됩니다.'
          }
        />
      )}
      {filters.project && query.data?.items.some((check) => check.service_info) && (
        <div className="service-balance-grid api-balances">
          {query.data.items
            .filter((check) => check.service_info)
            .map((check) => (
              <ServiceInfoCard
                key={`${check.project_id}/${check.instance_id}/${check.check_id}`}
                check={check}
                action={<Button onClick={() => setSelected(check)}>상세 · 다시 조회</Button>}
              />
            ))}
        </div>
      )}
      <RefreshFailure
        visible={query.isError && Boolean(query.data)}
        updatedAt={query.dataUpdatedAt}
        retry={() => void query.refetch()}
      />
      <CheckTable
        query={query}
        filtered={Object.values(filters).some(Boolean)}
        reset={() => {
          setFilters(initialFilters);
          setSearchParams({}, { replace: true });
        }}
        select={setSelected}
        toggleUsage={(check) => usage.mutate(check)}
        saving={usage.isPending}
      />
      {panel}
    </>
  );
}

function sameCheck(left: ApiCheck, right: ApiCheck) {
  return (
    left.project_id === right.project_id &&
    left.instance_id === right.instance_id &&
    left.check_id === right.check_id
  );
}

function CheckTable({
  query,
  filtered,
  reset,
  select,
  toggleUsage,
  saving,
}: {
  filtered: boolean;
  reset: () => void;
  query: ReturnType<typeof useQuery<Awaited<ReturnType<typeof getApiChecks>>>>;
  select: (check: ApiCheck) => void;
  toggleUsage: (check: ApiCheck) => void;
  saving: boolean;
}) {
  const { canWrite } = usePermissions();
  if (query.isPending) {
    return <Loading />;
  }
  if (query.isError && !query.data) {
    return <Failure />;
  }
  const checks = query.data?.items ?? [];
  if (checks.length === 0) {
    return (
      <Empty>
        {filtered ? (
          <>
            조건에 맞는 API가 없습니다.{' '}
            <Button type="link" onClick={reset}>
              필터 초기화
            </Button>
          </>
        ) : (
          '등록된 API가 없습니다.'
        )}
      </Empty>
    );
  }
  const columns: ProColumns<ApiCheck>[] = [
    {
      title: '프로젝트 / 실행 서버',
      render: (_, check) => (
        <>
          <strong>{check.project_name ?? check.project_id}</strong>
          <br />
          {check.instance_name ?? check.instance_id}
        </>
      ),
    },
    {
      title: 'API',
      render: (_, check) => (
        <>
          {check.direction === 'INTERNAL'
            ? '내부 API'
            : check.direction === 'EXTERNAL'
              ? '외부 API'
              : '미지원'}
          <br />
          <Button type="link" onClick={() => select(check)}>
            {checkName(check)}
          </Button>
        </>
      ),
    },
    {
      title: '현재 상태',
      render: (_, check) => (
        <>
          {check.monitoring_enabled === false ? (
            <Tag>미사용</Tag>
          ) : (
            <StatusLabel status={check.status} />
          )}
          <br />
          {scheduleLabel(check)}
        </>
      ),
    },
    {
      title: '응답시간',
      render: (_, check) =>
        check.duration_ms == null ? '미수집' : `${check.duration_ms.toLocaleString('ko-KR')} ms`,
    },
    {
      title: '최근 점검',
      render: (_, check) =>
        check.checked_at ? new Date(check.checked_at).toLocaleString('ko-KR') : '미수집',
    },
    {
      title: '실패 요약',
      render: (_, check) =>
        check.monitoring_enabled !== false && (check.status === 'DOWN' || check.status === 'WARN')
          ? checkOutcome(check)
          : '',
    },
    {
      title: '관리',
      render: (_, check) => (
        <>
          <CheckSettingsButton check={check} />
          <ServiceSettingsButton check={check} />
          {canWrite && (
            <Button
              disabled={saving}
              onClick={() => toggleUsage(check)}
              aria-label={`${checkName(check)} ${check.monitoring_enabled === false ? '사용으로 전환' : '미사용으로 전환'}`}
            >
              {check.monitoring_enabled === false ? '사용 재개' : '사용 중지'}
            </Button>
          )}
        </>
      ),
    },
  ];
  return (
    <ProTable<ApiCheck>
      aria-label="API 점검 목록"
      rowKey={(check) => `${check.project_id}/${check.instance_id}/${check.check_id}`}
      columns={columns}
      dataSource={checks}
      search={false}
      options={false}
      pagination={false}
      scroll={{ x: 'max-content' }}
    />
  );
}
