import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { randomUUID } from 'crypto';
import { AuthRepository } from './auth.repository';
import { RegisterDto, LoginDto } from './auth.schema';
import { config } from '../../config';
import { ConflictError, UnauthorizedError } from '../../shared/utils/errors';
import { logger } from '../../config/logger';

const SALT_ROUNDS = 12;

interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  user: { id: number; email: string; name: string };
}

export class AuthService {
  constructor(private readonly authRepository: AuthRepository) {}

  // ── Helpers ──────────────────────────────────────────────────────────

  private signAccessToken(userId: number, email: string): string {
    return jwt.sign(
      { id: userId, email },
      config.jwt.secret,
      { expiresIn: config.jwt.expiresIn } as jwt.SignOptions,
    );
  }

  private async issueRefreshToken(userId: number): Promise<string> {
    const rawToken = randomUUID();
    const expiresAt = new Date(Date.now() + config.jwt.refreshExpiresInMs);
    await this.authRepository.createRefreshToken(userId, rawToken, expiresAt);
    return rawToken;
  }

  // ── Public methods ───────────────────────────────────────────────────

  async register(dto: RegisterDto): Promise<AuthTokens> {
    const existing = await this.authRepository.findUserByEmail(dto.email);
    if (existing) {
      throw new ConflictError('An account with this email already exists.', 'EMAIL_ALREADY_EXISTS');
    }

    const passwordHash = await bcrypt.hash(dto.password, SALT_ROUNDS);
    const user = await this.authRepository.createUser({
      email: dto.email,
      name: dto.name,
      passwordHash,
    });

    const accessToken  = this.signAccessToken(user.id, user.email);
    const refreshToken = await this.issueRefreshToken(user.id);

    logger.info({ event: 'auth.register', userId: user.id }, 'User registered');

    return {
      accessToken,
      refreshToken,
      user: { id: user.id, email: user.email, name: user.name },
    };
  }

  async login(dto: LoginDto): Promise<AuthTokens> {
    const user = await this.authRepository.findUserByEmail(dto.email);
    const invalidCredentials = new UnauthorizedError('Invalid email or password.');

    if (!user) {
      logger.warn({ event: 'auth.login.failed', reason: 'user_not_found' }, 'Login failed');
      throw invalidCredentials;
    }

    const passwordMatch = await bcrypt.compare(dto.password, user.passwordHash);
    if (!passwordMatch) {
      logger.warn({ event: 'auth.login.failed', userId: user.id, reason: 'wrong_password' }, 'Login failed');
      throw invalidCredentials;
    }

    const accessToken  = this.signAccessToken(user.id, user.email);
    const refreshToken = await this.issueRefreshToken(user.id);

    logger.info({ event: 'auth.login', userId: user.id }, 'User logged in');

    return {
      accessToken,
      refreshToken,
      user: { id: user.id, email: user.email, name: user.name },
    };
  }

  async refresh(rawRefreshToken: string): Promise<{ accessToken: string; refreshToken: string }> {
    const stored = await this.authRepository.findRefreshToken(rawRefreshToken);

    if (!stored || !stored.isValid) {
      throw new UnauthorizedError('Invalid or expired refresh token.');
    }

    // Revoke old token (rotation — each refresh token is single-use)
    await this.authRepository.revokeRefreshToken(rawRefreshToken);

    // Issue new pair
    const accessToken     = this.signAccessToken(stored.userId, '');
    const newRefreshToken = await this.issueRefreshToken(stored.userId);

    logger.info({ event: 'auth.refresh', userId: stored.userId }, 'Tokens refreshed');

    return { accessToken, refreshToken: newRefreshToken };
  }

  async logout(rawRefreshToken: string): Promise<void> {
    const stored = await this.authRepository.findRefreshToken(rawRefreshToken);
    if (stored) {
      await this.authRepository.revokeRefreshToken(rawRefreshToken);
      logger.info({ event: 'auth.logout', userId: stored.userId }, 'User logged out');
    }
  }
}
