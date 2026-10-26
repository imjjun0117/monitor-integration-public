// 설정 메뉴와 관리 화면 구성
import { usePermissions } from '../components/PermissionContext';
import { Alert, theme } from 'antd';
import UserSettingsTab from './settings/UserSettingsTab';
import AuditSettingsTab from './settings/AuditSettingsTab';
import MenuSettingsTab from './settings/MenuSettingsTab';
import RoleSettingsTab from './settings/RoleSettingsTab';
import { useEffect, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import CertificateSettingsTab from './settings/CertificateSettingsTab';
import InstanceSettingsTab from './settings/InstanceSettingsTab';
import ProjectSettingsTab from './settings/ProjectSettingsTab';
import ThresholdSettingsTab from './settings/ThresholdSettingsTab';

export default function SettingsPage() {
  const { token } = theme.useToken();
  const section = useLocation().pathname.split('/').at(-1) ?? 'projects';
  const mobileReadonly = useMobileReadonly();
  const { isAdmin, canWrite } = usePermissions();
  if (
    !isAdmin &&
    ['projects', 'users', 'menus', 'permissions', 'roles', 'audit'].includes(section)
  ) {
    return <Navigate to="/settings/instances" replace />;
  }
  return (
    <>
      {mobileReadonly && (
        <Alert
          id="mobile-settings-note"
          role="note"
          type="info"
          showIcon
          title="모바일에서는 조회만 지원합니다. 설정 변경은 태블릿 또는 데스크톱에서 진행해 주세요."
          style={{ marginBottom: token.marginLG }}
        />
      )}
      {!canWrite && <Alert type="info" title="조회 전용 계정입니다. 설정을 변경할 수 없습니다." />}
      <fieldset
        className="settings-content"
        disabled={
          (!canWrite && section !== 'thresholds') || (mobileReadonly && section !== 'audit')
        }
        aria-describedby={mobileReadonly ? 'mobile-settings-note' : undefined}
      >
        {section === 'projects' && <ProjectSettingsTab />}
        {section === 'instances' && <InstanceSettingsTab />}
        {section === 'thresholds' && <ThresholdSettingsTab />}
        {section === 'certificates' && <CertificateSettingsTab />}
        {isAdmin && section === 'users' && <UserSettingsTab />}
        {isAdmin && section === 'audit' && <AuditSettingsTab />}
        {isAdmin && section === 'menus' && <MenuSettingsTab />}
        {isAdmin && section === 'roles' && <RoleSettingsTab />}
        {isAdmin && section === 'permissions' && <Navigate to="/settings/roles" replace />}
      </fieldset>
    </>
  );
}

function useMobileReadonly() {
  const query = '(max-width: 767px)';
  const [matches, setMatches] = useState(
    () => typeof matchMedia === 'function' && matchMedia(query).matches,
  );
  useEffect(() => {
    if (typeof matchMedia !== 'function') {
      return undefined;
    }
    const media = matchMedia(query);
    const update = () => setMatches(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  return matches;
}
