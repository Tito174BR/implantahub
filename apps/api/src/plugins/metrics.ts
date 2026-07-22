import fp from 'fastify-plugin';
import type { FastifyInstance } from 'fastify';
import client from 'prom-client';

const register = new client.Registry();
client.collectDefaultMetrics({ register });

const httpDuration = new client.Histogram({
  name: 'implantahub_http_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.05, 0.1, 0.2, 0.4, 0.7, 1, 2, 5],
  registers: [register],
});

export default fp(async function metricsPlugin(app: FastifyInstance) {
  app.addHook('onResponse', async (request, reply) => {
    const route = request.routeOptions.url ?? 'unknown';
    httpDuration.observe(
      {
        method: request.method,
        route,
        status_code: reply.statusCode,
      },
      reply.elapsedTime / 1_000,
    );
  });

  app.get('/metrics', { schema: { hide: true } }, async (_request, reply) => {
    reply.header('Content-Type', register.contentType);
    return register.metrics();
  });
});
