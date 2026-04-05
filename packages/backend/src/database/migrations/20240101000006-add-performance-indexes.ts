import { QueryInterface } from 'sequelize';

export async function up(queryInterface: QueryInterface): Promise<void> {
  // campaigns: composite (created_by, status) — serves WHERE created_by = ? AND status = ?
  // in a single index scan instead of PostgreSQL merging two single-column indexes
  await queryInterface.addIndex('campaigns', ['created_by', 'status'], {
    name: 'idx_campaigns_created_by_status',
  });

  // campaigns: composite (created_by, id) — covers ORDER BY id DESC pagination
  // scoped to one user without a separate sort step
  await queryInterface.addIndex('campaigns', ['created_by', 'id'], {
    name: 'idx_campaigns_created_by_id',
  });

  // recipients: partial index on active (non-unsubscribed) rows only.
  // Used by the send worker JOIN: WHERE r.unsubscribed_at IS NULL
  // Keeps index size proportional to active recipients as the unsubscribe list grows.
  await queryInterface.sequelize.query(`
    CREATE INDEX idx_recipients_active
      ON recipients (id)
      WHERE unsubscribed_at IS NULL
  `);

  // campaign_recipients: partial index for open-rate stats.
  // countOpened() query: WHERE campaign_id = ? AND opened_at IS NOT NULL
  // Partial — skips the ~65% of rows where opened_at IS NULL (never opened).
  await queryInterface.sequelize.query(`
    CREATE INDEX idx_cr_opened_at
      ON campaign_recipients (campaign_id, opened_at)
      WHERE opened_at IS NOT NULL
  `);
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.removeIndex('campaigns', 'idx_campaigns_created_by_status');
  await queryInterface.removeIndex('campaigns', 'idx_campaigns_created_by_id');
  await queryInterface.sequelize.query('DROP INDEX IF EXISTS idx_recipients_active');
  await queryInterface.sequelize.query('DROP INDEX IF EXISTS idx_cr_opened_at');
}
