import { createHash } from 'crypto';
import { Op } from 'sequelize';
import { User, UserCreationAttributes } from '../../database/models/User';
import { RefreshToken } from '../../database/models/RefreshToken';

/**
 * Data-access layer for the auth module.
 * All direct DB calls live here; no business logic.
 */
export class AuthRepository {
  // ── User ────────────────────────────────────────────────────────────

  async findUserByEmail(email: string): Promise<User | null> {
    return User.findOne({ where: { email } });
  }

  async findUserById(id: number): Promise<User | null> {
    return User.findByPk(id);
  }

  async createUser(data: UserCreationAttributes): Promise<User> {
    return User.create(data);
  }

  // ── Refresh Token ───────────────────────────────────────────────────

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  async createRefreshToken(userId: number, rawToken: string, expiresAt: Date): Promise<void> {
    await RefreshToken.create({
      userId,
      tokenHash: this.hashToken(rawToken),
      expiresAt,
      revokedAt: null,
    });
  }

  async findRefreshToken(rawToken: string): Promise<RefreshToken | null> {
    return RefreshToken.findOne({
      where: { tokenHash: this.hashToken(rawToken) },
    });
  }

  async revokeRefreshToken(rawToken: string): Promise<void> {
    await RefreshToken.update(
      { revokedAt: new Date() },
      { where: { tokenHash: this.hashToken(rawToken) } },
    );
  }

  async revokeAllUserRefreshTokens(userId: number): Promise<void> {
    await RefreshToken.update(
      { revokedAt: new Date() },
      { where: { userId, revokedAt: null } },
    );
  }

  // Clean up expired tokens (can be called periodically)
  async deleteExpiredTokens(): Promise<void> {
    await RefreshToken.destroy({
      where: { expiresAt: { [Op.lt]: new Date() } },
    });
  }
}
