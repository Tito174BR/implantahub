import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import rateLimit from '@fastify/rate-limit';
import sensible from '@fastify/sensible';
import Fastify from 'fastify';
import IORedis from 'ioredis';

import { env } from './config/env.js';
import { checkDatabase } from './db/health.js';
import { errorHandler } from './lib/errors.js';
import { adminRoutes } from './modules/admin/routes.js';
import { auditRoutes } from './modules/audit/routes.js';
import { authRoutes } from './modules/auth/routes.js';
import { customerRoutes } from './modules/customers/routes.js';
import { dashboardRoutes } from './modules/dashboard/routes.js';
import { documentRoutes } from './modules/documents/routes.js';
import { integrationRoutes } from './modules/integrations/routes.js';
import { notificationRoutes } from './modules/notifications/routes.js';
import { platformRoutes } from './modules/platform/routes.js';
import { portalRoutes } from './modules/portal/routes.js';
import { projectRoutes } from './modules/projects/routes.js';
import { reportRoutes } from './modules/reports/routes.js';
import { taskRoutes } from './modules/tasks/routes.js';
import authPlugin from './plugins/auth.js';
import metricsPlugin from './plugins/metrics.js';
import requestContextPlugin from './plugins/request-context.js';
import swaggerPlugin from './plugins/swagger.js';

export async function buildApp() {
  const app = Fastify({
    logger: {
      level: env.NODE_ENV === 'development' ? 'debug' : 'info',
      redact: {
        paths: [
          'req.headers.authorization',
          'req.headers.cookie',
          'password',
          'refreshToken',
          'token',
          'secret',
          'secretEncrypted',
          'configEncrypted',
        ],
        censor: '[REDACTED]',
      },
    },
    requestIdHeader: 'x-request-id',
    trustProxy: true,
  });

  const redis = new IORedis(env.REDIS_URL, { maxRetriesPerRequest: 1 });

  await app.register(requestContextPlugin);
  await app.register(cors, {
    // Development accepts the current browser origin so localhost, 127.0.0.1
    // and LAN access all work. Production remains restricted to WEB_ORIGIN.
    origin: env.NODE_ENV === 'development'
      ? true
      : env.WEB_ORIGIN.split(',').map((value) => value.trim()),
    credentials: true,
  });
  await app.register(cookie, { secret: env.COOKIE_SECRET });
  await app.register(jwt, { secret: env.JWT_SECRET });
  await app.register(sensible);
  await app.register(rateLimit, {
    redis,
    max: 300,
    timeWindow: '1 minute',
  });
  await app.register(authPlugin);
  await app.register(swaggerPlugin);
  await app.register(metricsPlugin);

  app.setErrorHandler(errorHandler);

  app.get('/health/live', {
    schema: { tags: ['Health'], summary: 'Liveness', security: [] },
  }, async () => ({ status: 'UP' }));

  app.get('/health/ready', {
    schema: { tags: ['Health'], summary: 'Readiness', security: [] },
  }, async (_request, reply) => {
    const database = await checkDatabase();
    if (!database) return reply.status(503).send({ status: 'DOWN', database });
    return { status: 'UP', database };
  });

  await app.register(authRoutes);
  await app.register(adminRoutes);
  await app.register(customerRoutes);
  await app.register(projectRoutes);
  await app.register(taskRoutes);
  await app.register(platformRoutes);
  await app.register(documentRoutes);
  await app.register(integrationRoutes);
  await app.register(notificationRoutes);
  await app.register(reportRoutes);
  await app.register(portalRoutes);
  await app.register(dashboardRoutes);
  await app.register(auditRoutes);

  app.addHook('onClose', async () => {
    await redis.quit();
  });

  return app;
}
