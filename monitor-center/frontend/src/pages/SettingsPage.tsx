// 설정 메뉴와 관리 화면 구성
import { usePermissions } from '../components/PermissionContext';
import { Alert } from '../components/ui';
import UserSettingsTab from './settings/UserSettingsTab';
import AuditSettingsTab from './settings/AuditSettingsTab';
import { useEffect, useState } from 'react';
import { Link, Navigate, useLocation } from 'react-router-dom';
import CertificateSettingsTab from './settings/CertificateSettingsTab';
import InstanceSettingsTab from './settings/InstanceSettingsTab';
import ProjectSettingsTab from './settings/ProjectSettingsTab';
import ThresholdSettingsTab from './settings/ThresholdSettingsTab';

export default function SettingsPage() {
  const section = useLocation().pathname.split('/').at(-1) ?? 'projects';
  const mobileReadonly = useMobileReadonly();
  const { isAdmin, canWrite } = usePermissions();
  if (!isAdmin && ['projects', 'users', 'audit'].includes(section)) {
    return <Navigate to="/settings/instances" replace />;
  }
  return (
    <>
      <p id="mobile-settings-note" className="mobile-readonly-notice" role="note">
        모바일에서는 조회만 지원합니다. 설정 변경은 태블릿 또는 데스크톱에서 진행해 주세요.
      </p>
      {!canWrite && (
        <Alert variant="info" title="조회 전용 계정입니다. 설정을 변경할 수 없습니다." />
      )}
      <nav aria-label="설정 탭" className="settings-nav">
        {isAdmin && (
          <Link aria-current={section === 'projects' ? 'page' : undefined} to="/settings/projects">
            프로젝트 관리
          </Link>
        )}
        <Link aria-current={section === 'instances' ? 'page' : undefined} to="/settings/instances">
          인스턴스 관리
        </Link>
        <Link
          aria-current={section === 'thresholds' ? 'page' : undefined}
          to="/settings/thresholds"
        >
          임계치 관리
        </Link>
        <Link
          aria-current={section === 'certificates' ? 'page' : undefined}
          to="/settings/certificates"
        >
          인증서 대상 관리
        </Link>
        {isAdmin && (
          <>
            <Link aria-current={section === 'users' ? 'page' : undefined} to="/settings/users">
              사용자 관리
            </Link>
            <Link aria-current={section === 'audit' ? 'page' : undefined} to="/settings/audit">
              변경 이력
            </Link>
          </>
        )}
      </nav>
      <fieldset
        className="settings-content"
        disabled={!canWrite || (mobileReadonly && section !== 'audit')}
        aria-describedby={mobileReadonly ? 'mobile-settings-note' : undefined}
      >
        {section === 'projects' && <ProjectSettingsTab />}
        {section === 'instances' && <InstanceSettingsTab />}
        {section === 'thresholds' && <ThresholdSettingsTab />}
        {section === 'certificates' && <CertificateSettingsTab />}
        {isAdmin && section === 'users' && <UserSettingsTab />}
        {isAdmin && section === 'audit' && <AuditSettingsTab />}
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
