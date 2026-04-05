import { describe, it, expect, beforeEach } from 'vitest';
import { useAuthStore } from '@/store/auth.store';
import type { AuthUser } from '@/types/api';

const mockUser: AuthUser = { id: 1, email: 'alice@example.com', name: 'Alice' };
const ACCESS  = 'access.token.abc';
const REFRESH = 'refresh.token.xyz';

// Reset Zustand store state before every test
beforeEach(() => {
  useAuthStore.setState({
    accessToken: null,
    refreshToken: null,
    user: null,
    isAuthenticated: false,
  });
});

// ── Initial state ──────────────────────────────────────────────────────────────

describe('useAuthStore — initial state', () => {
  it('starts unauthenticated with null tokens and user', () => {
    const { accessToken, refreshToken, user, isAuthenticated } = useAuthStore.getState();
    expect(accessToken).toBeNull();
    expect(refreshToken).toBeNull();
    expect(user).toBeNull();
    expect(isAuthenticated).toBe(false);
  });
});

// ── setAuth() ─────────────────────────────────────────────────────────────────

describe('useAuthStore — setAuth()', () => {
  it('sets all auth fields and marks isAuthenticated=true', () => {
    useAuthStore.getState().setAuth(ACCESS, REFRESH, mockUser);

    const state = useAuthStore.getState();
    expect(state.accessToken).toBe(ACCESS);
    expect(state.refreshToken).toBe(REFRESH);
    expect(state.user).toEqual(mockUser);
    expect(state.isAuthenticated).toBe(true);
  });
});

// ── setTokens() ───────────────────────────────────────────────────────────────

describe('useAuthStore — setTokens()', () => {
  it('updates only the tokens, leaves user unchanged', () => {
    useAuthStore.setState({ user: mockUser, isAuthenticated: true });

    useAuthStore.getState().setTokens('new.access', 'new.refresh');

    const state = useAuthStore.getState();
    expect(state.accessToken).toBe('new.access');
    expect(state.refreshToken).toBe('new.refresh');
    expect(state.user).toEqual(mockUser); // unchanged
  });
});

// ── logout() ──────────────────────────────────────────────────────────────────

describe('useAuthStore — logout()', () => {
  it('clears all auth state', () => {
    useAuthStore.getState().setAuth(ACCESS, REFRESH, mockUser);

    useAuthStore.getState().logout();

    const state = useAuthStore.getState();
    expect(state.accessToken).toBeNull();
    expect(state.refreshToken).toBeNull();
    expect(state.user).toBeNull();
    expect(state.isAuthenticated).toBe(false);
  });

  it('is idempotent — calling logout twice does not throw', () => {
    useAuthStore.getState().logout();
    expect(() => useAuthStore.getState().logout()).not.toThrow();
  });
});
