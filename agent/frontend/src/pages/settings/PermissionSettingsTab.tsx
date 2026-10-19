// 역할별 메뉴 조회·변경 권한 설정
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { DefaultService, type PermissionWrite } from '../../generated';
import {
  Button,
  Alert,
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
  FormSelect,
  FormSelectOption,
} from '../../components/ui';
import { Failure, Loading } from '../../components/QueryState';
import { roleLabels } from '../../components/PermissionContext';

export default function PermissionSettingsTab({
  selectedRole,
  baseRole,
}: {
  selectedRole?: string;
  baseRole?: string;
}) {
  const client = useQueryClient();
  const [fallbackRole, setRole] = useState<'ADMIN' | 'OPERATOR' | 'VIEWER'>('OPERATOR');
  const role = selectedRole ?? fallbackRole;
  const effectiveRole = baseRole ?? role;
  const [draft, setDraft] = useState<PermissionWrite[]>();
  const query = useQuery({
    queryKey: ['permissions'],
    queryFn: () => DefaultService.listPermissions(),
  });
  const rows = query.data?.filter((row) => row.role === role) ?? [];
  const values = draft ?? rows;
  const save = useMutation({
    mutationFn: () =>
      DefaultService.updatePermissions({
        role,
        requestBody: values,
      }),
    onSuccess: async () => {
      setDraft(undefined);
      await Promise.all(
        ['permissions', 'session', 'audit'].map((key) =>
          client.invalidateQueries({ queryKey: [key] }),
        ),
      );
    },
  });
  function change(menuId: string, read: boolean, write: boolean) {
    save.reset();
    setDraft(
      values.map((value) =>
        value.menuId === menuId ? { ...value, canRead: read, canWrite: write } : value,
      ),
    );
  }
  return (
    <>
      <div className="permission-toolbar">
        {!selectedRole && (
          <>
            <label htmlFor="permission-role">역할</label>
            <FormSelect
              id="permission-role"
              value={role}
              isDisabled={save.isPending}
              onChange={(_, value) => {
                setRole(value as typeof fallbackRole);
                setDraft(undefined);
                save.reset();
              }}
            >
              {Object.entries(roleLabels).map(([value, label]) => (
                <FormSelectOption key={value} value={value} label={label} />
              ))}
            </FormSelect>
          </>
        )}
        <Button
          isDisabled={!draft || role === 'ADMIN'}
          isLoading={save.isPending}
          onClick={() => save.mutate()}
        >
          권한 저장
        </Button>
      </div>
      <p className="settings-help">
        선택한 역할의 메뉴 접근을 설정합니다. 담당 프로젝트는 사용자 관리에서 지정합니다. 운영자의
        계정·메뉴·권한 관리 접근과 조회자의 변경 작업은 허용되지 않습니다.
      </p>
      {save.isError && <Alert variant="danger" title="권한을 저장하지 못했습니다." />}
      {save.isSuccess && (
        <Alert variant="success" title="권한을 저장했습니다. 기존 로그인에도 적용됩니다." />
      )}
      {query.isPending ? (
        <Loading />
      ) : query.isError ? (
        <Failure />
      ) : (
        <Table aria-label="역할별 메뉴 권한">
          <Thead>
            <Tr>
              <Th>메뉴</Th>
              <Th>조회</Th>
              <Th>변경·실행</Th>
            </Tr>
          </Thead>
          <Tbody>
            {values.map((value) => (
              <Tr key={value.menuId}>
                <Td>{rows.find((row) => row.menuId === value.menuId)?.label}</Td>
                <Td>
                  <input
                    type="checkbox"
                    aria-label={`${value.menuId} 조회`}
                    checked={value.canRead}
                    disabled={role === 'ADMIN' || save.isPending}
                    onChange={(event) =>
                      change(
                        value.menuId,
                        event.target.checked,
                        event.target.checked && value.canWrite,
                      )
                    }
                  />
                </Td>
                <Td>
                  <input
                    type="checkbox"
                    aria-label={`${value.menuId} 변경`}
                    checked={value.canWrite}
                    disabled={effectiveRole !== 'OPERATOR' || save.isPending}
                    onChange={(event) =>
                      change(
                        value.menuId,
                        value.canRead || event.target.checked,
                        event.target.checked,
                      )
                    }
                  />
                </Td>
              </Tr>
            ))}
          </Tbody>
        </Table>
      )}
    </>
  );
}
