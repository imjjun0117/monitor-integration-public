// 로그인 사용자 메뉴와 로그아웃 처리
import { useRef, useState } from 'react';
import { Avatar, Button, Dropdown, Space, type MenuProps } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { getSession, logout } from '../api';
import { roleLabels } from './PermissionContext';
import { setTheme, useTheme } from '../theme';

export default function UserMenu() {
  const theme = useTheme();
  const navigate = useNavigate();
  const session = useQuery({ queryKey: ['session'], queryFn: getSession, staleTime: 5 * 60_000 });
  const [open, setOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  if (!session.data) {
    return null;
  }
  const { username, role } = session.data;
  const roleLabel = session.data.role_name ?? roleLabels[role] ?? role;

  async function handleLogout() {
    setSigningOut(true);
    try {
      await logout();
    } finally {
      window.location.assign('/login');
    }
  }

  const items: MenuProps['items'] = [
    { key: 'identity', label: `${username} · ${roleLabel}`, disabled: true },
    { type: 'divider' },
    { key: 'settings', label: role === 'VIEWER' ? '설정 조회' : '설정 관리' },
    { key: 'theme', label: theme === 'dark' ? '라이트 모드로 전환' : '다크 모드로 전환' },
    { key: 'logout', label: signingOut ? '로그아웃하는 중…' : '로그아웃', disabled: signingOut },
  ];
  const onClick: MenuProps['onClick'] = ({ key }) => {
    setOpen(false);
    if (key === 'settings') {
      navigate(role === 'ADMIN' ? '/settings/projects' : '/settings/instances');
    } else if (key === 'theme') {
      setTheme(theme === 'dark' ? 'light' : 'dark');
      trigger.current?.focus();
    } else if (key === 'logout') {
      void handleLogout();
    }
  };

  return (
    <Dropdown
      trigger={['click']}
      autoFocus
      destroyOnHidden
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (!nextOpen) {
          trigger.current?.focus();
        }
      }}
      menu={{
        items,
        onClick,
        'aria-label': '계정 메뉴',
        onKeyDownCapture: (event) => {
          if (event.key !== 'Escape') {
            return;
          }
          // rc-menu는 최상위 Escape에서 onKeyDown을 호출하지 않으므로 먼저 닫고 포커스 반환
          event.preventDefault();
          event.stopPropagation();
          setOpen(false);
          trigger.current?.focus();
        },
      }}
    >
      <Button
        ref={trigger}
        type="text"
        aria-label={`${username} 계정 메뉴`}
        aria-expanded={open}
        aria-haspopup="menu"
      >
        <Space>
          <Avatar size="small">{username.slice(0, 1).toUpperCase()}</Avatar>
          <span className="account-username">{username}</span>
        </Space>
      </Button>
    </Dropdown>
  );
}
