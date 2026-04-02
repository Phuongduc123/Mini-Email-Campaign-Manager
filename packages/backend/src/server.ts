import { createApp } from './app';
import { config } from './config';
import { connectDatabase } from './config/database';

// Initialize models & associations
import './database/models/index';

const startServer = async (): Promise<void> => {
  await connectDatabase();

  const app = createApp();

  app.listen(config.server.port, () => {
    console.log(
      `[${config.server.nodeEnv}] Server running on http://localhost:${config.server.port}`,
    );
  });
};

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
