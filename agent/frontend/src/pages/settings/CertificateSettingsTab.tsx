// 인증서 검사 대상 및 주기 관리 화면
import { Button, FormSelect, FormSelectOption, TextInput } from '../../components/ui';
import { Table, Tbody, Td, Th, Thead, Tr } from '../../components/ui';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import type { Certificate, CertificateWrite } from '../../generated';
import { createCertificate, getCertificates, getProjects, updateCertificate } from '../../api';
import {
  BooleanSelect,
  LabeledField,
  NumberInput,
  QueryContent,
  ReadonlyValue,
  SettingsDialog,
} from './forms';
import { useInvalidateMutation } from './useInvalidateMutation';
import { emptyCertificate, validateCertificate } from './validation';

export default function CertificateSettingsTab() {
  const query = useQuery({ queryKey: ['certificates', {}], queryFn: () => getCertificates() });
  const projects = useQuery({ queryKey: ['projects'], queryFn: getProjects });
  const [value, setValue] = useState<CertificateWrite>(emptyCertificate());
  const [validation, setValidation] = useState<string>();
  const [creating, setCreating] = useState(false);
  const create = useInvalidateMutation(createCertificate, ['certificates'], () =>
    setCreating(false),
  );

  function openCreate() {
    setValue(emptyCertificate());
    setValidation(undefined);
    setCreating(true);
  }

  function createCurrent() {
    const error = validateCertificate(value);
    setValidation(error);
    if (!error) {
      create.mutate(value);
    }
  }

  return (
    <>
      <div className="settings-toolbar">
        <Button onClick={openCreate} aria-label="인증서 대상 등록">
          등록
        </Button>
      </div>
      <SettingsDialog
        id="create-certificate"
        title="인증서 대상 등록"
        submitLabel="등록"
        submitAriaLabel="인증서 대상 등록 확인"
        isOpen={creating}
        isPending={create.isPending}
        submitDisabled={!value.projectId}
        onClose={() => setCreating(false)}
        onSubmit={createCurrent}
        validation={validation}
        failed={create.isError}
      >
        <LabeledField id="certificate-project" label="프로젝트">
          <ProjectSelect
            id="certificate-project"
            ariaLabel="인증서 프로젝트"
            value={value.projectId}
            onChange={(projectId) => setValue({ ...value, projectId })}
            projects={projects}
          />
        </LabeledField>
        <LabeledField id="certificate-hostname" label="호스트" help="예: api.example.com">
          <TextInput
            id="certificate-hostname"
            aria-label="인증서 호스트"
            value={value.hostname}
            onChange={(_, hostname) => setValue({ ...value, hostname, sniHostname: hostname })}
            required
          />
        </LabeledField>
        <NumberInput
          id="certificate-port"
          label="포트"
          ariaLabel="인증서 포트"
          value={value.port}
          onChange={(port) => setValue({ ...value, port })}
        />
        <LabeledField id="certificate-sni" label="SNI 호스트">
          <TextInput
            id="certificate-sni"
            aria-label="SNI 호스트"
            value={value.sniHostname}
            onChange={(_, sniHostname) => setValue({ ...value, sniHostname })}
            required
          />
        </LabeledField>
        <NumberInput
          id="certificate-check-interval"
          label="점검 간격(분)"
          ariaLabel="새 인증서 점검 간격"
          help="1분 이상"
          min={1}
          value={value.checkIntervalMinutes}
          onChange={(checkIntervalMinutes) => setValue({ ...value, checkIntervalMinutes })}
        />
        <BooleanSelect
          id="create-certificate-enabled"
          label="대상 상태"
          value={value.enabled}
          trueLabel="사용"
          falseLabel="중지"
          help="중지하면 인증서 점검을 멈추지만 기존 결과는 유지합니다."
          onChange={(enabled) => setValue({ ...value, enabled })}
        />
      </SettingsDialog>
      <QueryContent query={query} empty={(query.data?.items.length ?? 0) === 0}>
        <div className="settings-table-scroll">
          <Table className="settings-table" variant="compact" aria-label="인증서 대상 설정">
            <Thead>
              <Tr>
                <Th>프로젝트</Th>
                <Th>호스트</Th>
                <Th>SNI 호스트</Th>
                <Th>포트</Th>
                <Th>점검 간격(분)</Th>
                <Th>대상 상태</Th>
                <Th>작업</Th>
              </Tr>
            </Thead>
            <Tbody>
              {query.data?.items.map((certificate) => (
                <CertificateRow
                  key={certificate.certificate_target_id}
                  certificate={certificate}
                  projects={projects}
                />
              ))}
            </Tbody>
          </Table>
        </div>
      </QueryContent>
    </>
  );
}

function CertificateRow({
  certificate,
  projects,
}: {
  certificate: Certificate;
  projects: ReturnType<typeof useQuery<Awaited<ReturnType<typeof getProjects>>>>;
}) {
  const [draft, setDraft] = useState<CertificateWrite>({
    projectId: certificate.project_id,
    hostname: certificate.hostname,
    port: certificate.port,
    sniHostname: certificate.sni_hostname,
    enabled: certificate.enabled,
    checkIntervalMinutes: certificate.check_interval_minutes ?? 360,
  });
  const [validation, setValidation] = useState<string>();
  const [editing, setEditing] = useState(false);
  const save = useInvalidateMutation(
    () => updateCertificate(certificate.certificate_target_id, draft),
    ['certificates'],
    () => setEditing(false),
  );

  function openEdit() {
    setDraft({
      projectId: certificate.project_id,
      hostname: certificate.hostname,
      port: certificate.port,
      sniHostname: certificate.sni_hostname,
      enabled: certificate.enabled,
      checkIntervalMinutes: certificate.check_interval_minutes ?? 360,
    });
    setValidation(undefined);
    setEditing(true);
  }

  function saveCurrent() {
    const error = validateCertificate(draft);
    setValidation(error);
    if (!error) {
      save.mutate(undefined);
    }
  }

  return (
    <Tr>
      <Td>
        <ReadonlyValue>{certificate.project_id}</ReadonlyValue>
      </Td>
      <Td>
        <ReadonlyValue>{certificate.hostname}</ReadonlyValue>
      </Td>
      <Td>
        <ReadonlyValue>{certificate.sni_hostname}</ReadonlyValue>
      </Td>
      <Td>
        <ReadonlyValue>{certificate.port}</ReadonlyValue>
      </Td>
      <Td>
        <ReadonlyValue>{certificate.check_interval_minutes}</ReadonlyValue>
      </Td>
      <Td>
        <ReadonlyValue>{certificate.enabled ? '사용' : '중지'}</ReadonlyValue>
      </Td>
      <Td>
        <div className="settings-row-actions">
          <Button
            variant="secondary"
            aria-label={`인증서 ${certificate.certificate_target_id} 수정`}
            onClick={openEdit}
          >
            수정
          </Button>
        </div>
        <SettingsDialog
          id={`edit-certificate-${certificate.certificate_target_id}`}
          title={`인증서 대상 ${certificate.hostname} 수정`}
          submitLabel="저장"
          submitAriaLabel={`인증서 ${certificate.certificate_target_id} 저장`}
          isOpen={editing}
          isPending={save.isPending}
          onClose={() => setEditing(false)}
          onSubmit={saveCurrent}
          validation={validation}
          failed={save.isError}
          error={save.error}
        >
          <LabeledField
            id={`certificate-${certificate.certificate_target_id}-project`}
            label={`프로젝트 ID (${certificate.certificate_target_id})`}
          >
            <ProjectSelect
              id={`certificate-${certificate.certificate_target_id}-project`}
              ariaLabel={`인증서 ${certificate.certificate_target_id} 프로젝트`}
              value={draft.projectId}
              onChange={(projectId) => setDraft({ ...draft, projectId })}
              projects={projects}
              preserveCurrent
            />
          </LabeledField>
          <LabeledField
            id={`certificate-${certificate.certificate_target_id}-host`}
            label={`호스트 (${certificate.certificate_target_id})`}
          >
            <TextInput
              id={`certificate-${certificate.certificate_target_id}-host`}
              aria-label={`인증서 ${certificate.certificate_target_id} 호스트`}
              value={draft.hostname}
              onChange={(_, hostname) => setDraft({ ...draft, hostname })}
            />
          </LabeledField>
          <LabeledField
            id={`certificate-${certificate.certificate_target_id}-sni`}
            label={`SNI 호스트 (${certificate.certificate_target_id})`}
          >
            <TextInput
              id={`certificate-${certificate.certificate_target_id}-sni`}
              aria-label={`인증서 ${certificate.certificate_target_id} SNI`}
              value={draft.sniHostname}
              onChange={(_, sniHostname) => setDraft({ ...draft, sniHostname })}
            />
          </LabeledField>
          <NumberInput
            id={`certificate-${certificate.certificate_target_id}-port`}
            label={`포트 (${certificate.certificate_target_id})`}
            ariaLabel={`인증서 ${certificate.certificate_target_id} 포트`}
            value={draft.port}
            onChange={(port) => setDraft({ ...draft, port })}
          />
          <NumberInput
            id={`certificate-${certificate.certificate_target_id}-check-interval`}
            label={`점검 간격(분) (${certificate.certificate_target_id})`}
            ariaLabel={`인증서 ${certificate.certificate_target_id} 점검 간격`}
            help="1분 이상"
            min={1}
            value={draft.checkIntervalMinutes}
            onChange={(checkIntervalMinutes) => setDraft({ ...draft, checkIntervalMinutes })}
          />
          <BooleanSelect
            id={`certificate-${certificate.certificate_target_id}-enabled`}
            label="대상 상태"
            ariaLabel={`인증서 ${certificate.certificate_target_id} 대상 상태`}
            value={draft.enabled}
            trueLabel="사용"
            falseLabel="중지"
            help="중지하면 기존 결과는 유지합니다."
            onChange={(enabled) => setDraft({ ...draft, enabled })}
          />
        </SettingsDialog>
      </Td>
    </Tr>
  );
}

function ProjectSelect({
  id,
  ariaLabel,
  value,
  onChange,
  projects,
  preserveCurrent = false,
}: {
  id: string;
  ariaLabel: string;
  value: string;
  onChange: (value: string) => void;
  projects: ReturnType<typeof useQuery<Awaited<ReturnType<typeof getProjects>>>>;
  preserveCurrent?: boolean;
}) {
  const items = projects.data?.items ?? [];
  const currentMissing = Boolean(value) && !items.some((project) => project.project_id === value);
  return (
    <FormSelect
      id={id}
      aria-label={ariaLabel}
      value={value}
      onChange={(_, next) => onChange(next)}
      isDisabled={projects.isPending || projects.isError}
    >
      <FormSelectOption
        value=""
        label={
          projects.isPending
            ? '프로젝트 불러오는 중…'
            : projects.isError
              ? '프로젝트를 불러오지 못했습니다'
              : items.length === 0
                ? '등록된 프로젝트가 없습니다'
                : '프로젝트 선택'
        }
      />
      {currentMissing && preserveCurrent && (
        <FormSelectOption value={value} label={`${value} (현재 프로젝트)`} />
      )}
      {items.map((project) => (
        <FormSelectOption
          key={project.project_id}
          value={project.project_id}
          label={`${project.display_name} (${project.project_id})${project.enabled ? '' : ' - 비활성'}`}
          isDisabled={!project.enabled && project.project_id !== value}
        />
      ))}
    </FormSelect>
  );
}
