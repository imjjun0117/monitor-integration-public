// DB 메뉴 이름·정렬·사용 여부 설정
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { DefaultService, type ManagedMenu } from '../../generated';
import { ProTable, type ProColumns } from '@ant-design/pro-components';
import { Button, Input, InputNumber, Typography } from 'antd';
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
  const columns: ProColumns<ManagedMenu>[] = [
    { title: '순서', dataIndex: 'sortOrder' },
    { title: '메뉴', dataIndex: 'label' },
    { title: '연결 경로', dataIndex: 'route', render: (_, menu) => <code>{menu.route}</code> },
    { title: '사용', dataIndex: 'enabled', renderText: (enabled) => (enabled ? '사용' : '미사용') },
    {
      title: '관리',
      valueType: 'option',
      render: (_, menu) => (
        <Button
          onClick={() => {
            save.reset();
            setDraft(menu);
          }}
        >
          수정
        </Button>
      ),
    },
  ];
  if (query.isPending) {
    return <Loading />;
  }
  if (query.isError) {
    return <Failure />;
  }
  return (
    <>
      <Typography.Paragraph>
        메뉴 이름·순서·사용 여부를 관리합니다. 연결 경로는 등록된 화면으로 고정되며, 관리자의 설정
        접근은 항상 유지됩니다.
      </Typography.Paragraph>
      <ProTable<ManagedMenu>
        aria-label="메뉴 목록"
        rowKey="menuId"
        dataSource={query.data}
        columns={columns}
        search={false}
        options={false}
        pagination={false}
        scroll={{ x: 'max-content' }}
      />
      {draft && (
        <SettingsDialog
          id="menu-settings"
          title="메뉴 수정"
          submitLabel="저장"
          isOpen
          isPending={save.isPending}
          submitDisabled={!Number.isInteger(draft.sortOrder)}
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
            <Input
              id="menu-label"
              placeholder="메뉴에 표시할 이름"
              required
              maxLength={60}
              value={draft.label}
              onChange={(event) => setDraft({ ...draft, label: event.target.value })}
            />
          </LabeledField>
          <LabeledField id="menu-sort" label="표시 순서">
            <InputNumber
              id="menu-sort"
              style={{ width: '100%' }}
              placeholder="0~999"
              min={0}
              max={999}
              required
              value={draft.sortOrder}
              onChange={(value) => setDraft({ ...draft, sortOrder: value ?? Number.NaN })}
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
