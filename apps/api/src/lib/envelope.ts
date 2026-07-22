import type { FastifyRequest } from 'fastify';

export function envelope<T>(request: FastifyRequest, data: T) {
  return {
    data,
    meta: request.apiMeta,
  };
}

export function listEnvelope<T>(
  request: FastifyRequest,
  data: T[],
  limit = 100,
) {
  return {
    data,
    pagination: {
      limit,
      hasNextPage: false,
      nextCursor: null,
    },
    meta: request.apiMeta,
  };
}
