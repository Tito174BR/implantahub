import { randomUUID } from 'node:crypto';
import type { Readable } from 'node:stream';

import { CreateBucketCommand, GetObjectCommand, HeadBucketCommand, HeadObjectCommand, PutBucketCorsCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { env } from '../../config/env.js';
import { withTenantClient } from '../../db/client.js';
import { envelope } from '../../lib/envelope.js';
import { AppError } from '../../lib/errors.js';

const paramsSchema = z.object({ documentId: z.string().uuid() });
const uploadSchema = z.object({
  fileName: z.string().min(1).max(255),
  mimeType: z.string().min(1).max(160),
  sizeBytes: z.coerce.number().int().min(0).max(200 * 1024 * 1024),
  checksum: z.string().max(128).optional(),
});
const versionParamsSchema = z.object({ versionId: z.string().uuid() });

const s3 = new S3Client({
  endpoint: env.MINIO_ENDPOINT,
  region: 'us-east-1',
  forcePathStyle: true,
  credentials: {
    accessKeyId: env.MINIO_ACCESS_KEY,
    secretAccessKey: env.MINIO_SECRET_KEY,
  },
});

const s3Public = new S3Client({
  endpoint: env.MINIO_PUBLIC_ENDPOINT,
  region: 'us-east-1',
  forcePathStyle: true,
  credentials: {
    accessKeyId: env.MINIO_ACCESS_KEY,
    secretAccessKey: env.MINIO_SECRET_KEY,
  },
});

let bucketReadyPromise: Promise<void> | null = null;

async function initializeBucket(): Promise<void> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= 10; attempt += 1) {
    try {
      try {
        await s3.send(new HeadBucketCommand({ Bucket: env.MINIO_BUCKET }));
      } catch {
        try {
          await s3.send(new CreateBucketCommand({ Bucket: env.MINIO_BUCKET }));
        } catch {
          // Outra instância pode ter criado o bucket entre o HEAD e o CREATE.
          await s3.send(new HeadBucketCommand({ Bucket: env.MINIO_BUCKET }));
        }
      }

      await s3.send(new PutBucketCorsCommand({
        Bucket: env.MINIO_BUCKET,
        CORSConfiguration: {
          CORSRules: [{
            AllowedHeaders: ['*'],
            AllowedMethods: ['GET', 'PUT', 'HEAD'],
            AllowedOrigins: env.WEB_ORIGIN.split(',').map((origin) => origin.trim()),
            ExposeHeaders: ['ETag'],
            MaxAgeSeconds: 3600,
          }],
        },
      }));
      return;
    } catch (error) {
      lastError = error;
      if (attempt < 10) await new Promise((resolve) => setTimeout(resolve, attempt * 500));
    }
  }
  throw lastError instanceof Error ? lastError : new Error('Não foi possível inicializar o storage de documentos.');
}

async function ensureBucket(): Promise<void> {
  bucketReadyPromise ??= initializeBucket().catch((error) => {
    bucketReadyPromise = null;
    throw error;
  });
  await bucketReadyPromise;
}

export async function documentRoutes(app: FastifyInstance): Promise<void> {
  if (!app.hasContentTypeParser('application/octet-stream')) {
    app.addContentTypeParser('application/octet-stream', (_request, payload, done) => {
      done(null, payload);
    });
  }

  app.post('/api/v1/documents/:documentId/upload-url', {
    preHandler: app.requireRole('ADMIN', 'MANAGER', 'ANALYST'),
    schema: { tags: ['Documents'], summary: 'Criar URL assinada para upload' },
  }, async (request, reply) => {
    const tenantId = request.user.tenantId!;
    const { documentId } = paramsSchema.parse(request.params);
    const body = uploadSchema.parse(request.body);

    await ensureBucket();
    const versionId = randomUUID();
    const safeName = body.fileName.replace(/[^a-zA-Z0-9._-]/g, '_');

    const allocation = await withTenantClient(tenantId, async (client) => {
      const documentResult = await client.query<{ current_version: number }>(`
        SELECT current_version
        FROM app.content_documents
        WHERE tenant_id = $1 AND id = $2
        LIMIT 1
        FOR UPDATE
      `, [tenantId, documentId]);
      const document = documentResult.rows[0];
      if (!document) throw new AppError('DOCUMENT_NOT_FOUND', 'Documento não encontrado.', 404);

      const latestResult = await client.query<{ latest_version: number }>(`
        SELECT COALESCE(MAX(version), 0)::int AS latest_version
        FROM app.content_document_versions
        WHERE tenant_id = $1 AND document_id = $2
      `, [tenantId, documentId]);
      const version = Math.max(Number(document.current_version), Number(latestResult.rows[0]?.latest_version ?? 0)) + 1;
      const objectKey = `${tenantId}/${documentId}/${version}-${versionId}-${safeName}`;

      await client.query(`
        INSERT INTO app.content_document_versions(
          id, tenant_id, document_id, version, file_name, object_key,
          mime_type, size_bytes, checksum, uploaded_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      `, [versionId, tenantId, documentId, version, body.fileName, objectKey, body.mimeType, body.sizeBytes, body.checksum ?? null, request.user.sub]);

      return { version, objectKey };
    });

    const uploadUrl = `/api/v1/document-versions/${versionId}/content`;

    return reply.status(201).send(envelope(request, {
      versionId,
      version: allocation.version,
      objectKey: allocation.objectKey,
      uploadUrl,
      uploadMode: 'API_PROXY',
      expiresIn: 900,
      requiredHeaders: { 'content-type': 'application/octet-stream' },
    }));
  });

  app.put('/api/v1/document-versions/:versionId/content', {
    preHandler: app.requireRole('ADMIN', 'MANAGER', 'ANALYST'),
    bodyLimit: 210 * 1024 * 1024,
    schema: { tags: ['Documents'], summary: 'Enviar conteúdo da versão pelo gateway autenticado' },
  }, async (request) => {
    const tenantId = request.user.tenantId!;
    const { versionId } = versionParamsSchema.parse(request.params);
    const contentLength = Number(request.headers['content-length'] ?? 0);

    const result = await withTenantClient(tenantId, (client) => client.query(`
      SELECT v.id, v.document_id, v.version, v.object_key, v.size_bytes, v.mime_type, v.status
      FROM app.content_document_versions v
      WHERE v.tenant_id = $1 AND v.id = $2
      LIMIT 1
    `, [tenantId, versionId]));
    const version = result.rows[0];
    if (!version) throw new AppError('DOCUMENT_VERSION_NOT_FOUND', 'Versão não encontrada.', 404);
    if (version.status !== 'PENDING') {
      throw new AppError('DOCUMENT_VERSION_NOT_PENDING', 'Esta versão não aceita um novo upload.', 409);
    }
    if (!Number.isFinite(contentLength) || contentLength <= 0) {
      throw new AppError('DOCUMENT_CONTENT_LENGTH_REQUIRED', 'O tamanho do arquivo não foi informado pelo navegador.', 411);
    }
    if (Number(version.size_bytes) !== contentLength) {
      throw new AppError('DOCUMENT_SIZE_MISMATCH', 'O tamanho enviado não corresponde ao arquivo registrado.', 409);
    }

    await ensureBucket();
    await s3.send(new PutObjectCommand({
      Bucket: env.MINIO_BUCKET,
      Key: version.object_key,
      Body: request.body as Readable,
      ContentLength: contentLength,
      ContentType: version.mime_type ?? 'application/octet-stream',
    }));

    await withTenantClient(tenantId, async (client) => {
      await client.query(`
        UPDATE app.content_document_versions
        SET status = 'AVAILABLE'
        WHERE tenant_id = $1 AND id = $2 AND status = 'PENDING'
      `, [tenantId, versionId]);
      await client.query(`
        UPDATE app.content_documents
        SET current_version = GREATEST(current_version, $3), updated_at = now()
        WHERE tenant_id = $1 AND id = $2
      `, [tenantId, version.document_id, version.version]);
    });

    return envelope(request, { versionId, status: 'AVAILABLE' });
  });

  app.post('/api/v1/document-versions/:versionId/complete', {
    preHandler: app.requireRole('ADMIN', 'MANAGER', 'ANALYST'),
    schema: { tags: ['Documents'], summary: 'Confirmar upload da versão' },
  }, async (request) => {
    const tenantId = request.user.tenantId!;
    const { versionId } = versionParamsSchema.parse(request.params);
    const result = await withTenantClient(tenantId, (client) => client.query(`
      SELECT v.id, v.document_id, v.version, v.object_key, v.size_bytes
      FROM app.content_document_versions v
      WHERE v.tenant_id = $1 AND v.id = $2
      LIMIT 1
    `, [tenantId, versionId]));
    const version = result.rows[0];
    if (!version) throw new AppError('DOCUMENT_VERSION_NOT_FOUND', 'Versão não encontrada.', 404);

    await ensureBucket();
    let objectSize = 0;
    try {
      const object = await s3.send(new HeadObjectCommand({ Bucket: env.MINIO_BUCKET, Key: version.object_key }));
      objectSize = Number(object.ContentLength ?? 0);
    } catch {
      throw new AppError('DOCUMENT_UPLOAD_NOT_FOUND', 'O arquivo ainda não foi enviado ao storage.', 409);
    }
    if (Number(version.size_bytes) !== objectSize) {
      throw new AppError('DOCUMENT_SIZE_MISMATCH', 'O tamanho enviado não corresponde ao arquivo registrado.', 409);
    }

    await withTenantClient(tenantId, async (client) => {
      await client.query(`
        UPDATE app.content_document_versions
        SET status = 'AVAILABLE'
        WHERE tenant_id = $1 AND id = $2
      `, [tenantId, versionId]);
      await client.query(`
        UPDATE app.content_documents
        SET current_version = GREATEST(current_version, $3), updated_at = now()
        WHERE tenant_id = $1 AND id = $2
      `, [tenantId, version.document_id, version.version]);
    });

    return envelope(request, { versionId, status: 'AVAILABLE' });
  });

  app.get('/api/v1/document-versions/:versionId/download', {
    preHandler: app.requireTenant,
    schema: { tags: ['Documents'], summary: 'Baixar versão pelo gateway autenticado' },
  }, async (request, reply) => {
    const tenantId = request.user.tenantId!;
    const { versionId } = versionParamsSchema.parse(request.params);
    const result = await withTenantClient(tenantId, (client) => client.query(`
      SELECT v.object_key, v.file_name, v.mime_type, v.size_bytes
      FROM app.content_document_versions v
      JOIN app.content_documents d ON d.id = v.document_id AND d.tenant_id = v.tenant_id
      WHERE v.tenant_id = $1 AND v.id = $2 AND v.status = 'AVAILABLE'
        AND (
          $3 <> 'CUSTOMER'
          OR EXISTS (
            SELECT 1
            FROM app.portal_access pa
            WHERE pa.tenant_id = v.tenant_id
              AND pa.user_id = $4
              AND pa.status = 'ACTIVE'
              AND pa.customer_id = d.customer_id
              AND pa.permissions ? 'READ_DOCUMENTS'
          )
        )
      LIMIT 1
    `, [tenantId, versionId, request.user.role ?? '', request.user.sub]));
    const version = result.rows[0];
    if (!version) throw new AppError('DOCUMENT_VERSION_NOT_FOUND', 'Versão não encontrada.', 404);

    await ensureBucket();
    const object = await s3.send(new GetObjectCommand({
      Bucket: env.MINIO_BUCKET,
      Key: version.object_key,
    }));
    if (!object.Body) throw new AppError('DOCUMENT_CONTENT_NOT_FOUND', 'Conteúdo do documento não encontrado.', 404);

    const safeAsciiName = String(version.file_name).replace(/[\"\r\n]/g, '_');
    reply.header('Content-Disposition', `attachment; filename="${safeAsciiName}"; filename*=UTF-8''${encodeURIComponent(String(version.file_name))}`);
    reply.header('Content-Type', version.mime_type ?? object.ContentType ?? 'application/octet-stream');
    reply.header('Content-Length', String(object.ContentLength ?? version.size_bytes));
    return reply.send(object.Body as Readable);
  });

  app.get('/api/v1/document-versions/:versionId/download-url', {
    preHandler: app.requireTenant,
    schema: { tags: ['Documents'], summary: 'Criar URL assinada para download' },
  }, async (request) => {
    const tenantId = request.user.tenantId!;
    const { versionId } = versionParamsSchema.parse(request.params);
    const result = await withTenantClient(tenantId, (client) => client.query(`
      SELECT v.object_key, v.file_name
      FROM app.content_document_versions v
      JOIN app.content_documents d ON d.id = v.document_id AND d.tenant_id = v.tenant_id
      WHERE v.tenant_id = $1 AND v.id = $2 AND v.status = 'AVAILABLE'
        AND (
          $3 <> 'CUSTOMER'
          OR EXISTS (
            SELECT 1
            FROM app.portal_access pa
            WHERE pa.tenant_id = v.tenant_id
              AND pa.user_id = $4
              AND pa.status = 'ACTIVE'
              AND pa.customer_id = d.customer_id
              AND pa.permissions ? 'READ_DOCUMENTS'
          )
        )
      LIMIT 1
    `, [tenantId, versionId, request.user.role ?? '', request.user.sub]));
    const version = result.rows[0];
    if (!version) throw new AppError('DOCUMENT_VERSION_NOT_FOUND', 'Versão não encontrada.', 404);
    await ensureBucket();
    const downloadUrl = await getSignedUrl(s3Public, new GetObjectCommand({
      Bucket: env.MINIO_BUCKET,
      Key: version.object_key,
      ResponseContentDisposition: `attachment; filename="${version.file_name}"`,
    }), { expiresIn: 10 * 60 });
    return envelope(request, { downloadUrl, expiresIn: 600 });
  });
}
