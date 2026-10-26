// 인증서 검사 대상 및 주기 관리 화면
import { ProForm, ProTable, type ProColumns } from '@ant-design/pro-components';
import { Alert, Button, Form, Input, Modal, Select, Space } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import type { Certificate, CertificateWrite } from '../../generated';
import { createCertificate, getCertificates, getProjects, updateCertificate } from '../../api';
import { QueryContent } from './forms';
import { useInvalidateMutation } from './useInvalidateMutation';
import { emptyCertificate, validateCertificate } from './validation';
import { useProjectScope } from '../../components/ProjectScope';
import { usePermissions } from '../../components/PermissionContext';

export default function CertificateSettingsTab() {
  const { canWrite } = usePermissions();
  const { project } = useProjectScope();
  const query = useQuery({
    queryKey: ['certificates', { project }],
    queryFn: () => getCertificates({ project }),
  });
  const projects = useQuery({ queryKey: ['projects'], queryFn: getProjects });
  const [value, setValue] = useState<CertificateWrite>(emptyCertificate());
  const [validation, setValidation] = useState<string>();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Certificate>();
  const create = useInvalidateMutation(createCertificate, ['certificates'], () =>
    setCreating(false),
  );
  const save = useInvalidateMutation(
    (draft: CertificateWrite) => updateCertificate(editing!.certificate_target_id, draft),
    ['certificates'],
    () => setEditing(undefined),
  );

  function openCreate() {
    setValue(emptyCertificate());
    setValidation(undefined);
    setCreating(true);
  }

  function openEdit(certificate: Certificate) {
    setValue({
      projectId: certificate.project_id,
      hostname: certificate.hostname,
      port: certificate.port,
      sniHostname: certificate.sni_hostname,
      enabled: certificate.enabled,
      checkIntervalMinutes: certificate.check_interval_minutes ?? 360,
    });
    setValidation(undefined);
    setEditing(certificate);
  }

  function submit() {
    const error = validateCertificate(value);
    setValidation(error);
    if (error) return;
    if (creating) create.mutate(value);
    else if (editing) save.mutate(value);
  }

  const pending = create.isPending || save.isPending;
  const columns: ProColumns<Certificate>[] = [
    { title: '프로젝트', dataIndex: 'project_id' },
    { title: '호스트', dataIndex: 'hostname' },
    { title: 'SNI 호스트', dataIndex: 'sni_hostname' },
    { title: '포트', dataIndex: 'port' },
    { title: '점검 간격(분)', dataIndex: 'check_interval_minutes' },
    {
      title: '대상 상태',
      dataIndex: 'enabled',
      renderText: (enabled) => (enabled ? '사용' : '중지'),
    },
    {
      title: '작업',
      valueType: 'option',
      hideInTable: !canWrite,
      render: (_, certificate) => (
        <Button
          aria-label={`인증서 ${certificate.certificate_target_id} 수정`}
          onClick={() => openEdit(certificate)}
        >
          수정
        </Button>
      ),
    },
  ];

  return (
    <>
      {canWrite && (
        <Button type="primary" onClick={openCreate} aria-label="인증서 대상 등록">
          등록
        </Button>
      )}
      <Modal
        open={creating || Boolean(editing)}
        title={creating ? '인증서 대상 등록' : '인증서 대상 수정'}
        closable={false}
        mask={{ closable: false }}
        destroyOnHidden
        transitionName=""
        maskTransitionName=""
        footer={null}
        onCancel={() => {
          setCreating(false);
          setEditing(undefined);
        }}
      >
        <ProForm
          id={
            creating
              ? 'create-certificate-form'
              : `edit-certificate-${editing?.certificate_target_id}-form`
          }
          layout="vertical"
          submitter={false}
          onFinish={async () => {
            submit();
            return false;
          }}
        >
          <Form.Item label="프로젝트" htmlFor="certificate-project">
            <ProjectSelect
              id="certificate-project"
              ariaLabel={
                creating ? '인증서 프로젝트' : `인증서 ${editing?.certificate_target_id} 프로젝트`
              }
              value={value.projectId}
              onChange={(projectId) => setValue({ ...value, projectId })}
              projects={projects}
              preserveCurrent={Boolean(editing)}
            />
          </Form.Item>
          <Form.Item label="호스트" htmlFor="certificate-hostname" extra="예: api.example.com">
            <Input
              id="certificate-hostname"
              aria-label={
                creating ? '인증서 호스트' : `인증서 ${editing?.certificate_target_id} 호스트`
              }
              value={value.hostname}
              onChange={(event) =>
                setValue({
                  ...value,
                  hostname: event.target.value,
                  sniHostname: creating ? event.target.value : value.sniHostname,
                })
              }
              required
            />
          </Form.Item>
          <Form.Item label="포트" htmlFor="certificate-port">
            <Input
              id="certificate-port"
              aria-label={
                creating ? '인증서 포트' : `인증서 ${editing?.certificate_target_id} 포트`
              }
              type="number"
              value={value.port}
              onChange={(event) => setValue({ ...value, port: Number(event.target.value) })}
            />
          </Form.Item>
          <Form.Item label="SNI 호스트" htmlFor="certificate-sni">
            <Input
              id="certificate-sni"
              aria-label={creating ? 'SNI 호스트' : `인증서 ${editing?.certificate_target_id} SNI`}
              value={value.sniHostname}
              onChange={(event) => setValue({ ...value, sniHostname: event.target.value })}
              required
            />
          </Form.Item>
          <Form.Item label="점검 간격(분)" htmlFor="certificate-check-interval" extra="1분 이상">
            <Input
              id="certificate-check-interval"
              type="number"
              min={1}
              aria-label={
                creating
                  ? '새 인증서 점검 간격'
                  : `인증서 ${editing?.certificate_target_id} 점검 간격`
              }
              value={value.checkIntervalMinutes}
              onChange={(event) =>
                setValue({ ...value, checkIntervalMinutes: Number(event.target.value) })
              }
            />
          </Form.Item>
          <Form.Item
            label="대상 상태"
            htmlFor="certificate-enabled"
            extra="중지하면 인증서 점검을 멈추지만 기존 결과는 유지합니다."
          >
            <Select
              id="certificate-enabled"
              aria-label={
                editing ? `인증서 ${editing.certificate_target_id} 대상 상태` : '대상 상태'
              }
              value={value.enabled}
              onChange={(enabled) => setValue({ ...value, enabled })}
              options={[
                { label: '사용', value: true },
                { label: '중지', value: false },
              ]}
            />
          </Form.Item>
          {validation && <Alert type="error" title={validation} />}
          {(create.isError || save.isError) && (
            <Alert type="error" title="인증서 대상을 저장하지 못했습니다." />
          )}
          <Space>
            <Button
              onClick={() => {
                setCreating(false);
                setEditing(undefined);
              }}
            >
              취소
            </Button>
            <Button
              type="primary"
              htmlType="submit"
              loading={pending}
              disabled={!value.projectId}
              aria-label={
                creating ? '인증서 대상 등록 확인' : `인증서 ${editing?.certificate_target_id} 저장`
              }
            >
              {creating ? '등록' : '저장'}
            </Button>
          </Space>
        </ProForm>
      </Modal>
      <QueryContent query={query} empty={(query.data?.items.length ?? 0) === 0}>
        <ProTable<Certificate>
          aria-label="인증서 대상 설정"
          rowKey="certificate_target_id"
          dataSource={query.data?.items ?? []}
          columns={columns}
          search={false}
          options={false}
          pagination={false}
          scroll={{ x: 'max-content' }}
        />
      </QueryContent>
    </>
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
    <Select
      id={id}
      aria-label={ariaLabel}
      value={value}
      onChange={onChange}
      showSearch
      optionFilterProp="label"
      disabled={projects.isPending || projects.isError}
      options={[
        {
          value: '',
          label: projects.isPending
            ? '프로젝트 불러오는 중…'
            : projects.isError
              ? '프로젝트를 불러오지 못했습니다'
              : items.length === 0
                ? '등록된 프로젝트가 없습니다'
                : '프로젝트 선택',
        },
        ...(currentMissing && preserveCurrent
          ? [{ value, label: `${value} (현재 프로젝트)` }]
          : []),
        ...items.map((project) => ({
          value: project.project_id,
          label: `${project.display_name} (${project.project_id})${project.enabled ? '' : ' - 비활성'}`,
          disabled: !project.enabled && project.project_id !== value,
        })),
      ]}
    />
  );
}
