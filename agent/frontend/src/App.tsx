// 로그인 사용자 권한에 따라 Pro 레이아웃 메뉴 및 화면 경로 구성
import { lazy, Suspense, useEffect, useState, type ReactNode } from 'react';
import { Alert, App as AntApp, Button, ConfigProvider, Grid, theme as antTheme } from 'antd';
import koKR from 'antd/locale/ko_KR';
import { PageContainer, ProLayout } from '@ant-design/pro-components';
import {
  AppstoreOutlined,
  AlertOutlined,
  ProjectOutlined,
  ApiOutlined,
  LineChartOutlined,
  FileTextOutlined,
  SafetyCertificateOutlined,
  SettingOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
} from '@ant-design/icons';
import { Link, Route, Routes, useLocation } from 'react-router-dom';
import UserMenu from './components/UserMenu';
import { usePermissions } from './components/PermissionContext';
import './app.css';
import './pro-layout.css';
import { menuForPath } from './components/PermissionProvider';
import { ProjectScopeProvider, ProjectSelector, useProjectScope } from './components/ProjectScope';
import { getMonitoringTheme, useTheme } from './theme';

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
const MOBILE_NAVIGATION_QUERY = '(max-width: 991px)';

type NavigationItem = { label: string; to: string; icon: ReactNode };
type VisibleNavigationItem = NavigationItem & { sort: number; canRead?: boolean };
const navigation: NavigationItem[] = [
  { label: '종합 현황', to: '/', icon: <AppstoreOutlined aria-hidden="true" /> },
  { label: '장애 관리', to: '/incidents', icon: <AlertOutlined aria-hidden="true" /> },
  { label: '프로젝트', to: '/projects', icon: <ProjectOutlined aria-hidden="true" /> },
  { label: 'API 모니터링', to: '/api-monitoring', icon: <ApiOutlined aria-hidden="true" /> },
  { label: 'XLog', to: '/xlog', icon: <LineChartOutlined aria-hidden="true" /> },
  { label: '실시간 로그', to: '/logs', icon: <FileTextOutlined aria-hidden="true" /> },
  {
    label: '인증서 관리',
    to: '/certificates',
    icon: <SafetyCertificateOutlined aria-hidden="true" />,
  },
  { label: '설정', to: '/settings/projects', icon: <SettingOutlined aria-hidden="true" /> },
];
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

function visibleNavigationFor(
  menus: ReturnType<typeof usePermissions>['menus'],
  isAdmin: boolean,
): VisibleNavigationItem[] {
  return navigation
    .map((item, index) => {
      const menu = menus?.find((value) => value.menuId === menuForPath(item.to));
      return {
        ...item,
        label: menu?.label ?? item.label,
        sort: menu?.sortOrder ?? index,
        canRead: menu?.canRead,
      };
    })
    .filter((item) => isAdmin || item.canRead)
    .sort((left, right) => left.sort - right.sort);
}

function layoutRoutesFor(items: VisibleNavigationItem[], isAdmin: boolean) {
  return items.map((item) => ({
    path: item.to.startsWith('/settings') ? '/settings' : item.to,
    name: item.label,
    icon: item.icon,
    ...(item.to.startsWith('/settings')
      ? {
          routes: settingsItems
            .filter(
              (setting) =>
                isAdmin || !['projects', 'users', 'menus', 'roles', 'audit'].includes(setting.to),
            )
            .map((setting) => ({ path: `/settings/${setting.to}`, name: setting.label })),
        }
      : {}),
  }));
}

export default function App() {
  const appearance = useTheme();
  return (
    <ConfigProvider locale={koKR} theme={getMonitoringTheme(appearance)}>
      <AntApp>
        <ProjectScopeProvider>
          <AppLayout />
        </ProjectScopeProvider>
      </AntApp>
    </ConfigProvider>
  );
}

function AppLayout() {
  const { token } = antTheme.useToken();
  const screens = Grid.useBreakpoint();
  const [collapsed, setCollapsed] = useState(
    () => window.matchMedia(MOBILE_NAVIGATION_QUERY).matches,
  );
  // ProLayout mix 모드의 빈 고정 헤더는 시각적 자리표시자이므로 banner 탐색에서 제외
  useEffect(() => {
    const spacers = document.querySelectorAll('.monitor-pro-layout header.ant-layout-header:empty');
    for (const spacer of spacers) {
      spacer.setAttribute('role', 'presentation');
    }
  }, []);
  const { pathname, search } = useLocation();
  const { project } = useProjectScope();
  const { isAdmin, menus } = usePermissions();
  const routes = layoutRoutesFor(visibleNavigationFor(menus, isAdmin), isAdmin);
  const currentMenu = navigation.find((item) =>
    item.to === '/'
      ? pathname === '/'
      : pathname.startsWith(item.to.split('/').slice(0, 2).join('/')),
  );
  const selectedPath = pathname.startsWith('/settings/') ? pathname : (currentMenu?.to ?? pathname);

  return (
    <div
      className="monitor-app-canvas"
      style={{ minHeight: '100vh', background: token.colorBgLayout }}
    >
      <a className="skip-link" href="#main-content">
        본문으로 건너뛰기
      </a>
      <ProLayout
        className="monitor-pro-layout"
        layout="mix"
        splitMenus={false}
        title="Monitoring"
        logo="/monitoring.svg"
        token={{
          bgLayout: token.colorBgLayout,
          header: {
            colorBgHeader: token.colorBgContainer,
            colorHeaderTitle: token.colorText,
            colorTextMenu: token.colorTextSecondary,
            colorTextRightActionsItem: token.colorText,
          },
          sider: {
            colorMenuBackground: token.colorBgContainer,
            colorTextMenu: token.colorTextSecondary,
            colorTextMenuSelected: token.colorLink,
            colorTextMenuItemHover: token.colorLinkHover,
          },
        }}
        route={{ path: '/', routes }}
        menuProps={{ 'aria-label': '주 메뉴' }}
        collapsed={collapsed}
        onCollapse={setCollapsed}
        location={{ pathname: selectedPath }}
        menuItemRender={(item, dom) => {
          if (!item.path || item.path === '/settings') {
            return dom;
          }
          const to = project ? `${item.path}?${new URLSearchParams({ project })}` : item.path;
          return (
            <Link
              to={to}
              aria-current={item.path === selectedPath ? 'page' : undefined}
              onClick={() => {
                if (window.matchMedia(MOBILE_NAVIGATION_QUERY).matches) {
                  setCollapsed(true);
                }
              }}
            >
              {dom}
            </Link>
          );
        }}
        collapsedButtonRender={false}
        headerContentRender={(layout) => (
          <Button
            type="text"
            aria-label={
              layout.isMobile
                ? layout.collapsed
                  ? '메뉴 열기'
                  : '메뉴 닫기'
                : layout.collapsed
                  ? '사이드 메뉴 펼치기'
                  : '사이드 메뉴 접기'
            }
            aria-expanded={!layout.collapsed}
            onClick={() => layout.onCollapse?.(!layout.collapsed)}
            icon={layout.collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
          />
        )}
        actionsRender={() => [<ProjectSelector key="project" />, <UserMenu key="user" />]}
        headerTitleRender={(logo, title) => (
          <Link to="/" aria-label="종합현황으로 이동" style={{ gap: token.marginSM }}>
            {logo}
            {title}
            <span style={{ fontSize: token.fontSizeSM, color: token.colorTextSecondary }}>
              운영 모니터링
            </span>
          </Link>
        )}
        menuHeaderRender={false}
        contentWidth="Fluid"
      >
        <section id="main-content" tabIndex={-1}>
          <PageContainer
            token={{
              paddingInlinePageContainerContent: screens.md ? token.paddingLG : token.padding,
              paddingBlockPageContainerContent: token.paddingLG,
            }}
            title={
              <h1
                style={{
                  fontSize: 'inherit',
                  lineHeight: 'inherit',
                  margin: 0,
                  whiteSpace: 'normal',
                }}
              >
                {pageTitle(pathname, search)}
              </h1>
            }
          >
            <Suspense fallback={<div role="status">화면을 불러오는 중입니다.</div>}>
              <RouteAccess>
                <MonitoringRoutes project={project} />
              </RouteAccess>
            </Suspense>
          </PageContainer>
        </section>
      </ProLayout>
    </div>
  );
}

function MonitoringRoutes({ project }: { project: string }) {
  return (
    <Routes key={project}>
      <Route path="/" element={<DashboardPage />} />
      <Route path="/incidents" element={<IncidentsPage />} />
      <Route path="/incidents/:incidentId" element={<IncidentDetailPage />} />
      <Route path="/projects" element={<ProjectsPage />} />
      <Route path="/instances" element={<ServerCollectionPage />} />
      <Route path="/projects/:projectId" element={<InstancesPage />} />
      <Route path="/projects/:projectId/instances/:instanceId" element={<InstanceDetailPage />} />
      <Route path="/api-monitoring" element={<ApiMonitoringPage />} />
      <Route path="/certificates" element={<CertificatesPage />} />
      <Route path="/xlog" element={<XlogPage />} />
      <Route path="/logs" element={<LiveLogsPage />} />
      <Route path="/settings/*" element={<SettingsPage />} />
    </Routes>
  );
}

// 메뉴 권한이 없는 화면은 데이터 조회 전에 차단
function RouteAccess({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const { isAdmin, menus } = usePermissions();
  if (!isAdmin && !menus?.find((menu) => menu.menuId === menuForPath(pathname))?.canRead) {
    return (
      <Alert
        type="warning"
        showIcon
        message="이 화면에 접근할 권한이 없습니다."
        description="담당 관리자에게 메뉴 권한을 요청하세요."
      />
    );
  }
  return children;
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
  return (
    navigation.find((item) => item.to === pathname)?.label ??
    navigation.find((item) => item.to !== '/' && pathname.startsWith(item.to))?.label ??
    ''
  );
}
