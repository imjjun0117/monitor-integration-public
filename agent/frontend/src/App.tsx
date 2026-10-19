// 로그인 사용자 권한에 따라 메뉴 및 화면 경로 구성
import { lazy, Suspense, useEffect, useState, useId, Fragment, type ReactNode } from 'react';
import { Link, NavLink, Route, Routes, useLocation } from 'react-router-dom';
import UserMenu from './components/UserMenu';
import { usePermissions } from './components/PermissionContext';
import { Modal } from './components/ui';
import './app.css';
import './monitoring-theme.css';
import { menuForPath } from './components/PermissionProvider';
import { Alert } from './components/ui';
import { ProjectScopeProvider, ProjectSelector, useProjectScope } from './components/ProjectScope';

const DashboardPage = lazy(() => import('./pages/DashboardPage'));
const IncidentsPage = lazy(() => import('./pages/incidents/IncidentsPage'));
const IncidentDetailPage = lazy(() => import('./pages/incidents/IncidentDetailPage'));
const ProjectsPage = lazy(() => import('./pages/ProjectsPage'));
const InstancesPage = lazy(() => import('./pages/InstancesPage'));
const ServerCollectionPage = lazy(() => import('./pages/ServerCollectionPage'));
const InstanceDetailPage = lazy(() => import('./pages/InstanceDetailPage'));
const ApiMonitoringPage = lazy(() => import('./pages/ApiMonitoringPage'));
const CertificatesPage = lazy(() => import('./pages/CertificatesPage'));
const SettingsPage = lazy(() => import('./pages/SettingsPage'));
const XlogPage = lazy(() => import('./pages/XlogPage'));
const LiveLogsPage = lazy(() => import('./pages/LiveLogsPage'));

type NavigationItem = {
  label: string;
  to: string;
  icon: ReactNode;
  matches: (path: string) => boolean;
};

const navigation: NavigationItem[] = [
  { label: '종합 현황', to: '/', matches: (path) => path === '/', icon: <OverviewIcon /> },
  {
    label: '장애 관리',
    to: '/incidents',
    matches: (path) => path.startsWith('/incidents'),
    icon: <PulseIcon />,
  },
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
  { label: 'XLog', to: '/xlog', matches: (path) => path.startsWith('/xlog'), icon: <PulseIcon /> },
  {
    label: '실시간 로그',
    to: '/logs',
    matches: (path) => path.startsWith('/logs'),
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
  return (
    <ProjectScopeProvider>
      <AppLayout />
    </ProjectScopeProvider>
  );
}

function AppLayout() {
  const { pathname, search } = useLocation();
  const { project } = useProjectScope();
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
          <div className="topbar-actions">
            <ProjectSelector />
            <UserMenu />
          </div>
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
            <RouteAccess>
              <Routes key={project}>
                <Route path="/" element={<DashboardPage />} />
                <Route path="/incidents" element={<IncidentsPage />} />
                <Route path="/incidents/:incidentId" element={<IncidentDetailPage />} />
                <Route path="/projects" element={<ProjectsPage />} />
                <Route path="/instances" element={<ServerCollectionPage />} />
                <Route path="/projects/:projectId" element={<InstancesPage />} />
                <Route
                  path="/projects/:projectId/instances/:instanceId"
                  element={<InstanceDetailPage />}
                />
                <Route path="/api-monitoring" element={<ApiMonitoringPage />} />
                <Route path="/certificates" element={<CertificatesPage />} />
                <Route path="/xlog" element={<XlogPage />} />
                <Route path="/logs" element={<LiveLogsPage />} />
                <Route path="/settings/*" element={<SettingsPage />} />
              </Routes>
            </RouteAccess>
          </Suspense>
        </main>
      </div>
    </div>
  );
}

// 메뉴 권한이 없는 화면은 데이터 조회 전에 차단
function RouteAccess({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const { isAdmin, menus } = usePermissions();
  if (!isAdmin && !menus?.find((menu) => menu.menuId === menuForPath(pathname))?.canRead) {
    return (
      <Alert variant="warning" title="이 화면에 접근할 권한이 없습니다.">
        담당 관리자에게 메뉴 권한을 요청하세요.
      </Alert>
    );
  }
  return children;
}

function currentSection(pathname: string) {
  return navigation.find((item) => item.matches(pathname))?.label ?? '';
}

function Brand({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <Link className="brand" to="/" aria-label="종합현황으로 이동" onClick={onNavigate}>
      <img className="brand-mark" src="/monitoring.svg" alt="" />
      <span className="brand-text">
        <strong>Monitoring</strong>
        <small>운영 모니터링</small>
      </span>
    </Link>
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
  if (pathname.startsWith('/settings/')) {
    return settingsItems.find((item) => pathname === `/settings/${item.to}`)?.label ?? '설정';
  }
  return currentSection(pathname);
}

const settingsItems = [
  { to: 'projects', label: '프로젝트 관리' },
  { to: 'instances', label: '인스턴스 관리' },
  { to: 'thresholds', label: '임계치 관리' },
  { to: 'certificates', label: '인증서 대상 관리' },
  { to: 'users', label: '사용자 관리' },
  { to: 'roles', label: '역할·권한 관리' },
  { to: 'menus', label: '메뉴 관리' },
  { to: 'audit', label: '변경 이력' },
];
function Sidebar({ pathname, onNavigate }: { pathname: string; onNavigate?: () => void }) {
  const { isAdmin, menus } = usePermissions();
  const [settingsOpen, setSettingsOpen] = useState(pathname.startsWith('/settings'));
  const submenuId = useId();
  useEffect(() => {
    if (pathname.startsWith('/settings')) {
      setSettingsOpen(true);
    }
  }, [pathname]);
  const visibleNavigation = navigation
    .map((item) => {
      const menu = menus?.find((value) => value.menuId === menuForPath(item.to));
      return {
        ...item,
        label: menu?.label ?? item.label,
        sort: menu?.sortOrder ?? navigation.indexOf(item),
      };
    })
    .filter(
      (item) => isAdmin || menus?.find((menu) => menu.menuId === menuForPath(item.to))?.canRead,
    )
    .sort((left, right) => left.sort - right.sort);
  return (
    <>
      <Brand onNavigate={onNavigate} />
      <nav aria-label="주 메뉴" className="primary-navigation">
        <span className="nav-group-label">관제</span>
        {visibleNavigation
          .filter((item) => !item.to.startsWith('/settings'))
          .map((item) => (
            <NavigationLink key={item.to} item={item} pathname={pathname} onNavigate={onNavigate} />
          ))}
        <span className="nav-group-label nav-group-management">관리</span>
        {visibleNavigation
          .filter((item) => item.to.startsWith('/settings'))
          .map((item) => (
            <button
              key={item.to}
              type="button"
              className={`nav-link settings-menu-toggle${item.matches(pathname) ? ' active' : ''}`}
              aria-label={item.label}
              title={item.label}
              aria-expanded={settingsOpen}
              aria-controls={submenuId}
              onClick={() => setSettingsOpen((value) => !value)}
            >
              <span className="nav-icon" aria-hidden="true">
                {item.icon}
              </span>
              <span className="nav-label">{item.label}</span>
              <span className="nav-arrow" aria-hidden="true">
                {lineIcon(<path d="m9 6 6 6-6 6" />)}
              </span>
            </button>
          ))}
      </nav>
      {visibleNavigation.some((item) => item.to.startsWith('/settings')) && (
        <div
          id={submenuId}
          className={`settings-menu-panel${settingsOpen ? ' expanded' : ''}`}
          aria-hidden={!settingsOpen}
          inert={!settingsOpen}
        >
          <div className="settings-menu-clip">
            <nav className="sidebar-submenu" aria-label="설정 하위 메뉴">
              {settingsItems
                .filter(
                  (item) =>
                    isAdmin ||
                    !['projects', 'users', 'menus', 'permissions', 'roles', 'audit'].includes(
                      item.to,
                    ),
                )
                .map((item, index) => (
                  <Fragment key={item.to}>
                    {(index === 0 || item.to === 'users') && (
                      <span className="settings-nav-group">
                        {index === 0 ? '모니터링 설정' : '접근·권한 관리'}
                      </span>
                    )}
                    <NavLink
                      key={item.to}
                      to={`/settings/${item.to}`}
                      onClick={onNavigate}
                      className={({ isActive }) =>
                        isActive ? 'submenu-link active' : 'submenu-link'
                      }
                    >
                      <span className="submenu-dot" />
                      {item.label}
                    </NavLink>
                  </Fragment>
                ))}
            </nav>
          </div>
        </div>
      )}
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
  const { project } = useProjectScope();
  const active = item.matches(pathname);
  return (
    <NavLink
      to={project ? `${item.to}?${new URLSearchParams({ project })}` : item.to}
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
