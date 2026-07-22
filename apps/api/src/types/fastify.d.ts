import '@fastify/jwt';
import 'fastify';

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: {
      sub: string;
      sid: string;
      tenantId?: string | null;
      role?: string | null;
    };
    user: {
      sub: string;
      sid: string;
      tenantId?: string | null;
      role?: string | null;
    };
  }
}

declare module 'fastify' {
  interface FastifyRequest {
    apiMeta: {
      requestId: string;
      correlationId: string;
    };
  }

  interface FastifyInstance {
    authenticate(request: FastifyRequest): Promise<void>;
    requireTenant(request: FastifyRequest): Promise<void>;
    requireRole(...roles: string[]): (
      request: FastifyRequest,
      reply: FastifyReply,
    ) => Promise<void>;
  }
}
