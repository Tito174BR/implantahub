import { randomUUID } from 'node:crypto';

import fp from 'fastify-plugin';
import type { FastifyInstance } from 'fastify';

export default fp(async function requestContextPlugin(app: FastifyInstance) {
  app.decorateRequest('apiMeta', null);

  app.addHook('onRequest', async (request, reply) => {
    const header = request.headers['x-correlation-id'];
    const correlationId =
      typeof header === 'string' && /^[0-9a-f-]{36}$/i.test(header)
        ? header
        : randomUUID();

    request.apiMeta = {
      requestId: request.id,
      correlationId,
    };

    reply.header('X-Request-ID', request.id);
    reply.header('X-Correlation-ID', correlationId);
  });
});
