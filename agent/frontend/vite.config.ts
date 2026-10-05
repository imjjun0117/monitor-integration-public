import { defineConfig } from 'vite'; import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// Spring serves the login page, so it is proxied alongside the API to keep the whole
// sign-in round trip on the dev origin. Tomcat builds the post-login redirect from the
// Host header, so changeOrigin stays off: rewriting Host to the backend would send the
// browser to the backend port and off the dev server.
const backend = { target: `http://127.0.0.1:${process.env.SERVER_PORT ?? 8080}`, changeOrigin: false };

export default defineConfig({plugins:[react(),tailwindcss()],server:{host:'127.0.0.1',proxy:{'/api/':backend,'/login':backend}},test:{environment:'jsdom',setupFiles:['./src/test-setup.ts'],include:['src/**/*.test.ts','src/**/*.test.tsx']}});
