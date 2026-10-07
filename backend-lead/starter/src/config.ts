import 'dotenv/config';
import { DEFAULT_DATABASE_URL, DEFAULT_DATABASE_URL_TEST, DEFAULT_PORT, Env } from './lib/constants';

const env = process.env.NODE_ENV ?? Env.DEVELOPMENT;

export const config = {
  env,
  port: Number(process.env.PORT ?? DEFAULT_PORT),
  databaseUrl:
    env === Env.TEST
      ? process.env.DATABASE_URL_TEST ?? DEFAULT_DATABASE_URL_TEST
      : process.env.DATABASE_URL ?? DEFAULT_DATABASE_URL,
};
