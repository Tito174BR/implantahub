import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  APP_VERSION: z.string().default('0.1.0'),
  PORT: z.coerce.number().int().positive().default(3333),
  HOST: z.string().default('0.0.0.0'),
  DATABASE_URL: z.string().url(),
  DATABASE_MIGRATION_URL: z.string().url().optional(),
  REDIS_URL: z.string().url(),
  RABBITMQ_URL: z.string().min(1),
  JWT_SECRET: z.string().min(32),
  COOKIE_SECRET: z.string().min(32),
  ENCRYPTION_KEY: z.string().min(32),
  WEB_ORIGIN: z.string().min(1),
  PUBLIC_API_URL: z.string().url().default('http://localhost:3333'),
  MINIO_ENDPOINT: z.string().url().default('http://minio:9000'),
  MINIO_PUBLIC_ENDPOINT: z.string().url().default('http://localhost:9000'),
  MINIO_ACCESS_KEY: z.string().min(3).default('implantahub'),
  MINIO_SECRET_KEY: z.string().min(8).default('implantahub-secret'),
  MINIO_BUCKET: z.string().min(3).default('implantahub-documents'),
});

export const env = envSchema.parse(process.env);
