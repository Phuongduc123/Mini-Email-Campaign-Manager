import { Sequelize } from 'sequelize';
import { config } from './index';

export const sequelize = new Sequelize({
  dialect: 'postgres',
  host: config.db.host,
  port: config.db.port,
  database: config.db.name,
  username: config.db.user,
  password: config.db.password,
  logging: config.server.nodeEnv === 'development' ? console.log : false,
  define: {
    timestamps: true,
  },
});

export const connectDatabase = async (): Promise<void> => {
  await sequelize.authenticate();
  console.log('Database connection established.');
};
