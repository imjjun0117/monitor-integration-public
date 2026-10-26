import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import LoginPage from './LoginPage';

describe('Spring login UI', () => {
  it('renders official controls inside a native same-origin POST form', () => {
    document.body.innerHTML =
      '<form method="post" action="/api/v1/session/login"><input id="login-csrf" type="hidden" name="_csrf" value="test-token"><div id="login-root"></div></form>';
    render(<LoginPage />, { container: document.getElementById('login-root')! });
    const form = document.querySelector('form');

    expect(form).toHaveAttribute('method', 'post');
    expect(form).toHaveAttribute('action', '/api/v1/session/login');
    expect(form).toContainElement(document.getElementById('login-csrf'));
    expect(screen.getByRole('textbox', { name: '아이디' })).toHaveAttribute('name', 'username');
    expect(screen.getByRole('textbox', { name: '아이디' })).toHaveAttribute(
      'autocomplete',
      'username',
    );
    expect(screen.getByLabelText('비밀번호')).toHaveAttribute('name', 'password');
    expect(screen.getByLabelText('비밀번호')).toHaveAttribute('autocomplete', 'current-password');
    expect(screen.getByRole('button', { name: 'Login' })).toHaveAttribute('type', 'submit');
  });

  it('shows only the server-selected generic error as an accessible alert', () => {
    document.body.innerHTML =
      '<input id="login-csrf" type="hidden" name="_csrf" value="test-token">';
    document.body.dataset.loginError = 'true';
    render(<LoginPage />);

    expect(screen.getByRole('alert')).toHaveTextContent('아이디 또는 비밀번호를 확인해 주세요.');
    delete document.body.dataset.loginError;
  });
});
