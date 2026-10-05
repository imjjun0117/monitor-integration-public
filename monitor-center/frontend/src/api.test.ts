import { afterEach, expect, test, vi } from 'vitest';
import { isUnauthorized } from './api';
import { ApiError, OpenAPI } from './generated';

afterEach(() => {
  document.cookie = 'XSRF-TOKEN=; Max-Age=0; path=/';
  vi.unstubAllGlobals();
});

test('hydrates a missing CSRF cookie before authenticated API requests', async () => {
  document.cookie = 'XSRF-TOKEN=; Max-Age=0; path=/';
  const fetch = vi.fn(async () => {
    document.cookie = 'XSRF-TOKEN=real%2Btoken; path=/';
    return new Response('', { status: 200 });
  });
  vi.stubGlobal('fetch', fetch);

  const headersResolver = OpenAPI.HEADERS;
  expect(typeof headersResolver).toBe('function');
  if (typeof headersResolver !== 'function') {
    throw new Error('headers resolver is unavailable');
  }
  const headers = await headersResolver({
    method: 'POST',
    url: '/projects',
  });

  expect(fetch).toHaveBeenCalledWith('/login', {
    cache: 'no-store',
    credentials: 'same-origin',
  });
  expect(headers['X-XSRF-TOKEN']).not.toBe('real+token');
  expect(unmask(headers['X-XSRF-TOKEN'])).toBe('real+token');
});

test('only a rejected session counts as unauthorized', () => {
  expect(isUnauthorized(apiError(401))).toBe(true);
  expect(isUnauthorized(apiError(403))).toBe(false);
  expect(isUnauthorized(apiError(500))).toBe(false);
  expect(isUnauthorized(new TypeError('network down'))).toBe(false);
  expect(isUnauthorized(undefined)).toBe(false);
});

function apiError(status: number) {
  return new ApiError(
    { method: 'GET', url: '/session/me' },
    { url: '/session/me', ok: false, status, statusText: '', body: {} },
    'failed',
  );
}

function unmask(value: string) {
  const encoded = value.replaceAll('-', '+').replaceAll('_', '/');
  const bytes = Uint8Array.from(atob(encoded), (character) => character.charCodeAt(0));
  const half = bytes.length / 2;
  const token = bytes.slice(half).map((byte, index) => byte ^ bytes[index]);
  return new TextDecoder().decode(token);
}
