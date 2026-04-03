import { Model, DataTypes, Optional, Sequelize } from 'sequelize';

export interface RefreshTokenAttributes {
  id: number;
  userId: number;
  tokenHash: string;  // SHA-256 hash of the raw token — never store raw
  expiresAt: Date;
  revokedAt: Date | null;
  createdAt?: Date;
}

export interface RefreshTokenCreationAttributes
  extends Optional<RefreshTokenAttributes, 'id' | 'revokedAt' | 'createdAt'> {}

export class RefreshToken
  extends Model<RefreshTokenAttributes, RefreshTokenCreationAttributes>
  implements RefreshTokenAttributes
{
  public id!: number;
  public userId!: number;
  public tokenHash!: string;
  public expiresAt!: Date;
  public revokedAt!: Date | null;
  public readonly createdAt!: Date;

  public get isExpired(): boolean {
    return new Date() > this.expiresAt;
  }

  public get isRevoked(): boolean {
    return this.revokedAt !== null;
  }

  public get isValid(): boolean {
    return !this.isExpired && !this.isRevoked;
  }

  static initModel(sequelize: Sequelize): typeof RefreshToken {
    RefreshToken.init(
      {
        id: {
          type: DataTypes.INTEGER,
          autoIncrement: true,
          primaryKey: true,
        },
        userId: {
          type: DataTypes.INTEGER,
          allowNull: false,
          field: 'user_id',
          references: { model: 'users', key: 'id' },
        },
        tokenHash: {
          type: DataTypes.STRING(64), // SHA-256 hex = 64 chars
          allowNull: false,
          unique: true,
          field: 'token_hash',
        },
        expiresAt: {
          type: DataTypes.DATE,
          allowNull: false,
          field: 'expires_at',
        },
        revokedAt: {
          type: DataTypes.DATE,
          allowNull: true,
          defaultValue: null,
          field: 'revoked_at',
        },
        createdAt: {
          type: DataTypes.DATE,
          allowNull: false,
          defaultValue: DataTypes.NOW,
          field: 'created_at',
        },
      },
      {
        sequelize,
        tableName: 'refresh_tokens',
        timestamps: false,
        indexes: [
          { fields: ['user_id'] },
          { unique: true, fields: ['token_hash'] },
        ],
      },
    );
    return RefreshToken;
  }
}
