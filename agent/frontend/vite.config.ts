import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

// Spring 로그인 페이지를 API와 동일 origin으로 프록시하여 인증 왕복 유지
const backend = {
  target: `http://127.0.0.1:${process.env.SERVER_PORT ?? 8080}`,
  changeOrigin: false,
};
const proEntry = fileURLToPath(
  new URL('./node_modules/@ant-design/pro-components/es/index.js', import.meta.url),
);

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'spring-login-dev-entry',
      configureServer(server) {
        // 개발 중에도 Spring 템플릿의 동일한 자산 URL을 Vite 엔트리로 연결
        server.middlewares.use((request, _response, next) => {
          if (request.url === '/assets/login.js') {
            request.url = '/src/login/main.tsx';
          }
          next();
        });
      },
    },
  ],
  build: {
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL('./index.html', import.meta.url)),
        login: fileURLToPath(new URL('./src/login/main.tsx', import.meta.url)),
      },
      output: {
        entryFileNames: (chunk) =>
          chunk.name === 'login' ? 'assets/login.js' : 'assets/[name]-[hash].js',
      },
    },
  },
  server: { host: '127.0.0.1', proxy: { '/api/': backend, '/login': backend } },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test-setup.ts'],
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    testTimeout: 20_000,
    // AntD/JSDOM 페이지는 메모리·CPU 사용이 커서 병렬 과부하로 타임아웃되지 않도록 제한
    maxWorkers: 2,
    alias: [{ find: /^@ant-design\/pro-components$/, replacement: proEntry }],
    server: { deps: { inline: [/antd/, /@ant-design/, /@rc-component/] } },
  },
});
