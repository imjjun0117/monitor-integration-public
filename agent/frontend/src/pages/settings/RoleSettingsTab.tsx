// 역할 목록 선택 후 메뉴 권한 및 사용자 배정 관리
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { DefaultService, type ManagedRole, RoleWrite } from '../../generated';
import { Alert, Button, FormSelect, FormSelectOption, TextInput } from '../../components/ui';
import { Failure, Loading } from '../../components/QueryState';
import { BooleanSelect, LabeledField, SettingsDialog } from './forms';
import PermissionSettingsTab from './PermissionSettingsTab';
import { roleLabels } from '../../components/PermissionContext';
import { Plus } from 'lucide-react';

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
        <section className="role-list settings-card" aria-label="역할 목록">
          <div className="settings-card-heading">
            <h2>역할 목록</h2>
            <Button size="sm" onClick={() => open()}>
              <Plus size={14} aria-hidden="true" />
              역할 등록
            </Button>
          </div>
          <div className="role-search">
            <TextInput
              aria-label="역할 검색"
              placeholder="역할 이름·ID"
              value={search}
              onChange={(_, value) => setSearch(value)}
            />
            <FormSelect
              aria-label="역할 사용 여부"
              value={status}
              onChange={(_, value) => setStatus(value)}
            >
              <FormSelectOption value="all" label="전체 상태" />
              <FormSelectOption value="true" label="사용" />
              <FormSelectOption value="false" label="미사용" />
            </FormSelect>
          </div>
          {roles.isPending ? (
            <Loading />
          ) : roles.isError ? (
            <Failure />
          ) : (
            <div className="role-list-rows">
              {visible.map((value) => (
                <div
                  key={value.roleId}
                  className={`role-list-row${selected === value.roleId ? ' selected' : ''}`}
                >
                  <button
                    className="role-select"
                    aria-pressed={selected === value.roleId}
                    onClick={() => setSelected(value.roleId)}
                  >
                    <strong>{value.name}</strong>
                    <small>
                      {value.roleId} · {value.enabled ? '사용' : '미사용'}
                    </small>
                  </button>
                  <button
                    className="role-member-count"
                    aria-label={`${value.name} 사용자 ${value.userCount}명`}
                    onClick={() => {
                      setSelected(value.roleId);
                      setTab('users');
                    }}
                  >
                    {value.userCount}명
                  </button>
                  {!value.builtin && (
                    <div className="role-row-actions">
                      <Button
                        variant="link"
                        size="sm"
                        aria-label={`${value.name} 수정`}
                        onClick={() => open(value)}
                      >
                        수정
                      </Button>
                      <Button
                        variant="link"
                        className="settings-delete-action"
                        size="sm"
                        aria-label={`${value.name} 삭제`}
                        onClick={() => {
                          remove.reset();
                          setDeleting(value);
                        }}
                      >
                        삭제
                      </Button>
                    </div>
                  )}
                </div>
              ))}
              {!visible.length && <p className="settings-help">검색 결과가 없습니다.</p>}
            </div>
          )}
        </section>
        <section className="role-workspace settings-card" aria-label="선택 역할 관리">
          {role && (
            <>
              <div className="settings-card-heading">
                <div>
                  <h2>{role.name}</h2>
                  <p className="settings-help">
                    {role.description || `${roleLabels[role.baseRole]} 기준 권한`} ·{' '}
                    {role.enabled ? '사용' : '미사용'}
                  </p>
                </div>
                <small>{role.roleId}</small>
              </div>
              <div className="role-work-tabs" role="tablist" aria-label="역할 작업">
                <button
                  id="role-menu-tab"
                  role="tab"
                  aria-selected={tab === 'menus'}
                  aria-controls="role-menu-panel"
                  tabIndex={tab === 'menus' ? 0 : -1}
                  onKeyDown={(event) => {
                    if (['ArrowLeft', 'ArrowRight', 'End'].includes(event.key)) {
                      event.preventDefault();
                      setTab('users');
                      document.getElementById('role-user-tab')?.focus();
                    }
                  }}
                  onClick={() => setTab('menus')}
                >
                  메뉴 권한
                </button>
                <button
                  id="role-user-tab"
                  role="tab"
                  aria-selected={tab === 'users'}
                  aria-controls="role-user-panel"
                  tabIndex={tab === 'users' ? 0 : -1}
                  onKeyDown={(event) => {
                    if (['ArrowLeft', 'ArrowRight', 'Home'].includes(event.key)) {
                      event.preventDefault();
                      setTab('menus');
                      document.getElementById('role-menu-tab')?.focus();
                    }
                  }}
                  onClick={() => setTab('users')}
                >
                  사용자 배정
                </button>
              </div>
              {tab === 'menus' ? (
                <div id="role-menu-panel" role="tabpanel" aria-labelledby="role-menu-tab">
                  <PermissionSettingsTab
                    key={role.roleId}
                    selectedRole={role.roleId}
                    baseRole={role.baseRole}
                  />
                </div>
              ) : (
                <div id="role-user-panel" role="tabpanel" aria-labelledby="role-user-tab">
                  <RoleUsers key={role.roleId} role={role} />
                </div>
              )}
            </>
          )}
        </section>
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
            <TextInput
              id="role-id"
              value={draft.roleId}
              maxLength={20}
              isDisabled={editing}
              onChange={(_, value) => setDraft({ ...draft, roleId: value.toUpperCase() })}
            />
          </LabeledField>
          <LabeledField id="role-name" label="역할 이름">
            <TextInput
              id="role-name"
              value={draft.name}
              maxLength={60}
              onChange={(_, value) => setDraft({ ...draft, name: value })}
            />
          </LabeledField>
          <LabeledField id="role-description" label="설명">
            <TextInput
              id="role-description"
              value={draft.description}
              maxLength={500}
              onChange={(_, value) => setDraft({ ...draft, description: value })}
            />
          </LabeledField>
          <LabeledField
            id="role-base"
            label="기준 권한"
            help="조회용은 변경·실행이 제한됩니다. 등록 후 기준 권한은 변경할 수 없습니다."
          >
            <FormSelect
              id="role-base"
              value={draft.baseRole}
              isDisabled={editing}
              onChange={(_, value) => setDraft({ ...draft, baseRole: value as RoleWrite.baseRole })}
            >
              <FormSelectOption value="VIEWER" label="조회용" />
              <FormSelectOption value="OPERATOR" label="운영용" />
            </FormSelect>
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
      <div className="role-user-toolbar">
        <TextInput
          aria-label="배정 사용자 검색"
          placeholder="계정 ID 검색"
          value={search}
          onChange={(_, value) => setSearch(value)}
        />
        <Button
          isDisabled={!draft || !role.enabled}
          isLoading={save.isPending}
          onClick={() => save.mutate()}
        >
          배정 저장
        </Button>
      </div>
      <p className="settings-help">
        사용자는 하나의 역할을 가집니다. 선택하면 기존 역할에서 이동하고, 해제하면 조회자 역할로
        돌아갑니다. 담당 프로젝트는 유지됩니다. 관리자 회수는 사용자 관리에서 진행하세요.
      </p>
      {save.isError && <Alert variant="danger" title="사용자 배정을 저장하지 못했습니다." />}
      {save.isSuccess && <Alert variant="success" title="사용자 배정을 저장했습니다." />}
      {query.isPending ? (
        <Loading />
      ) : query.isError ? (
        <Failure />
      ) : (
        <div className="role-user-list">
          {query.data
            .filter((user) => user.username.toLowerCase().includes(search.toLowerCase()))
            .map((user) => (
              <label key={user.username}>
                <input
                  type="checkbox"
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
                />
                <strong>{user.username}</strong>
                <small>
                  {user.enabled ? '사용' : '중지'} · {user.role}
                </small>
              </label>
            ))}
        </div>
      )}
    </>
  );
}
