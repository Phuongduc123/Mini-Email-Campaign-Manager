/**
 * Unit tests for AuthService.
 * All DB calls and crypto ops are mocked — no database connection required.
 */

import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { AuthService } from '../modules/auth/auth.service';
import { AuthRepository } from '../modules/auth/auth.repository';
import { User } from '../database/models/User';
import { RefreshToken } from '../database/models/RefreshToken';
import { ConflictError, UnauthorizedError } from '../shared/utils/errors';

jest.mock('../config/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

jest.mock('bcryptjs');
const mockBcrypt = bcrypt as jest.Mocked<typeof bcrypt>;

jest.mock('jsonwebtoken');
const mockJwt = jwt as jest.Mocked<typeof jwt>;

// Use a known secret so we can assert token structure where needed
jest.mock('../config', () => ({
  config: {
    jwt: {
      secret: 'test-secret',
      expiresIn: '15m',
      refreshExpiresInMs: 7 * 24 * 60 * 60 * 1000,
    },
  },
}));

// ── Factory helpers ────────────────────────────────────────────────────────────

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: 1,
    email: 'alice@example.com',
    name: 'Alice',
    passwordHash: '$2a$12$hashedpassword',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as unknown as User;
}

function makeRefreshToken(overrides: Partial<RefreshToken> = {}): RefreshToken {
  return {
    id: 10,
    userId: 1,
    tokenHash: 'abc123hash',
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    revokedAt: null,
    isValid: true,
    createdAt: new Date(),
    ...overrides,
  } as unknown as RefreshToken;
}

function makeRepo(
  userOverrides: Partial<User> | null = {},
  tokenOverrides: Partial<RefreshToken> | null = {},
): jest.Mocked<AuthRepository> {
  const user = userOverrides !== null ? makeUser(userOverrides) : null;
  const token = tokenOverrides !== null ? makeRefreshToken(tokenOverrides) : null;

  return {
    findUserByEmail: jest.fn().mockResolvedValue(user),
    findUserById: jest.fn().mockResolvedValue(user),
    createUser: jest.fn().mockResolvedValue(makeUser()),
    createRefreshToken: jest.fn().mockResolvedValue(undefined),
    findRefreshToken: jest.fn().mockResolvedValue(token),
    revokeRefreshToken: jest.fn().mockResolvedValue(undefined),
    revokeAllUserRefreshTokens: jest.fn().mockResolvedValue(undefined),
    deleteExpiredTokens: jest.fn().mockResolvedValue(undefined),
  } as unknown as jest.Mocked<AuthRepository>;
}

// ── register() ────────────────────────────────────────────────────────────────

describe('AuthService.register()', () => {
  beforeEach(() => {
    (mockBcrypt.hash as jest.Mock).mockResolvedValue('$2a$12$newhash' as never);
    (mockJwt.sign as jest.Mock).mockReturnValue('access.token.here' as never);
  });

  it('throws ConflictError (EMAIL_ALREADY_EXISTS) when email is taken', async () => {
    const repo = makeRepo(); // findUserByEmail returns a user
    const service = new AuthService(repo);

    await expect(
      service.register({ email: 'alice@example.com', name: 'Alice', password: 'secret' }),
    ).rejects.toMatchObject({ code: 'EMAIL_ALREADY_EXISTS', statusCode: 409 });
  });

  it('creates user and returns access + refresh tokens on success', async () => {
    const repo = makeRepo(null); // findUserByEmail returns null → no conflict
    const service = new AuthService(repo);

    const result = await service.register({
      email: 'bob@example.com',
      name: 'Bob',
      password: 'secret123',
    });

    expect(repo.createUser).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'bob@example.com', name: 'Bob' }),
    );
    expect(result.accessToken).toBeDefined();
    expect(result.refreshToken).toBeDefined();
    expect(result.user).toMatchObject({ email: 'alice@example.com' }); // createUser returns makeUser()
  });

  it('hashes the password before storing', async () => {
    const repo = makeRepo(null);
    const service = new AuthService(repo);

    await service.register({ email: 'bob@example.com', name: 'Bob', password: 'plaintext' });

    expect(mockBcrypt.hash).toHaveBeenCalledWith('plaintext', expect.any(Number));
    // The hash, not the plaintext, is passed to createUser
    expect(repo.createUser).toHaveBeenCalledWith(
      expect.objectContaining({ passwordHash: '$2a$12$newhash' }),
    );
  });
});

// ── login() ───────────────────────────────────────────────────────────────────

describe('AuthService.login()', () => {
  beforeEach(() => {
    (mockJwt.sign as jest.Mock).mockReturnValue('access.token.here' as never);
  });

  it('throws UnauthorizedError when user is not found', async () => {
    const repo = makeRepo(null); // no user
    const service = new AuthService(repo);

    await expect(
      service.login({ email: 'ghost@example.com', password: 'whatever' }),
    ).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it('throws UnauthorizedError when password is wrong', async () => {
    (mockBcrypt.compare as jest.Mock).mockResolvedValue(false as never);
    const repo = makeRepo(); // user found
    const service = new AuthService(repo);

    await expect(
      service.login({ email: 'alice@example.com', password: 'wrongpassword' }),
    ).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it('returns tokens and user on valid credentials', async () => {
    (mockBcrypt.compare as jest.Mock).mockResolvedValue(true as never);
    const repo = makeRepo();
    const service = new AuthService(repo);

    const result = await service.login({ email: 'alice@example.com', password: 'correct' });

    expect(result.accessToken).toBe('access.token.here');
    expect(result.refreshToken).toBeDefined();
    expect(result.user).toMatchObject({ email: 'alice@example.com', name: 'Alice' });
  });

  it('does not reveal whether the email or password is wrong (same error for both)', async () => {
    // No user case
    const repoNoUser = makeRepo(null);
    const serviceNoUser = new AuthService(repoNoUser);
    const noUserError = await serviceNoUser
      .login({ email: 'ghost@example.com', password: 'pw' })
      .catch((e) => e);

    // Wrong password case
    (mockBcrypt.compare as jest.Mock).mockResolvedValue(false as never);
    const repoWrongPw = makeRepo();
    const serviceWrongPw = new AuthService(repoWrongPw);
    const wrongPwError = await serviceWrongPw
      .login({ email: 'alice@example.com', password: 'bad' })
      .catch((e) => e);

    expect(noUserError.message).toBe(wrongPwError.message);
    expect(noUserError.statusCode).toBe(wrongPwError.statusCode);
  });
});

// ── refresh() ─────────────────────────────────────────────────────────────────

describe('AuthService.refresh()', () => {
  beforeEach(() => {
    (mockJwt.sign as jest.Mock).mockReturnValue('new.access.token' as never);
  });

  it('throws UnauthorizedError when token is not found', async () => {
    const repo = makeRepo({}, null); // findRefreshToken returns null
    const service = new AuthService(repo);

    await expect(service.refresh('nonexistent-token')).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it('throws UnauthorizedError when token has been revoked (isValid=false)', async () => {
    const repo = makeRepo({}, { isValid: false });
    const service = new AuthService(repo);

    await expect(service.refresh('revoked-token')).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it('revokes the old token and issues a new pair (rotation)', async () => {
    const repo = makeRepo({}, { isValid: true, userId: 1 });
    const service = new AuthService(repo);

    const result = await service.refresh('valid-token');

    // Old token revoked
    expect(repo.revokeRefreshToken).toHaveBeenCalledWith('valid-token');
    // New pair issued
    expect(result.accessToken).toBe('new.access.token');
    expect(result.refreshToken).toBeDefined();
    // A new refresh token row was created
    expect(repo.createRefreshToken).toHaveBeenCalled();
  });
});

// ── logout() ──────────────────────────────────────────────────────────────────

describe('AuthService.logout()', () => {
  it('revokes the token when it exists', async () => {
    const repo = makeRepo();
    const service = new AuthService(repo);

    await service.logout('some-token');

    expect(repo.revokeRefreshToken).toHaveBeenCalledWith('some-token');
  });

  it('does nothing (no error) when token is not found', async () => {
    const repo = makeRepo({}, null);
    const service = new AuthService(repo);

    await expect(service.logout('unknown-token')).resolves.toBeUndefined();
    expect(repo.revokeRefreshToken).not.toHaveBeenCalled();
  });
});
