// 프로젝트 등록 및 사용 여부 관리 화면
import {
  Button,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  ModalVariant,
  TextInput,
} from '../../components/ui';
import { Table, Tbody, Td, Th, Thead, Tr } from '../../components/ui';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import type { Project, ProjectWrite } from '../../generated';
import { createProject, deleteProjectPermanently, getProjects } from '../../api';
import { BooleanSelect, LabeledField, MutationError, QueryContent, SettingsDialog } from './forms';
import { useInvalidateMutation } from './useInvalidateMutation';
import { emptyProject, validateProject } from './validation';

export default function ProjectSettingsTab() {
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

  return (
    <>
      <div className="settings-toolbar">
        <Button permission="admin" onClick={openCreate}>
          프로젝트 등록
        </Button>
      </div>
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
        <LabeledField id="project-id" label="프로젝트 ID" help="예: sample-a">
          <TextInput
            id="project-id"
            aria-label="프로젝트 ID"
            value={value.projectId}
            onChange={(_, projectId) => setValue({ ...value, projectId })}
            minLength={2}
            maxLength={64}
            required
          />
        </LabeledField>
        <LabeledField id="project-display-name" label="표시명" help="앞뒤 공백 없이 1~120자">
          <TextInput
            id="project-display-name"
            aria-label="프로젝트 표시명"
            value={value.displayName}
            onChange={(_, displayName) => setValue({ ...value, displayName })}
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
        <div className="settings-table-scroll">
          <Table
            className="settings-table settings-project-table"
            variant="compact"
            aria-label="프로젝트 설정"
          >
            <Thead>
              <Tr>
                <Th>프로젝트</Th>
                <Th>작업</Th>
              </Tr>
            </Thead>
            <Tbody>
              {query.data?.items.map((project) => (
                <ProjectRow key={project.project_id} project={project} />
              ))}
            </Tbody>
          </Table>
        </div>
      </QueryContent>
    </>
  );
}

function ProjectRow({ project }: { project: Project }) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const permanentDelete = useInvalidateMutation(
    () => deleteProjectPermanently(project.project_id),
    ['projects'],
    () => setConfirmDelete(false),
  );

  return (
    <Tr>
      <Td>{project.project_id}</Td>
      <Td>
        <div className="settings-row-actions">
          <Button permission="admin" variant="danger" onClick={() => setConfirmDelete(true)}>
            삭제
          </Button>
        </div>
        <Modal
          variant={ModalVariant.small}
          aria-labelledby={`delete-project-${project.project_id}`}
          isOpen={confirmDelete}
          onClose={() => {
            if (!permanentDelete.isPending) {
              setConfirmDelete(false);
            }
          }}
        >
          <ModalHeader
            title={`프로젝트 ${project.project_id} 영구 삭제`}
            labelId={`delete-project-${project.project_id}`}
          />
          <ModalBody>
            하위 인스턴스, 인증서, 모든 기록과 설정이 함께 삭제되며 복구할 수 없습니다.
            <MutationError failed={permanentDelete.isError} error={permanentDelete.error} />
          </ModalBody>
          <ModalFooter>
            <Button
              permission="admin"
              variant="danger"
              aria-label={`프로젝트 ${project.project_id} 영구 삭제 확인`}
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
  );
}
