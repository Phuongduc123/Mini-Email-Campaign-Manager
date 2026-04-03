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
  sentCount: number;
  failedCount: number;
  totalRecipients: number;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface CampaignCreationAttributes
  extends Optional<CampaignAttributes, 'id' | 'status' | 'scheduledAt' | 'sentCount' | 'failedCount' | 'totalRecipients' | 'createdAt' | 'updatedAt'> {}

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
  public sentCount!: number;
  public failedCount!: number;
  public totalRecipients!: number;
  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;

  toJSON() {
    const values = super.toJSON() as unknown as Record<string, unknown>;
    for (const key of Object.keys(values)) {
      if (key.includes('_')) {
        const camelKey = key.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
        if (camelKey in values) delete values[key];
      }
    }
    return values;
  }

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
          field: 'scheduled_at',
        },
        createdBy: {
          type: DataTypes.INTEGER,
          allowNull: false,
          field: 'created_by',
          references: { model: 'users', key: 'id' },
        },
        sentCount: {
          type: DataTypes.INTEGER,
          allowNull: false,
          defaultValue: 0,
          field: 'sent_count',
        },
        failedCount: {
          type: DataTypes.INTEGER,
          allowNull: false,
          defaultValue: 0,
          field: 'failed_count',
        },
        totalRecipients: {
          type: DataTypes.INTEGER,
          allowNull: false,
          defaultValue: 0,
          field: 'total_recipients',
        },
        createdAt: {
          type: DataTypes.DATE,
          field: 'created_at',
        },
        updatedAt: {
          type: DataTypes.DATE,
          field: 'updated_at',
        },
      },
      {
        sequelize,
        tableName: 'campaigns',
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
