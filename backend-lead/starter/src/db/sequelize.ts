import { Sequelize } from 'sequelize';
import { config } from '../config';
import { DB_DIALECT } from '../lib/constants';

export const sequelize = new Sequelize(config.databaseUrl, {
  dialect: DB_DIALECT,
  logging: false,
  define: { underscored: true },
});
