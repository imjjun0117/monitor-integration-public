// 로그인 사용자의 권한 조회 및 하위 화면 제공
import { useEffect, useRef, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getSession } from '../api';
import { Failure, Loading } from './QueryState';
import { PermissionContext } from './PermissionContext';

export default function PermissionProvider({ children }: { children: ReactNode }) {
  const client = useQueryClient();
  const session = useQuery({ queryKey: ['session'], queryFn: getSession, refetchInterval: 15_000 });
  const previous = useRef<string | undefined>(undefined);
  const signature =
    session.data &&
    JSON.stringify([session.data.username, session.data.role, session.data.project_ids ?? []]);
  useEffect(() => {
    if (!signature) {
      return;
    }
    if (previous.current && previous.current !== signature) {
      void client.resetQueries({ predicate: (query) => query.queryKey[0] !== 'session' });
    }
    previous.current = signature;
  }, [signature, client]);
  if (!session.data) {
    return session.isError ? <Failure message="계정 정보를 불러오지 못했습니다." /> : <Loading />;
  }
  const { role, username } = session.data;
  return (
    <PermissionContext.Provider
      value={{
        role,
        username,
        isAdmin: role === 'ADMIN',
        canWrite: role === 'ADMIN' || role === 'OPERATOR',
      }}
    >
      {children}
    </PermissionContext.Provider>
  );
}
