import { QueryInterface, DataTypes } from 'sequelize';

export async function up(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.createTable('campaign_recipients', {
    campaign_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      primaryKey: true,
      references: { model: 'campaigns', key: 'id' },
      onDelete: 'CASCADE',
    },
    recipient_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      primaryKey: true,
      references: { model: 'recipients', key: 'id' },
      onDelete: 'RESTRICT',
    },
    status: {
      type: DataTypes.ENUM('pending', 'sent', 'failed'),
      allowNull: false,
      defaultValue: 'pending',
    },
    sent_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    opened_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    error_message: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    retry_count: {
      type: DataTypes.SMALLINT,
      allowNull: false,
      defaultValue: 0,
    },
  });

  await queryInterface.addIndex('campaign_recipients', ['campaign_id'], {
    name: 'idx_cr_campaign_id',
  });
  await queryInterface.addIndex('campaign_recipients', ['recipient_id'], {
    name: 'idx_cr_recipient_id',
  });
  await queryInterface.addIndex('campaign_recipients', ['campaign_id', 'status'], {
    name: 'idx_cr_campaign_status',
  });
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.dropTable('campaign_recipients');
}
