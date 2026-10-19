// DB 메뉴 이름·정렬·사용 여부 설정
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { DefaultService, type ManagedMenu } from '../../generated';
import { Button, TextInput, Table, Thead, Tbody, Tr, Th, Td } from '../../components/ui';
import { Failure, Loading } from '../../components/QueryState';
import { BooleanSelect, LabeledField, SettingsDialog } from './forms';

export default function MenuSettingsTab() {
  const client = useQueryClient();
  const query = useQuery({ queryKey: ['menus'], queryFn: () => DefaultService.listMenus() });
  const [draft, setDraft] = useState<ManagedMenu>();
  const save = useMutation({
    mutationFn: (value: ManagedMenu) =>
      DefaultService.updateMenu({ menuId: value.menuId, requestBody: value }),
    onSuccess: async () => {
      setDraft(undefined);
      await Promise.all(
        ['menus', 'permissions', 'session', 'audit'].map((key) =>
          client.invalidateQueries({ queryKey: [key] }),
        ),
      );
    },
  });
  if (query.isPending) {
    return <Loading />;
  }
  if (query.isError) {
    return <Failure />;
  }
  return (
    <>
      <p className="settings-help">
        메뉴 이름·순서·사용 여부를 관리합니다. 연결 경로는 등록된 화면으로 고정되며, 관리자의 설정
        접근은 항상 유지됩니다.
      </p>
      <Table aria-label="메뉴 목록">
        <Thead>
          <Tr>
            <Th>순서</Th>
            <Th>메뉴</Th>
            <Th>연결 경로</Th>
            <Th>사용</Th>
            <Th>관리</Th>
          </Tr>
        </Thead>
        <Tbody>
          {query.data.map((menu) => (
            <Tr key={menu.menuId}>
              <Td>{menu.sortOrder}</Td>
              <Td>{menu.label}</Td>
              <Td>
                <code>{menu.route}</code>
              </Td>
              <Td>{menu.enabled ? '사용' : '미사용'}</Td>
              <Td>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    save.reset();
                    setDraft(menu);
                  }}
                >
                  수정
                </Button>
              </Td>
            </Tr>
          ))}
        </Tbody>
      </Table>
      {draft && (
        <SettingsDialog
          id="menu-settings"
          title="메뉴 수정"
          submitLabel="저장"
          isOpen
          isPending={save.isPending}
          onClose={() => {
            if (!save.isPending) {
              setDraft(undefined);
            }
          }}
          onSubmit={() => save.mutate(draft)}
          failed={save.isError}
          error={save.error}
        >
          <LabeledField id="menu-label" label="메뉴 이름">
            <TextInput
              id="menu-label"
              required
              maxLength={60}
              value={draft.label}
              onChange={(_, label) => setDraft({ ...draft, label })}
            />
          </LabeledField>
          <LabeledField id="menu-sort" label="표시 순서">
            <TextInput
              id="menu-sort"
              type="number"
              min={0}
              max={999}
              required
              value={draft.sortOrder}
              onChange={(_, value) => setDraft({ ...draft, sortOrder: Number(value) })}
            />
          </LabeledField>
          {draft.menuId !== 'settings' && (
            <BooleanSelect
              id="menu-enabled"
              label="사용 여부"
              trueLabel="사용"
              falseLabel="미사용"
              value={draft.enabled}
              onChange={(enabled) => setDraft({ ...draft, enabled })}
            />
          )}
        </SettingsDialog>
      )}
    </>
  );
}
