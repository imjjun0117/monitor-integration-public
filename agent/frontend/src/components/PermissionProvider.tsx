// 로그인 사용자의 권한 조회 및 하위 화면 제공
import { useEffect, useRef, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getSession } from '../api';
import { Failure, Loading } from './QueryState';
import { PermissionContext } from './PermissionContext';
import { useLocation } from 'react-router-dom';

export default function PermissionProvider({ children }: { children: ReactNode }) {
  const client = useQueryClient();
  const { pathname } = useLocation();
  const session = useQuery({ queryKey: ['session'], queryFn: getSession, refetchInterval: 15_000 });
  const previous = useRef<string | undefined>(undefined);
  const signature =
    session.data &&
    JSON.stringify([
      session.data.username,
      session.data.role,
      session.data.role_id,
      session.data.role_name,
      session.data.project_ids ?? [],
      session.data.menus,
    ]);
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
  const { role, username, menus } = session.data;
  const menuId = menuForPath(pathname);
  return (
    <PermissionContext.Provider
      value={{
        role,
        username,
        isAdmin: role === 'ADMIN',
        canWrite:
          role === 'ADMIN' ||
          (role === 'OPERATOR' && Boolean(menus?.find((menu) => menu.menuId === menuId)?.canWrite)),
        menus,
      }}
    >
      {children}
    </PermissionContext.Provider>
  );
}

export function menuForPath(path: string) {
  if (path.startsWith('/incidents')) {
    return 'incidents';
  }
  if (path.startsWith('/xlog')) {
    return 'xlog';
  }
  if (path.startsWith('/logs')) {
    return 'logs';
  }
  if (path.startsWith('/settings')) {
    return 'settings';
  }
  if (path.startsWith('/api-monitoring')) {
    return 'api';
  }
  if (path.startsWith('/certificates')) {
    return 'certificates';
  }
  if (path.startsWith('/projects') || path.startsWith('/instances')) {
    return 'projects';
  }
  return 'dashboard';
}
