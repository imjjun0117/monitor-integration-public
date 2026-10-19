// 저장한 화면 모드를 첫 화면 렌더링 전에 적용
(function () {
  let theme = 'dark';
  try {
    if (localStorage.getItem('monitoring.theme') === 'light') {
      theme = 'light';
    }
  } catch {
    // 저장소 접근이 제한되면 기본 화면 모드 유지
  }
  document.documentElement.dataset.theme = theme;
})();
