import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { vi } from 'vitest';
import { ToastProvider } from '../context/ToastContext';
import { AuthProvider } from '../context/AuthContext';
import AppRoutes from '../routes/AppRoutes';

const jsonRes = (status, body) => Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(body) });
const mount = (path) => render(<MemoryRouter initialEntries={[path]}><ToastProvider><AuthProvider><AppRoutes /></AuthProvider></ToastProvider></MemoryRouter>);

afterEach(() => vi.restoreAllMocks());

test('unknown URL renders the 404 page in place (signed out)', async () => {
  vi.stubGlobal('fetch', vi.fn(() => jsonRes(401, { code: 'NO_REFRESH_TOKEN' }))); // no session
  mount('/definitely/not/a/page');
  expect(await screen.findByText('Page not found')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: /sign in/i })).toHaveAttribute('href', '/login');
});

test('protected route redirects signed-out users to login', async () => {
  vi.stubGlobal('fetch', vi.fn(() => jsonRes(401, {})));
  mount('/admin/dashboard');
  expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
});

test('signed-in student gets 403 on admin area and 404 link goes to their own dashboard', async () => {
  vi.stubGlobal('fetch', vi.fn((url) => (String(url).includes('/auth/refresh')
    ? jsonRes(200, { data: { accessToken: 't', user: { _id: '1', name: 'S', role: 'STUDENT', email: 's@x.co' } } })
    : jsonRes(200, { data: {} }))));
  mount('/admin/users');
  expect(await screen.findByText('You do not have access to this page')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: /dashboard/i })).toHaveAttribute('href', '/student/dashboard');
});

test('verify-email page uses POST (GET handler was removed server-side)', async () => {
  const f = vi.fn((url, opts) => (String(url).includes('/auth/verify-email') ? jsonRes(200, { message: 'Email verified successfully.' }) : jsonRes(401, {})));
  vi.stubGlobal('fetch', f);
  mount('/verify-email?token=abcdefghijklmnop');
  await waitFor(() => expect(screen.getByText(/Email verified successfully/)).toBeInTheDocument());
  const call = f.mock.calls.find(([u]) => String(u).includes('/auth/verify-email'));
  expect(call[1].method).toBe('POST');
});
