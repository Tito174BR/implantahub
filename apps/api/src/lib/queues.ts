import { Queue } from 'bullmq';
import IORedis from 'ioredis';

import { env } from '../config/env.js';

export const redisConnection = new IORedis(env.REDIS_URL, {
  maxRetriesPerRequest: null,
});

const defaultJobOptions = {
  attempts: 5,
  backoff: {
    type: 'exponential' as const,
    delay: 2_000,
  },
  removeOnComplete: 1_000,
  removeOnFail: 5_000,
};

export const notificationsQueue = new Queue('notifications', {
  connection: redisConnection,
  defaultJobOptions,
});

export const reportsQueue = new Queue('reports', {
  connection: redisConnection,
  defaultJobOptions,
});

export const integrationsQueue = new Queue('integrations', {
  connection: redisConnection,
  defaultJobOptions,
});
