import { Model, DataTypes, Optional, Sequelize } from 'sequelize';
import { CampaignStatus } from '../../shared/types';

export interface CampaignAttributes {
  id: number;
  name: string;
  subject: string;
  body: string;
  status: CampaignStatus;
  scheduledAt: Date | null;
  createdBy: number;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface CampaignCreationAttributes
  extends Optional<CampaignAttributes, 'id' | 'status' | 'scheduledAt' | 'createdAt' | 'updatedAt'> {}

export class Campaign
  extends Model<CampaignAttributes, CampaignCreationAttributes>
  implements CampaignAttributes
{
  public id!: number;
  public name!: string;
  public subject!: string;
  public body!: string;
  public status!: CampaignStatus;
  public scheduledAt!: Date | null;
  public createdBy!: number;
  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;

  static initModel(sequelize: Sequelize): typeof Campaign {
    Campaign.init(
      {
        id: {
          type: DataTypes.INTEGER,
          autoIncrement: true,
          primaryKey: true,
        },
        name: {
          type: DataTypes.STRING(255),
          allowNull: false,
        },
        subject: {
          type: DataTypes.STRING(255),
          allowNull: false,
        },
        body: {
          type: DataTypes.TEXT,
          allowNull: false,
        },
        status: {
          type: DataTypes.ENUM('draft', 'scheduled', 'sending', 'sent'),
          allowNull: false,
          defaultValue: 'draft',
        },
        scheduledAt: {
          type: DataTypes.DATE,
          allowNull: true,
        },
        createdBy: {
          type: DataTypes.INTEGER,
          allowNull: false,
          references: { model: 'users', key: 'id' },
        },
      },
      {
        sequelize,
        tableName: 'campaigns',
        underscored: true,   // maps all camelCase attrs → snake_case columns automatically
        timestamps: true,
        indexes: [
          { fields: ['created_by'] },
          { fields: ['status'] },
        ],
      },
    );
    return Campaign;
  }
}
