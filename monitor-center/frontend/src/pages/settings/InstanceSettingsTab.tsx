// 인스턴스 연결 정보와 수집 주기 관리 화면
import {
  Alert,
  Button,
  FormSelect,
  FormSelectOption,
  Label,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  ModalVariant,
  TextInput,
} from '../../components/ui';
import { Table, Tbody, Td, Th, Thead, Tr } from '../../components/ui';
import { useMutation, useQuery } from '@tanstack/react-query';
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
  ReadonlyValue,
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

export default function InstanceSettingsTab() {
  const [projectId, setProjectId] = useState('');
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
    if (!enabledProjects.some((project) => project.project_id === projectId)) {
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
      <div className="settings-toolbar">
        <LabeledField id="instance-project-id" label="소속 프로젝트">
          <FormSelect
            id="instance-project-id"
            aria-label="소속 프로젝트"
            value={projectId}
            onChange={(_, next) => setProjectId(next)}
            isDisabled={projects.isPending || projects.isError}
          >
            <FormSelectOption
              value=""
              label={
                projects.isPending
                  ? '프로젝트 불러오는 중…'
                  : projects.isError
                    ? '프로젝트를 불러오지 못했습니다'
                    : enabledProjects.length === 0
                      ? '사용 가능한 프로젝트가 없습니다'
                      : '프로젝트 선택'
              }
            />
            {enabledProjects.map((project) => (
              <FormSelectOption
                key={project.project_id}
                value={project.project_id}
                label={`${project.display_name} (${project.project_id})`}
              />
            ))}
          </FormSelect>
        </LabeledField>
        <Button onClick={openCreate} isDisabled={!projectId}>
          등록
        </Button>
      </div>
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
          <TextInput
            id="instance-id"
            aria-label="인스턴스 ID"
            value={value.instanceId}
            onChange={(_, instanceId) => setValue({ ...value, instanceId })}
            minLength={2}
            maxLength={64}
            required
          />
        </LabeledField>
        <LabeledField id="instance-display-name" label="표시명" help="앞뒤 공백 없이 1~120자">
          <TextInput
            id="instance-display-name"
            aria-label="인스턴스 표시명"
            value={value.displayName}
            onChange={(_, displayName) => setValue({ ...value, displayName })}
            required
          />
        </LabeledField>
        <LabeledField id="instance-environment" label="환경" help="예: production, 최대 40자">
          <TextInput
            id="instance-environment"
            aria-label="인스턴스 환경"
            value={value.environment ?? ''}
            onChange={(_, environment) => setValue({ ...value, environment })}
          />
        </LabeledField>
        <LabeledField
          id="instance-agent-url"
          label="에이전트 Base URL"
          help="예: https://agent.example.com, 최대 500자"
        >
          <TextInput
            id="instance-agent-url"
            aria-label="에이전트 Base URL"
            value={value.agentBaseUrl}
            onChange={(_, agentBaseUrl) => setValue({ ...value, agentBaseUrl })}
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
        <div className="settings-table-scroll">
          <Table
            className="settings-table settings-instance-table"
            variant="compact"
            aria-label="인스턴스 설정"
          >
            <Thead>
              <Tr>
                <Th>인스턴스</Th>
                <Th>표시명</Th>
                <Th>환경</Th>
                <Th>에이전트 Base URL</Th>
                <Th>폴링 간격(초)</Th>
                <Th>API 자동 점검</Th>
                <Th>수집 상태</Th>
                <Th>작업</Th>
              </Tr>
            </Thead>
            <Tbody>
              {query.data?.items.map((instance) => (
                <InstanceRow key={instance.instance_id} projectId={projectId} instance={instance} />
              ))}
            </Tbody>
          </Table>
        </div>
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

function InstanceRow({ projectId, instance }: { projectId: string; instance: Instance }) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<InstanceUpdate>(() => currentDraft(instance));
  const [validation, setValidation] = useState<string>();
  const save = useInvalidateMutation(
    () => updateInstance(projectId, instance.instance_id, { ...draft, token: draft.token || null }),
    ['instances', projectId],
    () => {
      setDraft((current) => ({ ...current, token: '' }));
      setEditing(false);
    },
  );

  function openEdit() {
    setDraft(currentDraft(instance));
    setValidation(undefined);
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
      save.mutate(undefined);
    }
  }

  return (
    <>
      <Tr>
        <Td>{instance.instance_id}</Td>
        <Td>
          <ReadonlyValue>{instance.display_name}</ReadonlyValue>
        </Td>
        <Td>
          <ReadonlyValue>{instance.environment}</ReadonlyValue>
        </Td>
        <Td>
          <ReadonlyValue>{instance.agent_base_url}</ReadonlyValue>
        </Td>
        <Td>
          <ReadonlyValue>{instance.poll_interval_seconds}</ReadonlyValue>
        </Td>
        <Td>
          <Label color={instance.api_checks_enabled ? 'green' : 'grey'} isCompact>
            {instance.api_checks_enabled ? '사용' : '사용 안 함'}
          </Label>
        </Td>
        <Td>
          <Label color={instance.enabled ? 'green' : 'grey'} isCompact>
            {instance.enabled ? '사용' : '중지'}
          </Label>
        </Td>
        <Td className="settings-instance-actions">
          <div className="settings-row-actions">
            <Button
              variant="secondary"
              isLoading={connectionTest.isPending}
              isDisabled={connectionTest.isPending}
              onClick={() => connectionTest.mutate()}
            >
              연결 테스트
            </Button>
            <Button
              variant="secondary"
              aria-label={`인스턴스 ${instance.instance_id} 수정`}
              onClick={openEdit}
            >
              수정
            </Button>
            <Button
              permission="admin"
              variant="danger"
              aria-label={`인스턴스 ${instance.instance_id} 영구 삭제`}
              onClick={() => setConfirmDelete(true)}
            >
              영구 삭제
            </Button>
          </div>
          <SettingsDialog
            id={`edit-instance-${instance.instance_id}`}
            title={`인스턴스 ${instance.instance_id} 수정`}
            submitLabel="저장"
            submitAriaLabel={`인스턴스 ${instance.instance_id} 저장`}
            isOpen={editing}
            isPending={save.isPending}
            onClose={() => setEditing(false)}
            onSubmit={saveCurrent}
            validation={validation}
            failed={save.isError}
            error={save.error}
          >
            <LabeledField
              id={`instance-${instance.instance_id}-display-name`}
              label={`표시명 (${instance.instance_id})`}
              help="앞뒤 공백 없이 1~120자"
            >
              <TextInput
                id={`instance-${instance.instance_id}-display-name`}
                aria-label={`인스턴스 ${instance.instance_id} 표시명`}
                value={draft.displayName}
                onChange={(_, displayName) => setDraft({ ...draft, displayName })}
              />
            </LabeledField>
            <LabeledField
              id={`instance-${instance.instance_id}-environment`}
              label="환경"
              help="최대 40자"
            >
              <TextInput
                id={`instance-${instance.instance_id}-environment`}
                aria-label={`인스턴스 ${instance.instance_id} 환경`}
                value={draft.environment ?? ''}
                onChange={(_, environment) => setDraft({ ...draft, environment })}
              />
            </LabeledField>
            <LabeledField
              id={`instance-${instance.instance_id}-agent-url`}
              label={`에이전트 Base URL (${instance.instance_id})`}
              help="최대 500자"
            >
              <TextInput
                id={`instance-${instance.instance_id}-agent-url`}
                aria-label={`인스턴스 ${instance.instance_id} Base URL`}
                value={draft.agentBaseUrl}
                onChange={(_, agentBaseUrl) => setDraft({ ...draft, agentBaseUrl })}
              />
            </LabeledField>
            <SecretInput
              id={`instance-${instance.instance_id}-token`}
              value={draft.token ?? ''}
              onChange={(token) => setDraft({ ...draft, token })}
              label={`인스턴스 ${instance.instance_id} 새 토큰`}
              help="비워 두면 기존 토큰 유지, 변경 시 32 UTF-8 bytes 이상"
              required={false}
            />
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
          </SettingsDialog>
          <Modal
            variant={ModalVariant.small}
            aria-labelledby={`delete-instance-${instance.instance_id}`}
            isOpen={confirmDelete}
            onClose={() => {
              if (!permanentDelete.isPending) {
                setConfirmDelete(false);
              }
            }}
          >
            <ModalHeader
              title={`인스턴스 ${instance.instance_id} 영구 삭제`}
              labelId={`delete-instance-${instance.instance_id}`}
            />
            <ModalBody>
              이 인스턴스의 모든 기록과 설정이 삭제되며 복구할 수 없습니다.
              <MutationError failed={permanentDelete.isError} error={permanentDelete.error} />
            </ModalBody>
            <ModalFooter>
              <Button
                permission="admin"
                variant="danger"
                aria-label={`인스턴스 ${instance.instance_id} 영구 삭제 확인`}
                isLoading={permanentDelete.isPending}
                isDisabled={permanentDelete.isPending}
                onClick={() => permanentDelete.mutate(undefined)}
              >
                영구 삭제
              </Button>
              <Button
                variant="link"
                isDisabled={permanentDelete.isPending}
                onClick={() => setConfirmDelete(false)}
              >
                취소
              </Button>
            </ModalFooter>
          </Modal>
        </Td>
      </Tr>
      {!connectionTest.isPending && (connectionTest.data || connectionTest.error) && (
        <Tr className="settings-connection-row">
          <Td colSpan={8}>
            {connectionError ? (
              <Alert isInline variant="danger" title={`${instance.instance_id} · 연결 테스트 실패`}>
                <p>{connectionError}</p>
              </Alert>
            ) : (
              <Alert isInline variant="success" title="연결 테스트에 성공했습니다." />
            )}
          </Td>
        </Tr>
      )}
    </>
  );
}

const CONNECTION_MESSAGES: Record<string, string> = {
  ALLOWLIST_CONFIG_ERROR:
    '접속 허용 목록 파일을 읽을 수 없습니다. 파일 위치와 JSON 형식을 확인하세요.',
  ADDRESS_NOT_ALLOWED:
    '보안 정책상 허용되지 않은 주소입니다. 허용 도메인 또는 CIDR과 에이전트 URL을 확인하세요.',
  AUTH_ERROR: '인증에 실패했습니다. 에이전트 토큰을 다시 확인하세요.',
  REDIRECT_REJECTED: '에이전트가 리디렉션을 반환했습니다. 최종 HTTPS URL을 직접 입력하세요.',
  AGENT_TIMEOUT: '에이전트 응답 시간이 초과되었습니다. 네트워크와 에이전트 상태를 확인하세요.',
  AGENT_HTTP_ERROR:
    '에이전트가 올바른 HTTP 응답을 반환하지 않았습니다. 에이전트 로그를 확인하세요.',
  IDENTITY_MISMATCH:
    '에이전트 식별자가 등록 정보와 다릅니다. 프로젝트와 인스턴스 설정을 확인하세요.',
  TLS_ERROR: 'TLS 연결에 실패했습니다. 인증서와 호스트 이름을 확인하세요.',
  DNS_ERROR: '에이전트 호스트를 찾을 수 없습니다. DNS와 URL을 확인하세요.',
  CONNECTION_ERROR: '에이전트에 연결할 수 없습니다. 주소, 포트, 방화벽을 확인하세요.',
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
