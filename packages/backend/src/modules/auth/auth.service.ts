import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { AuthRepository } from './auth.repository';
import { RegisterDto, LoginDto } from './auth.schema';
import { config } from '../../config';
import { ConflictError, UnauthorizedError } from '../../shared/utils/errors';
import { logger } from '../../config/logger';

const SALT_ROUNDS = 12;

export class AuthService {
  constructor(private readonly authRepository: AuthRepository) {}

  async register(dto: RegisterDto): Promise<{ token: string; user: object }> {
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

    const token = jwt.sign(
      { id: user.id, email: user.email },
      config.jwt.secret,
      { expiresIn: config.jwt.expiresIn } as jwt.SignOptions,
    );

    logger.info({ event: 'auth.register', userId: user.id }, 'User registered');

    return {
      token,
      user: { id: user.id, email: user.email, name: user.name },
    };
  }

  async login(dto: LoginDto): Promise<{ token: string; user: object }> {
    const user = await this.authRepository.findUserByEmail(dto.email);

    // Use generic message to avoid revealing whether email exists
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

    const token = jwt.sign(
      { id: user.id, email: user.email },
      config.jwt.secret,
      { expiresIn: config.jwt.expiresIn } as jwt.SignOptions,
    );

    logger.info({ event: 'auth.login', userId: user.id }, 'User logged in');

    return {
      token,
      user: { id: user.id, email: user.email, name: user.name },
    };
  }
}
