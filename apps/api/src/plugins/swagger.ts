import fp from 'fastify-plugin';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import type { FastifyInstance } from 'fastify';

import { env } from '../config/env.js';

export default fp(async function swaggerPlugin(app: FastifyInstance) {
  await app.register(swagger, {
    openapi: {
      openapi: '3.1.0',
      info: {
        title: 'ImplantaHub API',
        description: 'API multi-tenant para gestão de implantações corporativas.',
        version: env.APP_VERSION,
      },
      servers: [{ url: env.PUBLIC_API_URL }],
      components: {
        securitySchemes: {
          BearerAuth: {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'JWT',
          },
        },
      },
      security: [{ BearerAuth: [] }],
    },
  });

  await app.register(swaggerUi, {
    routePrefix: '/docs',
    uiConfig: {
      deepLinking: true,
      displayRequestDuration: true,
      persistAuthorization: true,
    },
  });

  app.get('/openapi.json', { schema: { hide: true } }, async () => app.swagger());
});
