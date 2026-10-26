// 인스턴스 연결 정보와 수집 주기 관리 화면
import { ProTable, type ProColumns } from '@ant-design/pro-components';
import { Alert, Button, Input, Modal, Select, Space, Tag } from 'antd';
import { useIsMutating, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import type { Instance, InstanceUpdate, InstanceWrite } from '../../generated';
import {
  createInstance,
  deleteInstancePermanently,
  getInstances,
  getProjects,
  testInstance,
  updateInstance,
} from '../../api';
import {
  BooleanSelect,
  LabeledField,
  MutationError,
  NumberInput,
  QueryContent,
  SecretInput,
  SettingsDialog,
} from './forms';
import { useInvalidateMutation } from './useInvalidateMutation';
import {
  MAX_POLL_INTERVAL_SECONDS,
  emptyInstance,
  identifier,
  validateInstance,
} from './validation';
import { usePermissions } from '../../components/PermissionContext';
import TransportPanel from '../../components/TransportPanel';
import { DefaultService, TransportMode } from '../../generated';
import { useProjectScope } from '../../components/ProjectScope';

export default function InstanceSettingsTab() {
  const { project: scopedProject } = useProjectScope();
  const { canWrite, isAdmin } = usePermissions();
  const [projectId, setProjectId] = useState(scopedProject);
  const [value, setValue] = useState<InstanceWrite>(emptyInstance());
  const [validation, setValidation] = useState<string>();
  const projects = useQuery({ queryKey: ['projects'], queryFn: getProjects });
  const enabledProjects = useMemo(
    () =>
      [...(projects.data?.items ?? [])]
        .filter((project) => project.enabled)
        .sort((left, right) => left.project_id.localeCompare(right.project_id)),
    [projects.data?.items],
  );
  useEffect(() => {
    if (projects.data && !enabledProjects.some((project) => project.project_id === projectId)) {
      setProjectId(enabledProjects[0]?.project_id ?? '');
    }
  }, [enabledProjects, projectId]);
  const query = useQuery({
    queryKey: ['instances', projectId],
    queryFn: () => getInstances(projectId),
    enabled: Boolean(projectId),
  });
  const [creating, setCreating] = useState(false);
  const create = useInvalidateMutation(
    () => createInstance(projectId, value),
    ['instances', projectId],
    () => setCreating(false),
  );

  function openCreate() {
    create.reset();
    setValue(emptyInstance());
    setValidation(undefined);
    setCreating(true);
  }

  function createCurrent() {
    const error = !identifier(projectId)
      ? '사용할 프로젝트를 선택하세요.'
      : validateInstance(value, true);
    setValidation(error);
    if (!error) {
      create.mutate(undefined);
    }
  }

  return (
    <>
      <Space wrap role="group" aria-label="인스턴스 등록 작업">
        <LabeledField id="instance-project-id" label="소속 프로젝트">
          <Select
            id="instance-project-id"
            aria-label="소속 프로젝트"
            value={projectId || undefined}
            onChange={setProjectId}
            disabled={projects.isPending || projects.isError}
            placeholder={
              projects.isPending
                ? '프로젝트 불러오는 중…'
                : projects.isError
                  ? '프로젝트를 불러오지 못했습니다'
                  : enabledProjects.length === 0
                    ? '사용 가능한 프로젝트가 없습니다'
                    : '프로젝트 선택'
            }
            options={enabledProjects.map((project) => ({
              value: project.project_id,
              label: `${project.display_name} (${project.project_id})`,
            }))}
          />
        </LabeledField>
        <Button type="primary" onClick={openCreate} disabled={!projectId || !canWrite}>
          등록
        </Button>
      </Space>
      <SettingsDialog
        id="create-instance"
        title="인스턴스 등록"
        submitLabel="등록"
        submitAriaLabel="인스턴스 등록 확인"
        isOpen={creating}
        isPending={create.isPending}
        onClose={() => setCreating(false)}
        onSubmit={createCurrent}
        validation={validation}
        failed={create.isError}
        error={create.error}
      >
        <LabeledField id="instance-id" label="인스턴스 ID" help="예: live-01">
          <Input
            id="instance-id"
            aria-label="인스턴스 ID"
            value={value.instanceId}
            onChange={(event) => setValue({ ...value, instanceId: event.target.value })}
            minLength={2}
            maxLength={64}
            required
          />
        </LabeledField>
        <LabeledField id="instance-display-name" label="표시명" help="앞뒤 공백 없이 1~120자">
          <Input
            id="instance-display-name"
            aria-label="인스턴스 표시명"
            value={value.displayName}
            onChange={(event) => setValue({ ...value, displayName: event.target.value })}
            required
          />
        </LabeledField>
        <LabeledField id="instance-environment" label="환경" help="예: production, 최대 40자">
          <Input
            id="instance-environment"
            aria-label="인스턴스 환경"
            value={value.environment ?? ''}
            onChange={(event) => setValue({ ...value, environment: event.target.value })}
          />
        </LabeledField>
        <LabeledField
          id="instance-agent-url"
          label="Collector Base URL"
          help="예: https://agent.example.com, 최대 500자"
        >
          <Input
            id="instance-agent-url"
            aria-label="Collector Base URL"
            value={value.agentBaseUrl}
            onChange={(event) => setValue({ ...value, agentBaseUrl: event.target.value })}
            required
          />
        </LabeledField>
        <SecretInput
          id="instance-token"
          value={value.token}
          help="32 UTF-8 bytes 이상의 등록용 토큰"
          onChange={(token) => setValue({ ...value, token })}
        />
        <NumberInput
          id="instance-poll-interval"
          label="폴링 간격(초)"
          ariaLabel="새 인스턴스 폴링 간격"
          help="15초 이상으로 설정하세요."
          min={15}
          max={MAX_POLL_INTERVAL_SECONDS}
          value={value.pollIntervalSeconds}
          onChange={(pollIntervalSeconds) => setValue({ ...value, pollIntervalSeconds })}
        />
        <BooleanSelect
          id="create-api-enabled"
          label="API 자동 점검"
          value={value.apiChecksEnabled}
          falseLabel="사용 안 함"
          trueLabel="사용"
          falseFirst
          help="이 인스턴스의 API 자동 실행을 허용합니다. 각 API의 사용 여부와 주기는 API 모니터링에서 설정합니다."
          onChange={(apiChecksEnabled) => setValue({ ...value, apiChecksEnabled })}
        />
        <BooleanSelect
          id="create-instance-enabled"
          label="수집 상태"
          value={value.enabled}
          trueLabel="사용"
          falseLabel="중지"
          help="중지하면 폴링을 멈추지만 기존 수집 데이터는 유지합니다."
          onChange={(enabled) => setValue({ ...value, enabled })}
        />
      </SettingsDialog>
      <QueryContent query={query} empty={(query.data?.items.length ?? 0) === 0}>
        <ProTable<Instance>
          aria-label="인스턴스 설정"
          rowKey="instance_id"
          dataSource={query.data?.items ?? []}
          columns={
            [
              { title: '인스턴스', dataIndex: 'instance_id' },
              { title: '표시명', dataIndex: 'display_name' },
              { title: '환경', render: (_, item) => item.environment || '—' },
              { title: 'Collector Base URL', render: (_, item) => item.agent_base_url || '—' },
              { title: '폴링 간격(초)', render: (_, item) => item.poll_interval_seconds ?? '—' },
              {
                title: 'API 자동 점검',
                render: (_, item) => (
                  <Tag color={item.api_checks_enabled ? 'green' : 'default'}>
                    {item.api_checks_enabled ? '사용' : '사용 안 함'}
                  </Tag>
                ),
              },
              {
                title: '수집 상태',
                render: (_, item) => (
                  <Tag color={item.enabled ? 'green' : 'default'}>
                    {item.enabled ? '사용' : '중지'}
                  </Tag>
                ),
              },
              {
                title: '작업',
                valueType: 'option',
                render: (_, item) => (
                  <InstanceRow
                    key={item.instance_id}
                    projectId={projectId}
                    instance={item}
                    canWrite={canWrite}
                    isAdmin={isAdmin}
                  />
                ),
              },
            ] as ProColumns<Instance>[]
          }
          search={false}
          options={false}
          pagination={false}
          scroll={{ x: 'max-content' }}
        />
      </QueryContent>
    </>
  );
}

function currentDraft(instance: Instance): InstanceUpdate {
  return {
    instanceId: instance.instance_id,
    displayName: instance.display_name,
    environment: instance.environment,
    agentBaseUrl: instance.agent_base_url ?? '',
    token: '',
    apiChecksEnabled: instance.api_checks_enabled ?? false,
    pollIntervalSeconds: instance.poll_interval_seconds ?? 15,
    enabled: instance.enabled ?? true,
  };
}

function InstanceRow({
  projectId,
  instance,
  canWrite,
  isAdmin,
}: {
  projectId: string;
  instance: Instance;
  canWrite: boolean;
  isAdmin: boolean;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [editing, setEditing] = useState(false);
  const client = useQueryClient();
  const [collectionMode, setCollectionMode] = useState<TransportMode.mode>();
  const [xlogEnabled, setXlogEnabled] = useState<boolean>();
  const connection = useQuery({
    queryKey: ['connection', projectId, instance.instance_id],
    queryFn: () => DefaultService.getConnection({ projectId, instanceId: instance.instance_id }),
    enabled: editing,
    retry: false,
  });
  const xlog = useQuery({
    queryKey: ['xlog-settings', projectId],
    queryFn: () => DefaultService.getXlogSettings({ projectId }),
    enabled: editing,
    retry: false,
  });
  const [draft, setDraft] = useState<InstanceUpdate>(() => currentDraft(instance));
  const [validation, setValidation] = useState<string>();
  const connectionChanging =
    useIsMutating({
      mutationKey: ['connection-change', projectId, instance.instance_id],
    }) > 0;
  const collectionChanged =
    JSON.stringify(draft) !== JSON.stringify(currentDraft(instance)) ||
    (collectionMode !== undefined && collectionMode !== connection.data?.mode) ||
    (xlogEnabled !== undefined && xlogEnabled !== xlog.data?.enabled);
  const selectedMode = collectionMode ?? connection.data?.mode;
  const save = useMutation({
    mutationKey: ['connection-change', projectId, instance.instance_id],
    mutationFn: async () => {
      await updateInstance(projectId, instance.instance_id, {
        ...draft,
        token: draft.token || null,
      });

      if (collectionMode !== undefined && collectionMode !== connection.data?.mode) {
        await DefaultService.saveConnectionMode({
          projectId,
          instanceId: instance.instance_id,
          requestBody: { mode: collectionMode },
        });
      }
      if (xlogEnabled !== undefined && xlogEnabled !== xlog.data?.enabled) {
        await DefaultService.saveXlogSettings({ projectId, requestBody: { enabled: xlogEnabled } });
      }
    },
    onSuccess: async () => {
      await Promise.all([
        client.invalidateQueries({ queryKey: ['instances', projectId] }),
        client.invalidateQueries({ queryKey: ['connection', projectId] }),
        client.invalidateQueries({ queryKey: ['xlog-settings', projectId] }),
      ]);
      setDraft((current) => ({ ...current, token: '' }));
      setEditing(false);
    },
  });

  function openEdit() {
    setDraft(currentDraft(instance));
    setCollectionMode(undefined);
    setXlogEnabled(undefined);
    setValidation(undefined);
    save.reset();
    setEditing(true);
  }
  const connectionTest = useMutation({
    mutationFn: () => testInstance(projectId, instance.instance_id),
  });
  const connectionError = connectionErrorMessage(connectionTest.data, connectionTest.error);

  const permanentDelete = useInvalidateMutation(
    () => deleteInstancePermanently(projectId, instance.instance_id),
    ['instances', projectId],
    () => setConfirmDelete(false),
  );

  function saveCurrent() {
    const error = validateInstance(draft, false);
    setValidation(error);
    if (!error) {
      save.mutate();
    }
  }

  return (
    <>
      <Space wrap>
        {canWrite && (
          <Button
            loading={connectionTest.isPending}
            disabled={connectionTest.isPending}
            onClick={() => connectionTest.mutate()}
          >
            연결
          </Button>
        )}
        {canWrite && (
          <Button aria-label={`인스턴스 ${instance.instance_id} 수정`} onClick={openEdit}>
            수정
          </Button>
        )}
        {isAdmin && (
          <Button
            danger
            aria-label={`인스턴스 ${instance.instance_id} 삭제`}
            onClick={() => setConfirmDelete(true)}
          >
            삭제
          </Button>
        )}
        <SettingsDialog
          id={`edit-instance-${instance.instance_id}`}
          title="인스턴스 수정"
          submitLabel="저장"
          submitAriaLabel={`인스턴스 ${instance.instance_id} 저장`}
          isOpen={editing}
          isPending={save.isPending || connectionChanging}
          submitDisabled={!connection.data || !xlog.data}
          onClose={() => setEditing(false)}
          onSubmit={saveCurrent}
          validation={validation}
          failed={save.isError}
          error={save.error}
        >
          <LabeledField id={`instance-${instance.instance_id}-id`} label="인스턴스 ID">
            <Input
              id={`instance-${instance.instance_id}-id`}
              aria-label="인스턴스 ID"
              value={instance.instance_id}
              readOnly
            />
          </LabeledField>
          <LabeledField
            id={`instance-${instance.instance_id}-display-name`}
            label="표시명"
            help="앞뒤 공백 없이 1~120자"
          >
            <Input
              id={`instance-${instance.instance_id}-display-name`}
              aria-label={`인스턴스 ${instance.instance_id} 표시명`}
              value={draft.displayName}
              onChange={(event) => setDraft({ ...draft, displayName: event.target.value })}
            />
          </LabeledField>
          <LabeledField
            id={`instance-${instance.instance_id}-environment`}
            label="환경"
            help="최대 40자"
          >
            <Input
              id={`instance-${instance.instance_id}-environment`}
              aria-label={`인스턴스 ${instance.instance_id} 환경`}
              value={draft.environment ?? ''}
              onChange={(event) => setDraft({ ...draft, environment: event.target.value })}
            />
          </LabeledField>
          <LabeledField
            id={`instance-${instance.instance_id}-agent-url`}
            label="Collector Base URL"
            help="최대 500자"
          >
            <Input
              id={`instance-${instance.instance_id}-agent-url`}
              aria-label={`인스턴스 ${instance.instance_id} Base URL`}
              value={draft.agentBaseUrl}
              onChange={(event) => setDraft({ ...draft, agentBaseUrl: event.target.value })}
            />
          </LabeledField>
          <SecretInput
            id={`instance-${instance.instance_id}-token`}
            value={draft.token ?? ''}
            onChange={(token) => setDraft({ ...draft, token })}
            label="새 토큰"
            help="비워 두면 기존 토큰 유지, 변경 시 32 UTF-8 bytes 이상"
            required={false}
          />
          <LabeledField
            id={`instance-${instance.instance_id}-collection-mode`}
            label="수집 방식"
            help="웹소켓 연결은 설정 저장 후 별도로 시작합니다."
          >
            <Select
              id={`instance-${instance.instance_id}-collection-mode`}
              aria-label="수집 방식"
              value={collectionMode ?? connection.data?.mode ?? 'HTTP'}
              disabled={!connection.data || save.isPending || connectionChanging}
              onChange={(mode) => setCollectionMode(mode as TransportMode.mode)}
              options={[
                { value: 'HTTP', label: 'HTTP 조회' },
                { value: 'WSS', label: '웹소켓 연결' },
              ]}
            />
          </LabeledField>
          {editing && selectedMode === 'WSS' && (
            <div>
              <span>웹소켓 연결</span>
              {connection.data?.mode === 'WSS' ? (
                <TransportPanel
                  projectId={projectId}
                  instanceId={instance.instance_id}
                  compact
                  isDisabled={save.isPending || collectionChanged}
                />
              ) : (
                <span role="status">연결 대기</span>
              )}
              <span className="field-help">
                {collectionChanged
                  ? '변경 내용을 저장한 뒤 수정 창을 다시 열어 연결을 시작하세요.'
                  : '연결 시작·종료는 즉시 적용됩니다.'}
              </span>
            </div>
          )}
          <LabeledField
            id={`instance-${instance.instance_id}-xlog`}
            label="XLog 수집"
            help="프로젝트 공통 설정으로, 같은 프로젝트의 연결된 웹소켓 인스턴스 전체에 적용됩니다."
          >
            <Select
              id={`instance-${instance.instance_id}-xlog`}
              aria-label="XLog 수집"
              value={(xlogEnabled ?? xlog.data?.enabled) ? 'on' : 'off'}
              disabled={!xlog.data || save.isPending}
              onChange={(value) => setXlogEnabled(value === 'on')}
              options={[
                { value: 'off', label: '사용 안 함' },
                { value: 'on', label: '사용' },
              ]}
            />
          </LabeledField>
          {(connection.isError || xlog.isError) && (
            <p role="alert">수집 설정을 불러오지 못했습니다. 창을 다시 열어 시도하세요.</p>
          )}
          <NumberInput
            id={`instance-${instance.instance_id}-poll-interval`}
            label="폴링 간격(초)"
            ariaLabel={`인스턴스 ${instance.instance_id} 폴링 간격`}
            help="15초 이상"
            min={15}
            max={MAX_POLL_INTERVAL_SECONDS}
            value={draft.pollIntervalSeconds}
            onChange={(pollIntervalSeconds) => setDraft({ ...draft, pollIntervalSeconds })}
          />
          <BooleanSelect
            id={`instance-${instance.instance_id}-api-checks`}
            label="API 자동 점검"
            ariaLabel={`인스턴스 ${instance.instance_id} API 자동 점검`}
            value={draft.apiChecksEnabled}
            falseLabel="사용 안 함"
            trueLabel="사용"
            falseFirst
            help="이 인스턴스의 API 자동 실행을 허용합니다. 각 API의 사용 여부와 주기는 API 모니터링에서 설정합니다."
            onChange={(apiChecksEnabled) => setDraft({ ...draft, apiChecksEnabled })}
          />
          <BooleanSelect
            id={`instance-${instance.instance_id}-enabled`}
            label="수집 상태"
            ariaLabel={`인스턴스 ${instance.instance_id} 수집 상태`}
            value={draft.enabled}
            trueLabel="사용"
            falseLabel="중지"
            help="중지하면 폴링을 멈추지만 기존 수집 데이터는 유지합니다."
            onChange={(enabled) => setDraft({ ...draft, enabled })}
          />
          {save.isError && (
            <p role="alert">
              일부 항목은 이미 저장됐을 수 있습니다. 값을 확인한 뒤 다시 저장하세요.
            </p>
          )}
        </SettingsDialog>
        <Modal
          title={`인스턴스 ${instance.instance_id} 영구 삭제`}
          open={confirmDelete}
          destroyOnHidden
          transitionName=""
          maskTransitionName=""
          mask={{ closable: false }}
          closable={false}
          keyboard={!permanentDelete.isPending}
          onCancel={() => {
            if (!permanentDelete.isPending) {
              setConfirmDelete(false);
            }
          }}
          footer={
            <Space>
              <Button disabled={permanentDelete.isPending} onClick={() => setConfirmDelete(false)}>
                취소
              </Button>
              {isAdmin && (
                <Button
                  danger
                  type="primary"
                  aria-label={`인스턴스 ${instance.instance_id} 영구 삭제 확인`}
                  loading={permanentDelete.isPending}
                  disabled={permanentDelete.isPending}
                  onClick={() => permanentDelete.mutate(undefined)}
                >
                  영구 삭제
                </Button>
              )}
            </Space>
          }
        >
          <p>이 인스턴스의 모든 기록과 설정이 삭제되며 복구할 수 없습니다.</p>
          <MutationError failed={permanentDelete.isError} error={permanentDelete.error} />
        </Modal>
      </Space>
      {!connectionTest.isPending &&
        (connectionTest.data || connectionTest.error) &&
        (connectionError ? (
          <Alert
            type="error"
            title={`${instance.instance_id} · 연결 테스트 실패`}
            description={connectionError}
          />
        ) : (
          <Alert type="success" title="연결 테스트에 성공했습니다." />
        ))}
    </>
  );
}

const CONNECTION_MESSAGES: Record<string, string> = {
  ALLOWLIST_CONFIG_ERROR:
    '접속 허용 목록 파일을 읽을 수 없습니다. 파일 위치와 JSON 형식을 확인하세요.',
  ADDRESS_NOT_ALLOWED:
    '보안 정책상 허용되지 않은 주소입니다. 허용 도메인 또는 CIDR과 Collector URL을 확인하세요.',
  AUTH_ERROR: '인증에 실패했습니다. Collector 토큰을 다시 확인하세요.',
  REDIRECT_REJECTED: 'Collector가 리디렉션을 반환했습니다. 최종 HTTPS URL을 직접 입력하세요.',
  AGENT_TIMEOUT: 'Collector 응답 시간이 초과되었습니다. 네트워크와 Collector 상태를 확인하세요.',
  AGENT_HTTP_ERROR:
    'Collector가 올바른 HTTP 응답을 반환하지 않았습니다. Collector 로그를 확인하세요.',
  IDENTITY_MISMATCH:
    'Collector 식별자가 등록 정보와 다릅니다. 프로젝트와 인스턴스 설정을 확인하세요.',
  TLS_ERROR: 'TLS 연결에 실패했습니다. 인증서와 호스트 이름을 확인하세요.',
  DNS_ERROR: 'Collector 호스트를 찾을 수 없습니다. DNS와 URL을 확인하세요.',
  CONNECTION_ERROR: 'Collector에 연결할 수 없습니다. 주소, 포트, 방화벽을 확인하세요.',
};

function connectionErrorMessage(data: unknown, error: unknown) {
  const resultCode = (data as { code?: string } | undefined)?.code;
  const responseCode = (error as { body?: { code?: string } } | undefined)?.body?.code;
  const code = resultCode ?? responseCode;
  if (code) {
    return CONNECTION_MESSAGES[code] ?? CONNECTION_MESSAGES.CONNECTION_ERROR;
  }
  return error ? CONNECTION_MESSAGES.CONNECTION_ERROR : undefined;
}
