import '@vitejs/plugin-react/preamble';
import { createRoot } from 'react-dom/client';
import LoginPage from './LoginPage';

const root = document.getElementById('login-root');
if (!root) {
  throw new Error('Login root is missing');
}

createRoot(root).render(<LoginPage />);
