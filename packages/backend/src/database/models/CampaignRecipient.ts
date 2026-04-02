import { Model, DataTypes, Sequelize } from 'sequelize';
import { RecipientStatus } from '../../shared/types';

export interface CampaignRecipientAttributes {
  campaignId: number;
  recipientId: number;
  status: RecipientStatus;
  sentAt: Date | null;
  openedAt: Date | null;
  errorMessage: string | null;
  retryCount: number;
}

export class CampaignRecipient
  extends Model<CampaignRecipientAttributes>
  implements CampaignRecipientAttributes
{
  public campaignId!: number;
  public recipientId!: number;
  public status!: RecipientStatus;
  public sentAt!: Date | null;
  public openedAt!: Date | null;
  public errorMessage!: string | null;
  public retryCount!: number;

  static initModel(sequelize: Sequelize): typeof CampaignRecipient {
    CampaignRecipient.init(
      {
        campaignId: {
          type: DataTypes.INTEGER,
          allowNull: false,
          primaryKey: true,
          field: 'campaign_id',
          references: { model: 'campaigns', key: 'id' },
        },
        recipientId: {
          type: DataTypes.INTEGER,
          allowNull: false,
          primaryKey: true,
          field: 'recipient_id',
          references: { model: 'recipients', key: 'id' },
        },
        status: {
          type: DataTypes.ENUM('pending', 'sent', 'failed'),
          allowNull: false,
          defaultValue: 'pending',
        },
        sentAt: {
          type: DataTypes.DATE,
          allowNull: true,
          field: 'sent_at',
        },
        openedAt: {
          type: DataTypes.DATE,
          allowNull: true,
          field: 'opened_at',
        },
        errorMessage: {
          type: DataTypes.TEXT,
          allowNull: true,
          field: 'error_message',
        },
        retryCount: {
          type: DataTypes.SMALLINT,
          allowNull: false,
          defaultValue: 0,
          field: 'retry_count',
        },
      },
      {
        sequelize,
        tableName: 'campaign_recipients',
        timestamps: false,
        indexes: [
          { fields: ['campaign_id'] },
          { fields: ['recipient_id'] },
          { fields: ['campaign_id', 'status'] },
        ],
      },
    );
    return CampaignRecipient;
  }
}
