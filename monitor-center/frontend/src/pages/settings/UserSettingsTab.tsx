// 사용자 계정과 프로젝트별 권한 관리 화면
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Button, FormSelect, FormSelectOption, TextInput } from '../../components/ui';
import { Table, Tbody, Td, Th, Thead, Tr } from '../../components/ui';
import { createUser, getProjects, getUsers, updateUser } from '../../api';
import { UserWrite, type ManagedUser } from '../../generated';
import { roleLabels, usePermissions } from '../../components/PermissionContext';
import { Empty, Failure, Loading, RefreshFailure } from '../../components/QueryState';
import { BooleanSelect, LabeledField, SecretInput, SettingsDialog } from './forms';

const emptyUser = (): UserWrite => ({
  username: '',
  password: '',
  role: UserWrite.role.VIEWER,
  enabled: true,
  projectIds: [],
});
export default function UserSettingsTab() {
  const [page, setPage] = useState(0);
  const users = useQuery({ queryKey: ['users', page], queryFn: () => getUsers(page) });
  const projects = useQuery({ queryKey: ['projects'], queryFn: getProjects });
  const [draft, setDraft] = useState<UserWrite>();
  const [editing, setEditing] = useState(false);
  const [validation, setValidation] = useState<string>();
  const { username } = usePermissions();
  const client = useQueryClient();
  const save = useMutation({
    mutationFn: (value: UserWrite) => (editing ? updateUser(value) : createUser(value)),
    onSuccess: async (_, value) => {
      setDraft(undefined);
      setValidation(undefined);
      await Promise.all(
        ['users', 'audit', 'session'].map((key) => client.invalidateQueries({ queryKey: [key] })),
      );
      if (editing && value.username === username && value.password) {
        window.location.assign('/login');
      }
    },
  });
  function edit(user: ManagedUser) {
    setEditing(true);
    setValidation(undefined);
    save.reset();
    setDraft({
      username: user.username,
      password: '',
      role: user.role as unknown as UserWrite.role,
      enabled: user.enabled,
      projectIds: user.role === 'ADMIN' ? [] : user.project_ids,
    });
  }
  function submit() {
    if (!draft) {
      return;
    }
    const password = draft.password ?? '';
    const invalidPassword =
      (!editing || password !== '') &&
      (password.length < 12 || new TextEncoder().encode(password).length > 72);
    if (!/^[A-Za-z0-9][A-Za-z0-9._@-]{1,79}$/.test(draft.username)) {
      setValidation('계정 ID는 영문·숫자와 . _ @ -를 사용해 2~80자로 입력하세요.');
      return;
    }
    if (invalidPassword) {
      setValidation('비밀번호는 12자 이상, UTF-8 기준 72바이트 이하로 입력하세요.');
      return;
    }
    setValidation(undefined);
    save.mutate(draft);
  }
  return (
    <>
      <div className="settings-toolbar">
        <Button
          permission="admin"
          onClick={() => {
            setEditing(false);
            setDraft(emptyUser());
            setValidation(undefined);
            save.reset();
          }}
        >
          사용자 등록
        </Button>
      </div>
      <p className="settings-help">
        관리자는 전체 프로젝트를 관리합니다. 운영자는 담당 프로젝트를 관리하고, 조회자는 확인만 할
        수 있습니다.
      </p>
      <RefreshFailure
        visible={users.isError && Boolean(users.data)}
        updatedAt={users.dataUpdatedAt}
        retry={() => void users.refetch()}
      />
      {users.isPending ? (
        <Loading />
      ) : users.isError && !users.data ? (
        <Failure />
      ) : !users.data?.items.length ? (
        <Empty>등록된 사용자가 없습니다.</Empty>
      ) : (
        <>
          <Table aria-label="사용자 목록">
            <Thead>
              <Tr>
                <Th>계정</Th>
                <Th>역할</Th>
                <Th>담당 프로젝트</Th>
                <Th>상태</Th>
                <Th>최근 변경</Th>
                <Th>관리</Th>
              </Tr>
            </Thead>
            <Tbody>
              {users.data.items.map((user) => (
                <Tr key={user.username}>
                  <Td>
                    {user.username}
                    {user.username === username && (
                      <small className="user-account-note">내 계정</small>
                    )}
                  </Td>
                  <Td>{roleLabels[user.role]}</Td>
                  <Td>
                    {user.role === 'ADMIN'
                      ? '전체 프로젝트'
                      : user.project_ids.length
                        ? user.project_ids
                            .map(
                              (id) =>
                                projects.data?.items.find((p) => p.project_id === id)
                                  ?.display_name ?? id,
                            )
                            .join(', ')
                        : '미지정 · 접근 불가'}
                  </Td>
                  <Td>{user.enabled ? '사용' : '중지'}</Td>
                  <Td>{new Date(user.updated_at).toLocaleString('ko-KR')}</Td>
                  <Td>
                    <Button
                      permission="admin"
                      variant="secondary"
                      size="sm"
                      aria-label={`${user.username} 계정 수정`}
                      onClick={() => edit(user)}
                    >
                      수정
                    </Button>
                  </Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
          <div className="project-overview-pagination">
            <span>전체 {users.data.total}명</span>
            <Button
              variant="secondary"
              size="sm"
              isDisabled={page === 0}
              onClick={() => setPage(page - 1)}
            >
              이전
            </Button>
            <span>{page + 1}</span>
            <Button
              variant="secondary"
              size="sm"
              isDisabled={(page + 1) * 50 >= users.data.total}
              onClick={() => setPage(page + 1)}
            >
              다음
            </Button>
          </div>
        </>
      )}
      {draft && (
        <SettingsDialog
          id="user-settings"
          title={editing ? '사용자 수정' : '사용자 등록'}
          submitLabel="저장"
          isOpen
          isPending={save.isPending}
          onClose={() => {
            if (!save.isPending) {
              setDraft(undefined);
            }
          }}
          onSubmit={submit}
          validation={validation}
          failed={save.isError}
          error={save.error}
        >
          <LabeledField id="user-id" label="계정 ID">
            <TextInput
              id="user-id"
              value={draft.username}
              isDisabled={editing}
              autoComplete="off"
              maxLength={80}
              onChange={(_, value) => setDraft({ ...draft, username: value })}
            />
          </LabeledField>
          <SecretInput
            id="user-password"
            label={editing ? '새 비밀번호' : '비밀번호'}
            help={
              editing
                ? '비워두면 기존 비밀번호를 유지합니다. 변경하면 기존 로그인은 종료됩니다.'
                : '12자 이상, UTF-8 기준 72바이트 이하'
            }
            required={!editing}
            value={draft.password ?? ''}
            onChange={(password) => setDraft({ ...draft, password })}
          />
          <LabeledField id="user-role" label="역할">
            <FormSelect
              id="user-role"
              value={draft.role}
              isDisabled={editing && draft.username === username}
              onChange={(_, role) =>
                setDraft({
                  ...draft,
                  role: role as UserWrite.role,
                  projectIds: role === 'ADMIN' ? [] : draft.projectIds,
                })
              }
            >
              {Object.entries(roleLabels).map(([value, label]) => (
                <FormSelectOption key={value} value={value} label={label} />
              ))}
            </FormSelect>
          </LabeledField>
          {editing && draft.username === username ? (
            <p className="field-help">내 계정의 관리자 역할과 사용 상태는 유지됩니다.</p>
          ) : (
            <BooleanSelect
              id="user-enabled"
              label="계정 상태"
              value={draft.enabled}
              trueLabel="사용"
              falseLabel="중지"
              onChange={(enabled) => setDraft({ ...draft, enabled })}
            />
          )}
          {draft.role !== 'ADMIN' && (
            <fieldset className="user-project-picker">
              <legend>담당 프로젝트</legend>
              {projects.isPending ? (
                <Loading />
              ) : projects.isError ? (
                <Failure message="프로젝트를 불러오지 못했습니다." />
              ) : (
                projects.data?.items.map((project) => (
                  <label key={project.project_id}>
                    <input
                      type="checkbox"
                      checked={draft.projectIds.includes(project.project_id)}
                      onChange={(event) =>
                        setDraft({
                          ...draft,
                          projectIds: event.target.checked
                            ? [...draft.projectIds, project.project_id]
                            : draft.projectIds.filter((id) => id !== project.project_id),
                        })
                      }
                    />
                    {project.display_name} <small>({project.project_id})</small>
                  </label>
                ))
              )}
              <p className="field-help">
                프로젝트를 선택하지 않으면 관제 데이터에 접근할 수 없습니다.
              </p>
            </fieldset>
          )}
        </SettingsDialog>
      )}
    </>
  );
}
