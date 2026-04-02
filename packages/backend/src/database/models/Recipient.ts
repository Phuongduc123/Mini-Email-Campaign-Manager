import { Model, DataTypes, Optional, Sequelize } from 'sequelize';

export interface RecipientAttributes {
  id: number;
  email: string;
  name: string;
  unsubscribedAt?: Date | null;
  createdAt?: Date;
}

export interface RecipientCreationAttributes
  extends Optional<RecipientAttributes, 'id' | 'unsubscribedAt' | 'createdAt'> {}

export class Recipient
  extends Model<RecipientAttributes, RecipientCreationAttributes>
  implements RecipientAttributes
{
  public id!: number;
  public email!: string;
  public name!: string;
  public unsubscribedAt!: Date | null;
  public readonly createdAt!: Date;

  static initModel(sequelize: Sequelize): typeof Recipient {
    Recipient.init(
      {
        id: {
          type: DataTypes.INTEGER,
          autoIncrement: true,
          primaryKey: true,
        },
        email: {
          type: DataTypes.STRING(255),
          allowNull: false,
          unique: true,
        },
        name: {
          type: DataTypes.STRING(255),
          allowNull: false,
        },
        unsubscribedAt: {
          type: DataTypes.DATE,
          allowNull: true,
          defaultValue: null,
          field: 'unsubscribed_at',
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
        tableName: 'recipients',
        timestamps: false,
        indexes: [{ unique: true, fields: ['email'] }],
      },
    );
    return Recipient;
  }
}
