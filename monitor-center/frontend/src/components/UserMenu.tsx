// 로그인 사용자 메뉴와 로그아웃 처리
import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { getSession, logout } from '../api';

import { roleLabels } from './PermissionContext';

export default function UserMenu() {
  const session = useQuery({ queryKey: ['session'], queryFn: getSession, staleTime: 5 * 60_000 });
  const [open, setOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const container = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) {
      return undefined;
    }
    container.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    const onPointerDown = (event: PointerEvent) => {
      if (!container.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') {
        return;
      }
      setOpen(false);
      trigger.current?.focus();
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  if (!session.data) {
    return <div className="user-menu" />;
  }

  const { username, role } = session.data;
  const roleLabel = roleLabels[role] ?? role;

  async function handleLogout() {
    setSigningOut(true);
    try {
      await logout();
    } finally {
      window.location.assign('/login');
    }
  }

  return (
    <div className="user-menu" ref={container}>
      <button
        type="button"
        ref={trigger}
        className={open ? 'user-trigger open' : 'user-trigger'}
        aria-haspopup="menu"
        aria-label={`${username} 계정 메뉴`}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <span className="user-avatar" aria-hidden="true">
          {username.slice(0, 1).toUpperCase()}
        </span>
        <span className="user-trigger-text">
          <span className="user-name">{username}</span>
          <span className="user-role">{roleLabel}</span>
        </span>
        <ChevronIcon />
      </button>
      {open && (
        <div
          className="user-panel"
          role="menu"
          aria-label="계정 메뉴"
          onKeyDown={(event) => {
            const items = [
              ...event.currentTarget.querySelectorAll<HTMLElement>(
                '[role="menuitem"]:not(:disabled)',
              ),
            ];
            const index = items.indexOf(document.activeElement as HTMLElement);
            const next =
              event.key === 'ArrowDown'
                ? (index + 1) % items.length
                : event.key === 'ArrowUp'
                  ? (index + items.length - 1) % items.length
                  : event.key === 'Home'
                    ? 0
                    : event.key === 'End'
                      ? items.length - 1
                      : undefined;
            if (next !== undefined) {
              event.preventDefault();
              items[next]?.focus();
            }
            if (event.key === 'Tab') {
              setOpen(false);
            }
          }}
        >
          <div className="user-panel-identity">
            <span className="user-avatar large" aria-hidden="true">
              {username.slice(0, 1).toUpperCase()}
            </span>
            <span className="user-panel-text">
              <span className="user-panel-name">
                {username}
                <span className="user-badge">{roleLabel}</span>
              </span>
              <span className="user-panel-meta">로그인됨</span>
            </span>
          </div>
          <div className="user-panel-divider" />
          <Link
            role="menuitem"
            className="user-panel-item"
            to={role === 'ADMIN' ? '/settings/projects' : '/settings/instances'}
            onClick={() => setOpen(false)}
          >
            <SettingsIcon />
            {role === 'VIEWER' ? '설정 조회' : '설정 관리'}
          </Link>
          <button
            type="button"
            role="menuitem"
            className="user-panel-item"
            onClick={handleLogout}
            disabled={signingOut}
          >
            <LogoutIcon />
            {signingOut ? '로그아웃하는 중…' : '로그아웃'}
          </button>
        </div>
      )}
    </div>
  );
}

const lineIcon = (children: React.ReactNode) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.7"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    {children}
  </svg>
);
function ChevronIcon() {
  return <span className="user-chevron">{lineIcon(<path d="m6 9 6 6 6-6" />)}</span>;
}
function LogoutIcon() {
  return (
    <span className="user-item-icon">
      {lineIcon(
        <>
          <path d="M15 17v2a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v2" />
          <path d="M20 12H10m10 0-3-3m3 3-3 3" />
        </>,
      )}
    </span>
  );
}
function SettingsIcon() {
  return (
    <span className="user-item-icon">
      {lineIcon(
        <>
          <path d="M4 7h16M4 17h16" />
          <circle cx="9" cy="7" r="3" />
          <circle cx="15" cy="17" r="3" />
        </>,
      )}
    </span>
  );
}
