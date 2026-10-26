// 역할 목록 선택 후 메뉴 권한 및 사용자 배정 관리
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { DefaultService, type ManagedRole, RoleWrite } from '../../generated';
import { Alert, Button, Card, Checkbox, Input, List, Select, Space, Tabs, Typography } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { Failure, Loading } from '../../components/QueryState';
import { BooleanSelect, LabeledField, SettingsDialog } from './forms';
import PermissionSettingsTab from './PermissionSettingsTab';
import { roleLabels } from '../../components/PermissionContext';

export default function RoleSettingsTab() {
  const client = useQueryClient();
  const roles = useQuery({ queryKey: ['roles'], queryFn: () => DefaultService.listRoles() });
  const [selected, setSelected] = useState('OPERATOR');
  const [tab, setTab] = useState<'menus' | 'users'>('menus');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [draft, setDraft] = useState<RoleWrite>();
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState<ManagedRole>();
  const [validation, setValidation] = useState<string>();
  const role = roles.data?.find((value) => value.roleId === selected);

  async function refresh() {
    await Promise.all(
      ['roles', 'permissions', 'users', 'role-users', 'session', 'audit'].map((key) =>
        client.invalidateQueries({ queryKey: [key] }),
      ),
    );
  }
  const save = useMutation({
    mutationFn: (value: RoleWrite) =>
      editing
        ? DefaultService.updateRole({ roleId: value.roleId, requestBody: value })
        : DefaultService.createRole({ requestBody: value }),
    onSuccess: async (_, value) => {
      setSelected(value.roleId);
      setDraft(undefined);
      await refresh();
    },
  });
  const remove = useMutation({
    mutationFn: (roleId: string) => DefaultService.deleteRole({ roleId }),
    onSuccess: async () => {
      setDeleting(undefined);
      setSelected('OPERATOR');
      await refresh();
    },
  });
  function open(value?: ManagedRole) {
    setEditing(Boolean(value));
    setValidation(undefined);
    save.reset();
    setDraft(
      value
        ? { ...value }
        : {
            roleId: '',
            name: '',
            description: '',
            baseRole: RoleWrite.baseRole.VIEWER,
            enabled: true,
          },
    );
  }
  function submit() {
    if (!draft) {
      return;
    }
    if (!/^[A-Z][A-Z0-9_]{1,19}$/.test(draft.roleId) || !draft.name.trim()) {
      setValidation('역할 ID는 대문자·숫자·_로 2~20자, 역할 이름은 1~60자로 입력하세요.');
      return;
    }
    save.mutate(draft);
  }
  const visible = (roles.data ?? []).filter(
    (value) =>
      `${value.name} ${value.roleId}`.toLowerCase().includes(search.toLowerCase()) &&
      (status === 'all' || value.enabled === (status === 'true')),
  );

  return (
    <>
      <div className="role-management">
        <Card
          role="region"
          aria-label="역할 목록"
          title="역할 목록"
          extra={
            <Button
              type="primary"
              aria-label="역할 등록"
              icon={<PlusOutlined aria-hidden="true" />}
              onClick={() => open()}
            >
              역할 등록
            </Button>
          }
        >
          <Space wrap>
            <Input
              aria-label="역할 검색"
              placeholder="역할 이름·ID"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <Select
              aria-label="역할 사용 여부"
              value={status}
              onChange={setStatus}
              options={[
                { value: 'all', label: '전체 상태' },
                { value: 'true', label: '사용' },
                { value: 'false', label: '미사용' },
              ]}
            />
          </Space>
          {roles.isPending ? (
            <Loading />
          ) : roles.isError ? (
            <Failure />
          ) : (
            <List
              dataSource={visible}
              locale={{ emptyText: '검색 결과가 없습니다.' }}
              renderItem={(value) => (
                <List.Item
                  key={value.roleId}
                  actions={[
                    <Button
                      key="members"
                      aria-label={`${value.name} 사용자 ${value.userCount}명`}
                      onClick={() => {
                        setSelected(value.roleId);
                        setTab('users');
                      }}
                    >
                      {value.userCount}명
                    </Button>,
                    ...(!value.builtin
                      ? [
                          <Button
                            key="edit"
                            type="link"
                            aria-label={`${value.name} 수정`}
                            onClick={() => open(value)}
                          >
                            수정
                          </Button>,
                          <Button
                            key="delete"
                            type="link"
                            danger
                            aria-label={`${value.name} 삭제`}
                            onClick={() => {
                              remove.reset();
                              setDeleting(value);
                            }}
                          >
                            삭제
                          </Button>,
                        ]
                      : []),
                  ]}
                >
                  <Button
                    type={selected === value.roleId ? 'primary' : 'text'}
                    aria-pressed={selected === value.roleId}
                    onClick={() => setSelected(value.roleId)}
                  >
                    {value.name} · {value.roleId} · {value.enabled ? '사용' : '미사용'}
                  </Button>
                </List.Item>
              )}
            />
          )}
        </Card>
        <Card role="region" aria-label="선택 역할 관리">
          {role && (
            <>
              <Typography.Title level={4}>{role.name}</Typography.Title>
              <Typography.Paragraph type="secondary">
                {role.description || `${roleLabels[role.baseRole]} 기준 권한`} ·{' '}
                {role.enabled ? '사용' : '미사용'} · {role.roleId}
              </Typography.Paragraph>
              <Tabs
                activeKey={tab}
                onChange={(key) => setTab(key as 'menus' | 'users')}
                tabBarExtraContent={null}
                items={[
                  {
                    key: 'menus',
                    label: '메뉴 권한',
                    children: tab === 'menus' && (
                      <PermissionSettingsTab
                        key={role.roleId}
                        selectedRole={role.roleId}
                        baseRole={role.baseRole}
                      />
                    ),
                  },
                  {
                    key: 'users',
                    label: '사용자 배정',
                    children: tab === 'users' && <RoleUsers key={role.roleId} role={role} />,
                  },
                ]}
              />
            </>
          )}
        </Card>
      </div>
      {draft && (
        <SettingsDialog
          id="role-settings"
          title={editing ? '역할 수정' : '역할 등록'}
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
          <LabeledField id="role-id" label="역할 ID">
            <Input
              id="role-id"
              value={draft.roleId}
              maxLength={20}
              disabled={editing}
              onChange={(event) => setDraft({ ...draft, roleId: event.target.value.toUpperCase() })}
            />
          </LabeledField>
          <LabeledField id="role-name" label="역할 이름">
            <Input
              id="role-name"
              value={draft.name}
              maxLength={60}
              onChange={(event) => setDraft({ ...draft, name: event.target.value })}
            />
          </LabeledField>
          <LabeledField id="role-description" label="설명">
            <Input
              id="role-description"
              value={draft.description}
              maxLength={500}
              onChange={(event) => setDraft({ ...draft, description: event.target.value })}
            />
          </LabeledField>
          <LabeledField
            id="role-base"
            label="기준 권한"
            help="조회용은 변경·실행이 제한됩니다. 등록 후 기준 권한은 변경할 수 없습니다."
          >
            <Select
              id="role-base"
              value={draft.baseRole}
              disabled={editing}
              onChange={(value) => setDraft({ ...draft, baseRole: value as RoleWrite.baseRole })}
              options={[
                { value: 'VIEWER', label: '조회용' },
                { value: 'OPERATOR', label: '운영용' },
              ]}
            />
          </LabeledField>
          <BooleanSelect
            id="role-enabled"
            label="사용 여부"
            value={draft.enabled}
            trueLabel="사용"
            falseLabel="미사용"
            help="미사용 역할의 사용자는 로그인과 API 접근이 차단됩니다."
            onChange={(enabled) => setDraft({ ...draft, enabled })}
          />
        </SettingsDialog>
      )}
      {deleting && (
        <SettingsDialog
          id="role-delete"
          title="역할 삭제"
          submitLabel="삭제"
          isOpen
          isPending={remove.isPending}
          onClose={() => {
            if (!remove.isPending) {
              setDeleting(undefined);
            }
          }}
          onSubmit={() => remove.mutate(deleting.roleId)}
          failed={remove.isError}
          error={remove.error}
        >
          <p>{deleting.name} 역할을 삭제하시겠습니까? 배정된 사용자가 있으면 삭제할 수 없습니다.</p>
        </SettingsDialog>
      )}
    </>
  );
}

function RoleUsers({ role }: { role: ManagedRole }) {
  const client = useQueryClient();
  const query = useQuery({
    queryKey: ['role-users', role.roleId],
    queryFn: () => DefaultService.listRoleUsers({ roleId: role.roleId }),
  });
  const [draft, setDraft] = useState<string[]>();
  const [search, setSearch] = useState('');
  const values =
    draft ?? query.data?.filter((user) => user.assigned).map((user) => user.username) ?? [];
  const save = useMutation({
    mutationFn: () => DefaultService.assignRoleUsers({ roleId: role.roleId, requestBody: values }),
    onSuccess: async () => {
      setDraft(undefined);
      await Promise.all(
        ['roles', 'role-users', 'users', 'session', 'audit'].map((key) =>
          client.invalidateQueries({ queryKey: [key] }),
        ),
      );
    },
  });
  return (
    <>
      <Space wrap>
        <Input
          aria-label="배정 사용자 검색"
          placeholder="계정 ID 검색"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <Button
          type="primary"
          disabled={!draft || !role.enabled}
          loading={save.isPending}
          onClick={() => save.mutate()}
        >
          배정 저장
        </Button>
      </Space>
      <p className="settings-help">
        사용자는 하나의 역할을 가집니다. 선택하면 기존 역할에서 이동하고, 해제하면 조회자 역할로
        돌아갑니다. 담당 프로젝트는 유지됩니다. 관리자 회수는 사용자 관리에서 진행하세요.
      </p>
      {save.isError && <Alert type="error" message="사용자 배정을 저장하지 못했습니다." />}
      {save.isSuccess && <Alert type="success" message="사용자 배정을 저장했습니다." />}
      {query.isPending ? (
        <Loading />
      ) : query.isError ? (
        <Failure />
      ) : (
        <List
          dataSource={query.data.filter((user) =>
            user.username.toLowerCase().includes(search.toLowerCase()),
          )}
          renderItem={(user) => (
            <List.Item key={user.username}>
              <Checkbox
                checked={values.includes(user.username)}
                disabled={
                  save.isPending ||
                  !role.enabled ||
                  user.role === 'ADMIN' ||
                  (role.roleId === 'VIEWER' && user.assigned)
                }
                onChange={(event) => {
                  save.reset();
                  setDraft(
                    event.target.checked
                      ? [...values, user.username]
                      : values.filter((name) => name !== user.username),
                  );
                }}
              >
                {user.username} · {user.enabled ? '사용' : '중지'} · {user.role}
              </Checkbox>
            </List.Item>
          )}
        />
      )}
    </>
  );
}
