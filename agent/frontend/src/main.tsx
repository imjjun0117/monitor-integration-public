// 공통 조회 설정과 권한 제공자를 연결하여 화면 실행
import React from 'react';
import { createRoot } from 'react-dom/client';
import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import './tailadmin.css';
import App from './App';
import PermissionProvider from './components/PermissionProvider';
import { LOGIN_PATH, isUnauthorized } from './api';

// 세션 만료 시 반복되는 401 오류를 화면별로 표시하지 않고 로그인 화면으로 한 번 이동
let redirecting = false;
function signInAgain(error: unknown) {
  if (redirecting || !isUnauthorized(error)) {
    return;
  }
  redirecting = true;
  window.location.assign(LOGIN_PATH);
}

const queryClient = new QueryClient({
  queryCache: new QueryCache({ onError: signInAgain }),
  mutationCache: new MutationCache({ onError: signInAgain }),
  defaultOptions: {
    queries: { retry: (failureCount, error) => !isUnauthorized(error) && failureCount < 3 },
    mutations: { retry: false },
  },
});
const root = document.getElementById('root');
if (!root) {
  throw new Error('Application root is missing');
}

createRoot(root).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <PermissionProvider>
          <App />
        </PermissionProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>,
);
