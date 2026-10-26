// 인증서 검사 결과 및 만료 상태 조회 화면
import { ProDescriptions, ProTable, type ProColumns } from '@ant-design/pro-components';
import { Alert, Button, Drawer, Form, Select, Space } from 'antd';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import type { Certificate } from '../generated';
import { checkCertificate, getCertificates, getDashboard, getProjects } from '../api';
import type { DashboardStatusCause } from '../generated';
import { Empty, Failure, Loading, RefreshFailure } from '../components/QueryState';
import StatusLabel, { statusLabels } from '../components/StatusLabel';
import { useManualRerunPolling } from '../hooks/useManualRerunPolling';
import { useProjectScope } from '../components/ProjectScope';
import { usePermissions } from '../components/PermissionContext';

export default function CertificatesPage() {
  const { canWrite } = usePermissions();
  const { project: scopedProject, select: selectProject } = useProjectScope();
  const [searchParams, setSearchParams] = useSearchParams();
  const [filters, setFilters] = useState({
    project: searchParams.get('project') ?? scopedProject,
    status: searchParams.get('status') ?? '',
    expiry: searchParams.get('expiry') === 'soon' ? 'soon' : '',
  });
  const client = useQueryClient();
  const [selected, setSelected] = useState<Certificate>();
  const projects = useQuery({ queryKey: ['projects'], queryFn: getProjects });
  const query = useQuery({
    queryKey: ['certificates', filters],
    queryFn: async () => {
      const [page, dashboard] = await Promise.all([
        getCertificates(filters),
        filters.expiry === 'soon' ? getDashboard() : Promise.resolve(undefined),
      ]);
      if (!dashboard) {
        return page;
      }
      const targets = expiringCertificateIds(dashboard.status_causes ?? []);
      const items = [...page.items];
      for (let next = 1; next * page.size < page.total; next++) {
        items.push(...(await getCertificates(filters, next)).items);
      }
      const matches = items.filter((item) => targets.has(String(item.certificate_target_id)));
      return { ...page, items: matches, total: matches.length };
    },
    refetchInterval: 15_000,
  });
  const current =
    selected &&
    (query.data?.items.find(
      (item) => item.certificate_target_id === selected.certificate_target_id,
    ) ??
      selected);
  const polling = useManualRerunPolling(current?.checked_at, () => query.refetch());
  const recheck = useMutation({
    mutationFn: checkCertificate,
    onSuccess: () => {
      polling.start();
      void client.invalidateQueries({ queryKey: ['certificates'] });
    },
  });
  return (
    <>
      <p className="api-page-help">
        <span>프로젝트별 인증서를 관리합니다.</span> 호스트를 선택하면 만료일과 검증 결과를 확인할
        수 있습니다. <Link to="/settings/certificates">인증서 설정 →</Link>
      </p>
      {Object.values(filters).some(Boolean) && (
        <div className="filter-actions">
          <Button
            type="link"
            onClick={() => {
              setFilters({ project: '', status: '', expiry: '' });
              setSearchParams({}, { replace: true });
            }}
          >
            필터 초기화
          </Button>
        </div>
      )}
      <Form layout="vertical">
        <div className="query-filters">
          <Form.Item label="만료 대상" htmlFor="certificate-expiry-filter">
            <Select
              id="certificate-expiry-filter"
              aria-label="만료 대상 필터"
              value={filters.expiry}
              onChange={(expiry) => setFilters({ ...filters, expiry })}
              options={[
                { value: '', label: '전체 인증서' },
                { value: 'soon', label: '만료 예정 · 만료 인증서' },
              ]}
              style={{ minWidth: 190 }}
            />
          </Form.Item>
          <Form.Item label="프로젝트" htmlFor="certificate-project-filter">
            <Select
              id="certificate-project-filter"
              aria-label="프로젝트 필터"
              showSearch
              optionFilterProp="label"
              value={filters.project}
              onChange={(project) => {
                setFilters({ ...filters, project });
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
          <Form.Item label="상태" htmlFor="certificate-status-filter">
            <Select
              id="certificate-status-filter"
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
        </div>
      </Form>
      {recheck.isError && <Alert type="error" title="인증서 재검사에 실패했습니다." />}
      <RefreshFailure
        visible={query.isError && Boolean(query.data)}
        updatedAt={query.dataUpdatedAt}
        retry={() => void query.refetch()}
      />
      <CertificateTable
        query={query}
        filtered={Object.values(filters).some(Boolean)}
        reset={() => {
          setFilters({ project: '', status: '', expiry: '' });
          setSearchParams({}, { replace: true });
        }}
        onSelect={setSelected}
        checking={recheck.isPending || polling.isPolling}
        onCheck={(certificate) => {
          polling.reset();
          setSelected(certificate);
          recheck.mutate(certificate.certificate_target_id);
        }}
      />
      {current && (
        <Drawer
          open
          title="SSL 인증서 상세"
          size={640}
          closable={false}
          extra={
            <Button
              onClick={() => {
                polling.reset();
                setSelected(undefined);
              }}
            >
              상세 닫기
            </Button>
          }
          onClose={() => {
            polling.reset();
            setSelected(undefined);
          }}
        >
          <div>
            <p className="api-purpose">
              {current.hostname}:{current.port}에 HTTPS 보안 연결을 맺어 실제 인증서를 조회한
              결과입니다.
            </p>
            <Space>
              <StatusLabel status={current.status} />
              <span>{time(current.checked_at)}</span>
            </Space>
            <p className="api-outcome">{certificateOutcome(current)}</p>
            <ProDescriptions
              column={1}
              bordered
              dataSource={{
                remaining:
                  current.days_remaining == null ? '미수집' : `${current.days_remaining}일`,
                notBefore: time(current.not_before),
                notAfter: time(current.not_after),
                hostnameValid: yesNo(current.hostname_valid),
                chainValid: yesNo(current.chain_valid),
                subject: current.subject ?? '미수집',
                issuer: current.issuer ?? '미수집',
                algorithm: current.signature_algorithm ?? '미수집',
                serial: current.serial_number ?? '미수집',
                sni: current.sni_hostname,
                schedule: current.enabled ? `${current.check_interval_minutes}분마다` : '중지',
                message: current.message ?? '미수집',
              }}
              columns={[
                { title: '남은 기간', dataIndex: 'remaining' },
                { title: '유효 시작일', dataIndex: 'notBefore' },
                { title: '만료일', dataIndex: 'notAfter' },
                { title: '도메인 일치', dataIndex: 'hostnameValid' },
                { title: '인증서 신뢰', dataIndex: 'chainValid' },
                { title: '인증 대상', dataIndex: 'subject' },
                { title: '발급 기관', dataIndex: 'issuer' },
                { title: '서명 알고리즘', dataIndex: 'algorithm' },
                { title: '일련번호', dataIndex: 'serial' },
                { title: '요청 도메인', dataIndex: 'sni' },
                { title: '자동 점검', dataIndex: 'schedule' },
                { title: '결과 코드', dataIndex: 'message' },
              ]}
            />
            <div className="api-run-action">
              {canWrite && (
                <Button
                  type="primary"
                  loading={recheck.isPending}
                  disabled={polling.isPolling}
                  onClick={() => recheck.mutate(current.certificate_target_id)}
                >
                  지금 인증서 확인
                </Button>
              )}
              <p>서버에 다시 접속해 인증서를 새로 조회합니다.</p>
            </div>
            {polling.isPolling && (
              <Alert type="info" title="인증서 조회 결과를 기다리고 있습니다." />
            )}
            {polling.didTimeOut && (
              <Alert type="warning" title="아직 새 조회 결과가 도착하지 않았습니다." />
            )}
          </div>
        </Drawer>
      )}
    </>
  );
}

function CertificateTable({
  query,
  filtered,
  reset,
  onCheck,
  onSelect,
  checking,
}: {
  filtered: boolean;
  reset: () => void;
  query: ReturnType<typeof useQuery<Awaited<ReturnType<typeof getCertificates>>>>;
  onCheck: (certificate: Certificate) => void;
  onSelect: (certificate: Certificate) => void;
  checking: boolean;
}) {
  const { canWrite } = usePermissions();
  if (query.isPending) {
    return <Loading />;
  }
  if (query.isError && !query.data) {
    return <Failure />;
  }
  const certificates = query.data?.items ?? [];
  if (certificates.length === 0) {
    return (
      <Empty>
        {filtered ? (
          <>
            조건에 맞는 인증서가 없습니다.{' '}
            <Button type="link" onClick={reset}>
              필터 초기화
            </Button>
          </>
        ) : (
          <>
            등록된 인증서가 없습니다. <Link to="/settings/certificates">인증서 등록 →</Link>
          </>
        )}
      </Empty>
    );
  }
  const columns: ProColumns<Certificate>[] = [
    { title: '프로젝트', dataIndex: 'project_id' },
    {
      title: '호스트',
      dataIndex: 'hostname',
      render: (_, certificate) => (
        <Button type="link" onClick={() => onSelect(certificate)}>
          {certificate.hostname}:{certificate.port}
        </Button>
      ),
    },
    {
      title: '인증 대상 / 발급 기관',
      dataIndex: 'subject',
      render: (_, certificate) =>
        `${String(certificate.subject ?? '미수집')} / ${String(certificate.issuer ?? '미수집')}`,
    },
    { title: '일련번호', dataIndex: 'serial_number', renderText: (value) => value ?? '미수집' },
    { title: '유효 시작', dataIndex: 'not_before', renderText: time },
    { title: '만료', dataIndex: 'not_after', renderText: time },
    {
      title: '남은 일수',
      dataIndex: 'days_remaining',
      renderText: (value) => String(value ?? '미수집'),
    },
    { title: '신뢰 검증', dataIndex: 'chain_valid', renderText: yesNo },
    { title: '도메인 일치', dataIndex: 'hostname_valid', renderText: yesNo },
    {
      title: '상태',
      dataIndex: 'status',
      render: (_, certificate) => <StatusLabel status={certificate.status} />,
    },
    {
      title: '작업',
      valueType: 'option',
      hideInTable: !canWrite,
      render: (_, certificate) => (
        <Button disabled={checking} onClick={() => onCheck(certificate)}>
          지금 확인
        </Button>
      ),
    },
  ];
  return (
    <ProTable<Certificate>
      aria-label="인증서 목록"
      rowKey="certificate_target_id"
      dataSource={certificates}
      columns={columns}
      search={false}
      options={false}
      pagination={false}
      scroll={{ x: 'max-content' }}
    />
  );
}

function time(value: unknown) {
  return value ? new Date(String(value)).toLocaleString() : '미수집';
}
function yesNo(value: unknown) {
  return value == null ? '미수집' : value ? '정상' : '실패';
}

function certificateOutcome(certificate: Certificate) {
  const failures: Record<string, string> = {
    TLS_TIMEOUT: '서버 연결 또는 인증서 수신 시간이 초과됐습니다.',
    TLS_DNS_ERROR: '도메인의 IP 주소를 찾지 못했습니다.',
    TLS_CONNECTION_FAILED: '지정한 호스트와 포트에 연결하지 못했습니다.',
    TLS_CERTIFICATE_EXPIRED: 'SSL 인증서가 만료됐습니다.',
    TLS_CERTIFICATE_NOT_YET_VALID: 'SSL 인증서의 유효 시작일 전입니다.',
    TLS_HANDSHAKE_FAILED:
      'HTTPS 보안 연결 검증에 실패했습니다. 인증서 신뢰와 도메인 일치를 확인하세요.',
    TLS_CHECK_FAILED: 'SSL 인증서 조회에 실패했습니다.',
  };
  if (certificate.message && failures[certificate.message]) {
    return failures[certificate.message];
  }
  if (certificate.days_remaining == null) {
    return '아직 인증서가 수집되지 않았습니다.';
  }
  if (certificate.status === 'DOWN') {
    return '인증서 만료가 임박했거나 갱신이 필요한 상태입니다.';
  }
  if (certificate.status === 'WARN') {
    return '인증서 만료일 또는 서명 알고리즘을 확인하세요.';
  }
  return '인증서가 유효하며, 서버 도메인과 일치하고 신뢰 검증을 통과했습니다.';
}

export function expiringCertificateIds(causes: DashboardStatusCause[]) {
  return new Set(
    causes
      .filter(
        (cause) =>
          cause.kind === 'CERTIFICATE' &&
          cause.metric_key === 'CERTIFICATE_DAYS' &&
          cause.result_code == null &&
          (cause.status === 'WARN' || cause.status === 'DOWN'),
      )
      .map((cause) => String(cause.subject_id)),
  );
}
