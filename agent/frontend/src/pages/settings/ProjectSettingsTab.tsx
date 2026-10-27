// 프로젝트 등록 및 사용 여부 관리 화면
import { ProTable, type ProColumns } from '@ant-design/pro-components';
import { Button, Input, Modal, Space } from 'antd';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import type { Project, ProjectWrite } from '../../generated';
import { DefaultService } from '../../generated';
import { createProject, deleteProjectPermanently, getProjects } from '../../api';
import { BooleanSelect, LabeledField, MutationError, QueryContent, SettingsDialog } from './forms';
import { useInvalidateMutation } from './useInvalidateMutation';
import { emptyProject, validateProject } from './validation';
import { useProjectScope } from '../../components/ProjectScope';
import { usePermissions } from '../../components/PermissionContext';

export default function ProjectSettingsTab() {
  const { project: selectedProject } = useProjectScope();
  const { canWrite, isAdmin } = usePermissions();
  const query = useQuery({ queryKey: ['projects'], queryFn: getProjects });
  const [value, setValue] = useState<ProjectWrite>(emptyProject());
  const [validation, setValidation] = useState<string>();
  const [creating, setCreating] = useState(false);
  const create = useInvalidateMutation(createProject, ['projects'], () => closeCreate());

  function openCreate() {
    setValue(emptyProject());
    setValidation(undefined);
    setCreating(true);
  }

  function closeCreate() {
    setCreating(false);
  }

  function createCurrent() {
    const error = validateProject(value);
    setValidation(error);
    if (!error) {
      create.mutate(value);
    }
  }

  const columns: ProColumns<Project>[] = [
    { title: '프로젝트', dataIndex: 'project_id' },
    {
      title: 'XLog 수집',
      render: (_, project) => <ProjectXlogControl project={project} canWrite={canWrite} />,
    },
    {
      title: '작업',
      valueType: 'option',
      hideInTable: !isAdmin,
      render: (_, project) => <ProjectDeleteAction project={project} />,
    },
  ];

  return (
    <>
      {isAdmin && (
        <Button type="primary" onClick={openCreate}>
          프로젝트 등록
        </Button>
      )}
      <SettingsDialog
        id="create-project"
        title="프로젝트 등록"
        submitLabel="등록"
        submitAriaLabel="프로젝트 등록 확인"
        isOpen={creating}
        isPending={create.isPending}
        onClose={closeCreate}
        onSubmit={createCurrent}
        validation={validation}
        failed={create.isError}
        error={create.error}
      >
        <LabeledField id="project-id" label="프로젝트 ID">
          <Input
            id="project-id"
            aria-label="프로젝트 ID"
            placeholder="예: sample-a"
            value={value.projectId}
            onChange={(event) => setValue({ ...value, projectId: event.target.value })}
            minLength={2}
            maxLength={64}
            required
          />
        </LabeledField>
        <LabeledField id="project-display-name" label="표시명">
          <Input
            id="project-display-name"
            aria-label="프로젝트 표시명"
            placeholder="앞뒤 공백 없이 1~120자"
            value={value.displayName}
            onChange={(event) => setValue({ ...value, displayName: event.target.value })}
            required
          />
        </LabeledField>
        <BooleanSelect
          id="create-project-enabled"
          label="프로젝트 상태"
          value={value.enabled}
          trueLabel="사용"
          falseLabel="중지"
          onChange={(enabled) => setValue({ ...value, enabled })}
        />
      </SettingsDialog>
      <QueryContent query={query} empty={(query.data?.items.length ?? 0) === 0}>
        <ProTable<Project>
          aria-label="프로젝트 설정"
          rowKey="project_id"
          dataSource={(query.data?.items ?? []).filter(
            (project) => !selectedProject || project.project_id === selectedProject,
          )}
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

function ProjectXlogControl({ project, canWrite }: { project: Project; canWrite: boolean }) {
  const client = useQueryClient();
  const settings = useQuery({
    queryKey: ['xlog-settings', project.project_id],
    queryFn: () => DefaultService.getXlogSettings({ projectId: project.project_id }),
    retry: false,
  });
  const xlog = useMutation({
    mutationFn: (enabled: boolean) =>
      DefaultService.saveXlogSettings({
        projectId: project.project_id,
        requestBody: { enabled },
      }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['xlog-settings', project.project_id] });
      void client.invalidateQueries({ queryKey: ['connection', project.project_id] });
    },
  });
  return (
    <Space>
      {canWrite && (
        <Button
          disabled={!settings.data || xlog.isPending}
          loading={xlog.isPending}
          onClick={() => xlog.mutate(!settings.data?.enabled)}
        >
          {settings.data?.enabled ? '사용' : '미사용'}
        </Button>
      )}
      {!canWrite && (settings.data?.enabled ? '사용' : '미사용')}
      {xlog.isError && <span role="alert">저장 실패</span>}
    </Space>
  );
}

function ProjectDeleteAction({ project }: { project: Project }) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const permanentDelete = useInvalidateMutation(
    () => deleteProjectPermanently(project.project_id),
    ['projects'],
    () => setConfirmDelete(false),
  );

  return (
    <>
      <Button danger onClick={() => setConfirmDelete(true)}>
        삭제
      </Button>
      <Modal
        title={`프로젝트 ${project.project_id} 영구 삭제`}
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
            <Button
              danger
              type="primary"
              aria-label={`프로젝트 ${project.project_id} 영구 삭제 확인`}
              loading={permanentDelete.isPending}
              disabled={permanentDelete.isPending}
              onClick={() => permanentDelete.mutate(undefined)}
            >
              영구 삭제
            </Button>
          </Space>
        }
      >
        <p>하위 인스턴스, 인증서, 모든 기록과 설정이 함께 삭제되며 복구할 수 없습니다.</p>
        <MutationError failed={permanentDelete.isError} error={permanentDelete.error} />
      </Modal>
    </>
  );
}
