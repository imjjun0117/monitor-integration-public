// 화면 접근 및 쓰기 권한 공유
import { createContext, useContext } from 'react';

type Permissions = { role: string; username: string; isAdmin: boolean; canWrite: boolean };
// 개별 컴포넌트의 기존 표시 유지. 앱에서는 PermissionProvider로 실제 권한 제공
export const PermissionContext = createContext<Permissions>({
  role: 'ADMIN',
  username: '',
  isAdmin: true,
  canWrite: true,
});
export function usePermissions() {
  return useContext(PermissionContext);
}
export const roleLabels: Record<string, string> = {
  ADMIN: '관리자',
  OPERATOR: '운영자',
  VIEWER: '조회자',
};
