// 화면 모드 저장 및 차트·공통 화면 갱신
import { useSyncExternalStore } from 'react';

export type Theme = 'light' | 'dark';
const storageKey = 'monitoring.theme';
const themeEvent = 'monitoring-theme-change';

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
