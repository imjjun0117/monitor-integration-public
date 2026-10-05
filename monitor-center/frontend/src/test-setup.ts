// 화면 테스트의 브라우저 API 환경 설정
import '@testing-library/jest-dom/vitest';
import { configure } from '@testing-library/dom';

configure({ asyncUtilTimeout: 5_000 });

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
