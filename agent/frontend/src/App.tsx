// 로그인 사용자 권한에 따라 메뉴 및 화면 경로 구성
import { lazy, Suspense, useEffect, useState, type ReactNode } from 'react';
import { NavLink, Route, Routes, useLocation } from 'react-router-dom';
import UserMenu from './components/UserMenu';
import { usePermissions } from './components/PermissionContext';
import { Modal } from './components/ui';
import './app.css';

const DashboardPage = lazy(() => import('./pages/DashboardPage'));
const ProjectsPage = lazy(() => import('./pages/ProjectsPage'));
const InstancesPage = lazy(() => import('./pages/InstancesPage'));
const ServerCollectionPage = lazy(() => import('./pages/ServerCollectionPage'));
const InstanceDetailPage = lazy(() => import('./pages/InstanceDetailPage'));
const ApiMonitoringPage = lazy(() => import('./pages/ApiMonitoringPage'));
const CertificatesPage = lazy(() => import('./pages/CertificatesPage'));
const SettingsPage = lazy(() => import('./pages/SettingsPage'));

type NavigationItem = {
  label: string;
  to: string;
  icon: ReactNode;
  matches: (path: string) => boolean;
};

const navigation: NavigationItem[] = [
  { label: '종합 현황', to: '/', matches: (path) => path === '/', icon: <OverviewIcon /> },
  {
    label: '프로젝트',
    to: '/projects',
    matches: (path) => path.startsWith('/projects') || path === '/instances',
    icon: <ProjectIcon />,
  },
  {
    label: 'API 모니터링',
    to: '/api-monitoring',
    matches: (path) => path.startsWith('/api-monitoring'),
    icon: <PulseIcon />,
  },
  {
    label: '인증서 관리',
    to: '/certificates',
    matches: (path) => path.startsWith('/certificates'),
    icon: <CertificateIcon />,
  },
  {
    label: '설정',
    to: '/settings/projects',
    matches: (path) => path.startsWith('/settings'),
    icon: <SettingsIcon />,
  },
];

export default function App() {
  const { pathname, search } = useLocation();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);
  return (
    <div className={`app-shell${collapsed ? ' sidebar-collapsed' : ''}`}>
      <a className="skip-link" href="#main-content">
        본문으로 건너뛰기
      </a>
      <aside className="side-rail">
        <Sidebar pathname={pathname} />
      </aside>
      <Modal
        variant="sidebar"
        isOpen={mobileOpen}
        onClose={() => setMobileOpen(false)}
        aria-label="주 메뉴"
        closeLabel="메뉴 닫기"
      >
        <Sidebar pathname={pathname} onNavigate={() => setMobileOpen(false)} />
      </Modal>
      <div className="workspace">
        <header className="topbar">
          <div className="topbar-start">
            <button
              type="button"
              className="sidebar-toggle desktop-toggle"
              aria-label={collapsed ? '사이드 메뉴 펼치기' : '사이드 메뉴 접기'}
              aria-expanded={!collapsed}
              onClick={() => setCollapsed((value) => !value)}
            >
              <MenuIcon />
            </button>
            <button
              type="button"
              className="sidebar-toggle mobile-toggle"
              aria-label="메뉴 열기"
              aria-expanded={mobileOpen}
              onClick={() => setMobileOpen(true)}
            >
              <MenuIcon />
            </button>
            <div className="topbar-context">
              <h1 className="topbar-title">{pageTitle(pathname, search)}</h1>
            </div>
          </div>
          <UserMenu />
        </header>
        <main id="main-content" tabIndex={-1}>
          <Suspense
            fallback={
              <div className="route-loading" role="status">
                <span className="loading-mark" />
                화면을 불러오는 중입니다.
              </div>
            }
          >
            <Routes>
              <Route path="/" element={<DashboardPage />} />
              <Route path="/projects" element={<ProjectsPage />} />
              <Route path="/instances" element={<ServerCollectionPage />} />
              <Route path="/projects/:projectId" element={<InstancesPage />} />
              <Route
                path="/projects/:projectId/instances/:instanceId"
                element={<InstanceDetailPage />}
              />
              <Route path="/api-monitoring" element={<ApiMonitoringPage />} />
              <Route path="/certificates" element={<CertificatesPage />} />
              <Route path="/settings/*" element={<SettingsPage />} />
            </Routes>
          </Suspense>
        </main>
      </div>
    </div>
  );
}

function currentSection(pathname: string) {
  return navigation.find((item) => item.matches(pathname))?.label ?? '';
}

function Brand() {
  return (
    <div className="brand">
      <img className="brand-mark" src="/monitoring.svg" alt="" />
      <span className="brand-text">
        <strong>Hermes Monitoring</strong>
        <small>운영 모니터링</small>
      </span>
    </div>
  );
}

function pageTitle(pathname: string, search: string) {
  if (pathname === '/instances') {
    return new URLSearchParams(search).get('collection') === 'UP'
      ? '수집 정상 서버'
      : '전체 서버 수집 현황';
  }
  const segments = pathname.split('/');
  if (segments[1] === 'projects' && segments[2]) {
    return segments[4] ? `${segments[2]} / ${segments[4]}` : `${segments[2]} 인스턴스`;
  }
  return currentSection(pathname);
}

const settingsItems = [
  { to: 'projects', label: '프로젝트 관리' },
  { to: 'instances', label: '인스턴스 관리' },
  { to: 'thresholds', label: '임계치 관리' },
  { to: 'certificates', label: '인증서 대상 관리' },
  { to: 'users', label: '사용자 관리' },
  { to: 'audit', label: '변경 이력' },
];
function Sidebar({ pathname, onNavigate }: { pathname: string; onNavigate?: () => void }) {
  const { isAdmin } = usePermissions();
  return (
    <>
      <Brand />
      <nav aria-label="주 메뉴" className="primary-navigation">
        <span className="nav-group-label">관제</span>
        {navigation.slice(0, 4).map((item) => (
          <NavigationLink key={item.to} item={item} pathname={pathname} onNavigate={onNavigate} />
        ))}
        <span className="nav-group-label nav-group-management">관리</span>
        <NavigationLink item={navigation[4]} pathname={pathname} onNavigate={onNavigate} />
      </nav>
      {pathname.startsWith('/settings') && (
        <nav className="sidebar-submenu" aria-label="설정 하위 메뉴">
          {settingsItems
            .filter((item) => isAdmin || !['projects', 'users', 'audit'].includes(item.to))
            .map((item) => (
              <NavLink
                key={item.to}
                to={`/settings/${item.to}`}
                onClick={onNavigate}
                className={({ isActive }) => (isActive ? 'submenu-link active' : 'submenu-link')}
              >
                <span className="submenu-dot" />
                {item.label}
              </NavLink>
            ))}
        </nav>
      )}
      <div className="sidebar-footer">
        <span>관제 범위</span>
        <p>프로젝트 · 서버 · API · 인증서</p>
      </div>
    </>
  );
}

function NavigationLink({
  item,
  pathname,
  onNavigate,
}: {
  item: NavigationItem;
  pathname: string;
  onNavigate?: () => void;
}) {
  const { isAdmin } = usePermissions();
  const active = item.matches(pathname);
  return (
    <NavLink
      to={item.label === '설정' && !isAdmin ? '/settings/instances' : item.to}
      onClick={onNavigate}
      className={active ? 'nav-link active' : 'nav-link'}
      aria-label={item.label}
      title={item.label}
      aria-current={active ? 'page' : undefined}
    >
      <span className="nav-icon" aria-hidden="true">
        {item.icon}
      </span>
      <span className="nav-label">{item.label}</span>
      {item.label === '설정' && (
        <span className="nav-arrow" aria-hidden="true">
          {lineIcon(<path d="m6 9 6 6 6-6" />)}
        </span>
      )}
    </NavLink>
  );
}

const lineIcon = (children: ReactNode) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.7"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    {children}
  </svg>
);
function MenuIcon() {
  return lineIcon(
    <>
      <path d="M4 6h16M4 12h10M4 18h16" />
    </>,
  );
}
function OverviewIcon() {
  return lineIcon(
    <>
      <path d="M4 13h6V4H4zM14 20h6v-9h-6zM4 20h6v-3H4zM14 7h6V4h-6z" />
    </>,
  );
}
function ProjectIcon() {
  return lineIcon(
    <>
      <path d="M4 7h6l2 2h8v10H4z" />
      <path d="M4 7V5h6l2 2" />
    </>,
  );
}
function PulseIcon() {
  return lineIcon(
    <>
      <path d="M3 12h4l2-6 4 12 2-6h6" />
    </>,
  );
}
function CertificateIcon() {
  return lineIcon(
    <>
      <path d="M7 3h10v18l-5-3-5 3z" />
      <path d="M10 8h4M10 12h4" />
    </>,
  );
}
function SettingsIcon() {
  return lineIcon(
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6 7 7M17 17l1.4 1.4M18.4 5.6 17 7M7 17l-1.4 1.4" />
    </>,
  );
}
