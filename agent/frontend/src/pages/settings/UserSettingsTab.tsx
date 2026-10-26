// 사용자 계정과 프로젝트별 권한 관리 화면
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { ProTable, type ProColumns } from '@ant-design/pro-components';
import { Button, Checkbox, Input, Select, Space, Typography } from 'antd';
import { createUser, getProjects, getUsers, updateUser } from '../../api';
import { DefaultService, type UserWrite, type ManagedUser } from '../../generated';
import { roleLabels, usePermissions } from '../../components/PermissionContext';
import { Empty, Failure, Loading, RefreshFailure } from '../../components/QueryState';
import { BooleanSelect, LabeledField, SecretInput, SettingsDialog } from './forms';

const emptyUser = (): UserWrite => ({
  username: '',
  password: '',
  role: 'VIEWER',
  enabled: true,
  projectIds: [],
});
export default function UserSettingsTab() {
  const [page, setPage] = useState(0);
  const users = useQuery({ queryKey: ['users', page], queryFn: () => getUsers(page) });
  const roles = useQuery({ queryKey: ['roles'], queryFn: () => DefaultService.listRoles() });
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
        ['users', 'roles', 'role-users', 'audit', 'session'].map((key) =>
          client.invalidateQueries({ queryKey: [key] }),
        ),
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
      role: user.role,
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
  const columns: ProColumns<ManagedUser>[] = [
    {
      title: '계정',
      dataIndex: 'username',
      render: (_, user) => (
        <Space>
          {user.username}
          {user.username === username && (
            <Typography.Text type="secondary">내 계정</Typography.Text>
          )}
        </Space>
      ),
    },
    {
      title: '역할',
      dataIndex: 'role',
      render: (_, user) => user.role_name ?? roleLabels[user.role] ?? user.role,
    },
    {
      title: '담당 프로젝트',
      render: (_, user) =>
        user.role === 'ADMIN'
          ? '전체 프로젝트'
          : user.project_ids.length
            ? user.project_ids
                .map(
                  (id) =>
                    projects.data?.items.find((project) => project.project_id === id)
                      ?.display_name ?? id,
                )
                .join(', ')
            : '미지정 · 접근 불가',
    },
    { title: '상태', dataIndex: 'enabled', renderText: (enabled) => (enabled ? '사용' : '중지') },
    {
      title: '최근 변경',
      dataIndex: 'updated_at',
      render: (_, user) => new Date(user.updated_at).toLocaleString('ko-KR'),
    },
    {
      title: '관리',
      valueType: 'option',
      render: (_, user) => (
        <Button aria-label={`${user.username} 계정 수정`} onClick={() => edit(user)}>
          수정
        </Button>
      ),
    },
  ];
  return (
    <>
      <Space>
        <Button
          type="primary"
          onClick={() => {
            setEditing(false);
            setDraft(emptyUser());
            setValidation(undefined);
            save.reset();
          }}
        >
          사용자 등록
        </Button>
      </Space>
      <Typography.Paragraph>
        관리자는 전체 프로젝트를 관리합니다. 운영자는 담당 프로젝트를 관리하고, 조회자는 확인만 할
        수 있습니다.
      </Typography.Paragraph>
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
          <ProTable<ManagedUser>
            aria-label="사용자 목록"
            rowKey="username"
            dataSource={users.data.items}
            columns={columns}
            search={false}
            options={false}
            pagination={false}
            scroll={{ x: 'max-content' }}
          />
          <Space wrap>
            <span>전체 {users.data.total}명</span>
            <Button disabled={page === 0} onClick={() => setPage(page - 1)}>
              이전
            </Button>
            <span>{page + 1}</span>
            <Button
              disabled={(page + 1) * 50 >= users.data.total}
              onClick={() => setPage(page + 1)}
            >
              다음
            </Button>
          </Space>
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
            <Input
              id="user-id"
              value={draft.username}
              disabled={editing}
              autoComplete="off"
              maxLength={80}
              onChange={(event) => setDraft({ ...draft, username: event.target.value })}
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
            <Select
              id="user-role"
              aria-label="역할"
              value={draft.role}
              disabled={editing && draft.username === username}
              onChange={(role) =>
                setDraft({
                  ...draft,
                  role,
                  projectIds: role === 'ADMIN' ? [] : draft.projectIds,
                })
              }
              options={(roles.data ?? [])
                .filter((role) => role.enabled || role.roleId === draft.role)
                .map(({ roleId: value, name: label }) => ({ value, label }))}
            />
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
            <fieldset>
              <legend>담당 프로젝트</legend>
              {projects.isPending ? (
                <Loading />
              ) : projects.isError ? (
                <Failure message="프로젝트를 불러오지 못했습니다." />
              ) : (
                <Checkbox.Group
                  value={draft.projectIds}
                  onChange={(projectIds) => setDraft({ ...draft, projectIds })}
                  options={(projects.data?.items ?? []).map((project) => ({
                    value: project.project_id,
                    label: `${project.display_name} (${project.project_id})`,
                  }))}
                />
              )}
              <Typography.Paragraph type="secondary">
                프로젝트를 선택하지 않으면 관제 데이터에 접근할 수 없습니다.
              </Typography.Paragraph>
            </fieldset>
          )}
        </SettingsDialog>
      )}
    </>
  );
}
