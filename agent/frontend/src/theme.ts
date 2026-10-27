// 화면 모드 저장 및 차트·공통 화면 갱신
import { useSyncExternalStore } from 'react';
import { theme as antTheme, type ThemeConfig } from 'antd';

export type Theme = 'light' | 'dark';
const storageKey = 'monitoring.theme';
const themeEvent = 'monitoring-theme-change';

// 전환 전 브랜드 색상과 글꼴을 공식 디자인 토큰으로 공유
export function getMonitoringTheme(appearance: Theme): ThemeConfig {
  const dark = appearance === 'dark';
  return {
    algorithm: dark ? antTheme.darkAlgorithm : antTheme.defaultAlgorithm,
    components: {
      Button: {
        colorError: dark ? '#ff9da6' : '#b42318',
        colorErrorHover: dark ? '#ffbdc3' : '#912018',
        colorErrorActive: dark ? '#f58490' : '#7a1c14',
      },
    },
    token: {
      fontFamily: '"Outfit Variable", "Noto Sans KR Variable", sans-serif',
      colorPrimary: dark ? '#c4b5fd' : '#5b21b6',
      colorTextLightSolid: dark ? '#201039' : '#ffffff',
      colorBgLayout: dark ? '#081321' : '#f5f7fb',
      colorBgContainer: dark ? '#101f33' : '#ffffff',
      colorBgElevated: dark ? '#11243b' : '#ffffff',
      colorText: dark ? '#e8f0fb' : '#101828',
      colorTextSecondary: dark ? '#b4c5dc' : '#475467',
      colorTextTertiary: dark ? '#91a8c4' : '#667085',
      colorTextDescription: dark ? '#b4c5dc' : '#475467',
      colorBorder: dark ? '#3a5573' : '#b9c7d8',
      colorBorderSecondary: dark ? '#2b415b' : '#dce3ed',
      colorLink: dark ? '#c4b5fd' : '#5b21b6',
      colorLinkHover: dark ? '#ddd6fe' : '#4c1d95',
      colorLinkActive: dark ? '#ddd6fe' : '#4c1d95',
      borderRadius: 8,
    },
  };
}

export function initializeTheme() {
  let theme: Theme = 'dark';
  try {
    if (localStorage.getItem(storageKey) === 'light') {
      theme = 'light';
    }
  } catch {
    // 저장소 접근이 제한된 브라우저에서는 현재 탭에만 적용
  }
  document.documentElement.dataset.theme = theme;
}

export function setTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  try {
    localStorage.setItem(storageKey, theme);
  } catch {
    // 저장 실패와 관계없이 현재 화면 모드 적용
  }
  window.dispatchEvent(new Event(themeEvent));
}

function subscribe(listener: () => void) {
  function onStorage(event: StorageEvent) {
    if (event.key === storageKey || event.key === null) {
      initializeTheme();
      listener();
    }
  }
  window.addEventListener(themeEvent, listener);
  window.addEventListener('storage', onStorage);
  return () => {
    window.removeEventListener(themeEvent, listener);
    window.removeEventListener('storage', onStorage);
  };
}

export function useTheme(): Theme {
  return useSyncExternalStore(
    subscribe,
    () => (document.documentElement.dataset.theme === 'light' ? 'light' : 'dark'),
    () => 'dark',
  );
}
