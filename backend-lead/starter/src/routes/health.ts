import { Router } from 'express';
import { sequelize } from '../db/sequelize';
import { HEALTH_OK, RoutePath } from '../lib/constants';

export const healthRouter = Router();

healthRouter.get(RoutePath.ROOT, async (_req, res) => {
  await sequelize.authenticate();
  res.json({ status: HEALTH_OK });
});
