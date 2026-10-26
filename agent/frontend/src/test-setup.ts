// 화면 테스트의 브라우저 API 환경 설정
import '@testing-library/jest-dom/vitest';
import { configure } from '@testing-library/dom';

configure({ asyncUtilTimeout: 5_000 });

// ProLayout 반응형 분기는 실제 브라우저에서 검사하고 DOM 테스트에는 안정적인 데스크톱 기본값 제공
if (!window.matchMedia) {
  window.matchMedia = (media) => ({
    matches: false,
    media,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  });
}

// 선택 메뉴의 포커스 및 위치 계산에 필요한 브라우저 API 제공
if (!window.PointerEvent) {
  window.PointerEvent = MouseEvent as typeof PointerEvent;
}
HTMLElement.prototype.hasPointerCapture = () => false;
HTMLElement.prototype.setPointerCapture = () => {};
HTMLElement.prototype.releasePointerCapture = () => {};
HTMLElement.prototype.scrollIntoView = () => {};
if (!window.ResizeObserver) {
  window.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}
