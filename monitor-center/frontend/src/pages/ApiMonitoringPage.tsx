// 프로젝트별 API 점검 및 서비스 지표 조회 화면
import { Alert, Button, Label, FormSelect, FormSelectOption, TextInput } from '../components/ui';
import { Table, Tbody, Td, Th, Thead, Tr } from '../components/ui';
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
import { LabeledField } from './settings/forms';
import CheckSettingsButton from '../components/CheckSettingsButton';
import { scheduleLabel } from '../utils/checkPresentation';
import ServiceInfoCard from '../components/ServiceInfoCard';
import ServiceSettingsButton from '../components/ServiceSettingsButton';

const initialFilters = {
  project: '',
  instance: '',
  direction: '',
  status: '',
  name: '',
  usage: '',
};

export default function ApiMonitoringPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [filters, setFilters] = useState(() => ({
    ...initialFilters,
    project: searchParams.get('project') ?? '',
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
      setSearchParams({}, { replace: true });
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
            variant="link"
            size="sm"
            onClick={() => {
              setFilters(initialFilters);
              setSearchParams({}, { replace: true });
            }}
          >
            필터 초기화
          </Button>
        </div>
      )}
      <div className="filters api-filters">
        <LabeledField id="api-usage-filter" label="사용 여부">
          <FormSelect
            id="api-usage-filter"
            aria-label="사용 여부 필터"
            value={filters.usage}
            onChange={(_, usage) => setFilters({ ...filters, usage })}
          >
            <FormSelectOption value="" label="전체 API" />
            <FormSelectOption value="used" label="사용 API" />
            <FormSelectOption value="unused" label="미사용 API" />
          </FormSelect>
        </LabeledField>
        <LabeledField id="api-project-filter" label="프로젝트">
          <FormSelect
            id="api-project-filter"
            aria-label="프로젝트 필터"
            value={filters.project}
            onChange={(_, project) => setFilters({ ...filters, project, instance: '' })}
            isDisabled={projects.isPending || projects.isError}
          >
            <FormSelectOption
              value=""
              label={
                projects.isPending
                  ? '프로젝트 불러오는 중…'
                  : projects.isError
                    ? '프로젝트를 불러오지 못했습니다'
                    : projects.data?.items.length === 0
                      ? '등록된 프로젝트가 없습니다'
                      : '전체 프로젝트'
              }
            />
            {projects.data?.items.map((project) => (
              <FormSelectOption
                key={project.project_id}
                value={project.project_id}
                label={`${project.display_name} (${project.project_id})`}
              />
            ))}
          </FormSelect>
        </LabeledField>
        <LabeledField id="api-instance-filter" label="인스턴스">
          <FormSelect
            id="api-instance-filter"
            aria-label="인스턴스 필터"
            value={filters.instance}
            onChange={(_, instance) => setFilters({ ...filters, instance })}
            isDisabled={!filters.project || instances.isPending || instances.isError}
          >
            <FormSelectOption
              value=""
              label={
                !filters.project
                  ? '프로젝트를 먼저 선택하세요'
                  : instances.isPending
                    ? '인스턴스 불러오는 중…'
                    : instances.isError
                      ? '인스턴스를 불러오지 못했습니다'
                      : instances.data?.items.length === 0
                        ? '등록된 인스턴스가 없습니다'
                        : '전체 인스턴스'
              }
            />
            {instances.data?.items.map((instance) => (
              <FormSelectOption
                key={instance.instance_id}
                value={instance.instance_id}
                label={`${instance.display_name} (${instance.instance_id})`}
              />
            ))}
          </FormSelect>
        </LabeledField>
        <LabeledField id="api-direction-filter" label="구분">
          <FormSelect
            id="api-direction-filter"
            aria-label="내외부 필터"
            value={filters.direction}
            onChange={(_, value) => setFilters({ ...filters, direction: value })}
          >
            <FormSelectOption value="" label="전체" />
            <FormSelectOption value="INTERNAL" label="내부 API" />
            <FormSelectOption value="EXTERNAL" label="외부 API" />
          </FormSelect>
        </LabeledField>
        <LabeledField id="api-status-filter" label="상태">
          <FormSelect
            id="api-status-filter"
            aria-label="상태 필터"
            value={filters.status}
            onChange={(_, value) => setFilters({ ...filters, status: value })}
          >
            <FormSelectOption value="" label="전체" />
            {(['UP', 'WARN', 'DOWN', 'UNKNOWN'] as const).map((value) => (
              <FormSelectOption key={value} value={value} label={statusLabels[value]} />
            ))}
          </FormSelect>
        </LabeledField>
        <LabeledField id="api-name-filter" label="API 이름" help="입력 즉시 결과에 적용됩니다.">
          <TextInput
            id="api-name-filter"
            aria-label="API 이름"
            value={filters.name}
            onChange={(_, value) => setFilters({ ...filters, name: value })}
          />
        </LabeledField>
      </div>
      {rerun.isError && <Alert variant="danger" title="재점검 요청에 실패했습니다." />}
      {usage.isError && (
        <Alert variant="danger" title="사용 여부를 저장하지 못했습니다. 기존 설정을 유지합니다." />
      )}
      {usage.isSuccess && (
        <Alert
          variant="success"
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
                action={
                  <Button variant="secondary" size="sm" onClick={() => setSelected(check)}>
                    상세 · 다시 조회
                  </Button>
                }
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
            <Button variant="link" onClick={reset}>
              필터 초기화
            </Button>
          </>
        ) : (
          '등록된 API가 없습니다.'
        )}
      </Empty>
    );
  }
  return (
    <Table variant="compact" className="api-check-table" aria-label="API 점검 목록">
      <Thead>
        <Tr>
          <Th>프로젝트 / 실행 서버</Th>
          <Th>API</Th>
          <Th>현재 상태</Th>
          <Th>응답시간</Th>
          <Th>최근 점검</Th>
          <Th>실패 요약</Th>
          <Th>관리</Th>
        </Tr>
      </Thead>
      <Tbody>
        {checks.map((check) => (
          <Tr key={`${check.project_id}/${check.instance_id}/${check.check_id}`}>
            <Td>
              <strong>{check.project_name ?? check.project_id}</strong>
              <small>{check.instance_name ?? check.instance_id}</small>
            </Td>
            <Td>
              <small>
                {check.direction === 'INTERNAL'
                  ? '내부 API'
                  : check.direction === 'EXTERNAL'
                    ? '외부 API'
                    : '미지원'}
              </small>
              <Button variant="link" onClick={() => select(check)}>
                {checkName(check)}
              </Button>
            </Td>
            <Td>
              {check.monitoring_enabled === false ? (
                <Label color="grey">미사용</Label>
              ) : (
                <StatusLabel status={check.status} />
              )}
              <small>{scheduleLabel(check)}</small>
            </Td>
            <Td>
              {check.duration_ms == null
                ? '미수집'
                : `${check.duration_ms.toLocaleString('ko-KR')} ms`}
            </Td>
            <Td>
              {check.checked_at ? (
                <>
                  {new Date(check.checked_at).toLocaleDateString('ko-KR')}
                  <small>{new Date(check.checked_at).toLocaleTimeString('ko-KR')}</small>
                </>
              ) : (
                '미수집'
              )}
            </Td>
            <Td>
              {check.monitoring_enabled !== false &&
              (check.status === 'DOWN' || check.status === 'WARN')
                ? checkOutcome(check)
                : ''}
            </Td>
            <Td>
              <div className="check-row-actions">
                <CheckSettingsButton check={check} />
                <ServiceSettingsButton check={check} />
                <Button
                  permission="write"
                  variant="secondary"
                  size="sm"
                  isDisabled={saving}
                  onClick={() => toggleUsage(check)}
                  aria-label={`${checkName(check)} ${check.monitoring_enabled === false ? '사용으로 전환' : '미사용으로 전환'}`}
                >
                  {check.monitoring_enabled === false ? '사용 재개' : '사용 중지'}
                </Button>
              </div>
            </Td>
          </Tr>
        ))}
      </Tbody>
    </Table>
  );
}
