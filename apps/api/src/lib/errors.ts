import type { FastifyReply, FastifyRequest } from 'fastify';
import { ZodError } from 'zod';

export class AppError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly statusCode = 400,
    public readonly details: unknown[] = [],
  ) {
    super(message);
  }
}

interface HttpLikeError extends Error {
  statusCode?: number;
  code?: string;
  validation?: unknown;
  constraint?: string;
  detail?: string;
}

function databaseError(error: HttpLikeError): { status: number; code: string; message: string } | null {
  switch (error.code) {
    case '23505':
      return { status: 409, code: 'RESOURCE_CONFLICT', message: 'Já existe um registro com os mesmos dados únicos.' };
    case '23503':
      return { status: 409, code: 'RESOURCE_IN_USE', message: 'A operação viola um vínculo existente entre registros.' };
    case '23502':
      return { status: 400, code: 'REQUIRED_FIELD_MISSING', message: 'Um campo obrigatório não foi informado.' };
    case '23514':
      return { status: 400, code: 'CONSTRAINT_VIOLATION', message: 'Um dos valores informados não atende às regras do recurso.' };
    case '22P02':
      return { status: 400, code: 'INVALID_FIELD_FORMAT', message: 'Um dos campos possui formato inválido.' };
    default:
      return null;
  }
}

export function errorHandler(
  error: Error,
  request: FastifyRequest,
  reply: FastifyReply,
): void {
  request.log.error({ err: error }, 'request failed');

  if (error instanceof ZodError) {
    void reply.status(400).send({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'A requisição contém campos inválidos.',
        details: error.issues.map((issue) => ({
          field: issue.path.join('.'),
          reason: issue.code,
          message: issue.message,
        })),
      },
      meta: request.apiMeta,
    });
    return;
  }

  if (error instanceof AppError) {
    void reply.status(error.statusCode).send({
      error: {
        code: error.code,
        message: error.message,
        details: error.details,
      },
      meta: request.apiMeta,
    });
    return;
  }

  if (error.message.startsWith('PROJECT_INVALID_STATUS_TRANSITION:')) {
    void reply.status(422).send({
      error: {
        code: 'PROJECT_INVALID_STATUS_TRANSITION',
        message: 'A transição solicitada não é permitida.',
        details: [],
      },
      meta: request.apiMeta,
    });
    return;
  }

  const typed = error as HttpLikeError;
  const mappedDatabaseError = databaseError(typed);
  if (mappedDatabaseError) {
    void reply.status(mappedDatabaseError.status).send({
      error: {
        code: mappedDatabaseError.code,
        message: mappedDatabaseError.message,
        details: typed.constraint ? [{ constraint: typed.constraint }] : [],
      },
      meta: request.apiMeta,
    });
    return;
  }

  if (typed.statusCode && typed.statusCode >= 400 && typed.statusCode < 500) {
    void reply.status(typed.statusCode).send({
      error: {
        code: typed.code ?? 'REQUEST_REJECTED',
        message: typed.statusCode === 429 ? 'Muitas tentativas. Aguarde antes de tentar novamente.' : error.message,
        details: [],
      },
      meta: request.apiMeta,
    });
    return;
  }

  void reply.status(500).send({
    error: {
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Ocorreu um erro interno inesperado.',
      details: [],
    },
    meta: request.apiMeta,
  });
}
