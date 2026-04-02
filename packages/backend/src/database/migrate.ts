/**
 * Simple migration runner.
 * Usage: yarn migrate
 *
 * Runs all migrations in order. Uses sequelize.sync() for simplicity
 * since we have no Umzug dependency. For production, use Umzug or
 * sequelize-cli with proper migration tracking.
 */
import '../database/models/index'; // initialize models + associations
import { sequelize } from '../config/database';

async function migrate(): Promise<void> {
  console.log('Running migrations (sync)...');
  // alter: true updates existing tables without dropping them
  await sequelize.sync({ alter: true });
  console.log('Migrations complete.');
  process.exit(0);
}

migrate().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
