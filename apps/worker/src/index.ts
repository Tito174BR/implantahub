import 'dotenv/config';

import { createWriteStream } from 'node:fs';
import { createDecipheriv, createHash, createHmac } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import net from 'node:net';
import { basename, join } from 'node:path';

import amqp from 'amqplib';
import { Queue, Worker } from 'bullmq';
import ExcelJS from 'exceljs';
import IORedis from 'ioredis';
import nodemailer from 'nodemailer';
import PDFDocument from 'pdfkit';
import pg, { type PoolClient } from 'pg';
import { z } from 'zod';

const env = z.object({
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  RABBITMQ_URL: z.string().min(1),
  REPORTS_DIR: z.string().default('/app/storage/reports'),
  ENCRYPTION_KEY: z.string().min(32),
  SMTP_HOST: z.string().default('mailpit'),
  SMTP_PORT: z.coerce.number().int().positive().default(1025),
  SMTP_SECURE: z.enum(['true', 'false']).default('false').transform((value) => value === 'true'),
  SMTP_FROM: z.string().default('ImplantaHub <no-reply@implantahub.local>'),
  WEB_ORIGIN: z.string().url().default('http://localhost:3000'),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
}).parse(process.env);

const { Pool } = pg;
const pool = new Pool({
  connectionString: env.DATABASE_URL,
  max: 8,
});

const redis = new IORedis(env.REDIS_URL, {
  maxRetriesPerRequest: null,
});

const notificationQueue = new Queue('notifications', {
  connection: redis,
  defaultJobOptions: {
    attempts: 5,
    backoff: { type: 'exponential', delay: 2_000 },
    removeOnComplete: 1_000,
    removeOnFail: 5_000,
  },
});

const encryptionKey = createHash('sha256').update(env.ENCRYPTION_KEY).digest();

const mailer = nodemailer.createTransport({
  host: env.SMTP_HOST,
  port: env.SMTP_PORT,
  secure: env.SMTP_SECURE,
  ...(env.SMTP_USER
    ? { auth: { user: env.SMTP_USER, pass: env.SMTP_PASSWORD ?? '' } }
    : {}),
});

function decryptSecret(value: string): string {
  const [ivValue, tagValue, payloadValue] = value.split('.');
  if (!ivValue || !tagValue || !payloadValue) throw new Error('Invalid encrypted integration config');
  const decipher = createDecipheriv('aes-256-gcm', encryptionKey, Buffer.from(ivValue, 'base64url'));
  decipher.setAuthTag(Buffer.from(tagValue, 'base64url'));
  return Buffer.concat([
    decipher.update(Buffer.from(payloadValue, 'base64url')),
    decipher.final(),
  ]).toString('utf8');
}

async function withTenant<T>(tenantId: string, callback: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`SELECT set_config('app.current_tenant_id', $1, true)`, [tenantId]);
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

const notificationJobSchema = z.object({
  tenantId: z.string().uuid(),
  userId: z.string().uuid().optional(),
  recipientEmail: z.string().email().optional(),
  title: z.string().min(1).default('Atualização na plataforma'),
  body: z.string().min(1).default('Há uma nova atualização no ImplantaHub.'),
  link: z.string().refine((value) => {
    if (value.startsWith('/')) return true;
    try { new URL(value); return true; } catch { return false; }
  }, 'Link must be an absolute URL or an application path').optional(),
}).refine((value) => value.userId || value.recipientEmail, {
  message: 'A notification recipient is required',
});

const notificationWorker = new Worker(
  'notifications',
  async (job) => {
    const data = notificationJobSchema.parse(job.data);
    const dedupeKey = String(job.id ?? `${job.name}-${data.tenantId}-${data.userId ?? data.recipientEmail}`);

    let recipientEmail = data.recipientEmail ?? null;
    let shouldSend = true;

    if (data.userId) {
      const recipient = await withTenant(data.tenantId, async (client) => {
        const existing = await client.query<{ status: string }>(`
          SELECT status
          FROM app.notification_notifications
          WHERE tenant_id = $1 AND user_id = $2 AND dedupe_key = $3
          LIMIT 1
        `, [data.tenantId, data.userId, dedupeKey]);
        if (existing.rows[0]?.status === 'SENT') return null;

        await client.query(`
          INSERT INTO app.notification_notifications(
            id, tenant_id, user_id, type, title, body, channel, status, link, dedupe_key
          ) VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, 'IN_APP_EMAIL', 'PROCESSING', $6, $7)
          ON CONFLICT (tenant_id, user_id, dedupe_key) WHERE dedupe_key IS NOT NULL
          DO UPDATE SET title = EXCLUDED.title, body = EXCLUDED.body, link = EXCLUDED.link,
                        status = 'PROCESSING', updated_at = now()
        `, [data.tenantId, data.userId, job.name.toUpperCase(), data.title, data.body, data.link ?? null, dedupeKey]);

        const user = await client.query<{ email: string }>(`
          SELECT email FROM app.identity_users WHERE id = $1 LIMIT 1
        `, [data.userId]);
        if (!user.rows[0]) throw new Error('Notification recipient not found');
        return user.rows[0];
      });
      if (!recipient) shouldSend = false;
      else recipientEmail = recipient.email;
    }

    if (!shouldSend) return;
    if (!recipientEmail) throw new Error('Notification recipient e-mail not found');

    const emailLink = data.link
      ? (data.link.startsWith('/') ? new URL(data.link, env.WEB_ORIGIN).toString() : data.link)
      : null;

    try {
      await mailer.sendMail({
        from: env.SMTP_FROM,
        to: recipientEmail,
        subject: data.title,
        text: `${data.body}${emailLink ? `\n\n${emailLink}` : ''}`,
        html: `<div style="font-family:Arial,sans-serif;max-width:600px"><h2>${escapeHtml(data.title)}</h2><p>${escapeHtml(data.body)}</p>${emailLink ? `<p><a href="${escapeHtml(emailLink)}">Abrir no ImplantaHub</a></p>` : ''}</div>`,
      });
      if (data.userId) {
        await withTenant(data.tenantId, (client) => client.query(`
          UPDATE app.notification_notifications
          SET status = 'SENT', sent_at = now(), updated_at = now()
          WHERE tenant_id = $1 AND user_id = $2 AND dedupe_key = $3
        `, [data.tenantId, data.userId, dedupeKey]));
      }
    } catch (error) {
      if (data.userId) {
        await withTenant(data.tenantId, (client) => client.query(`
          UPDATE app.notification_notifications
          SET status = 'FAILED', updated_at = now()
          WHERE tenant_id = $1 AND user_id = $2 AND dedupe_key = $3
        `, [data.tenantId, data.userId, dedupeKey]));
      }
      throw error;
    }

    console.log(JSON.stringify({
      level: 'info', service: 'implantahub-worker', queue: 'notifications',
      jobId: job.id, jobName: job.name, message: 'notification processed',
    }));
  },
  { connection: redis, concurrency: 10 },
);

function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
  })[character] ?? character);
}

function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return '';
  const text = typeof value === 'object' ? JSON.stringify(value) : String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

function normalizeRows(rows: Record<string, unknown>[]): Record<string, unknown>[] {
  return rows.map((row) => Object.fromEntries(Object.entries(row).map(([key, value]) => [
    key,
    value instanceof Date ? value.toISOString() : value,
  ])));
}

async function reportRows(client: PoolClient, tenantId: string, type: string): Promise<Record<string, unknown>[]> {
  const queries: Record<string, string> = {
    PORTFOLIO: `
      SELECT p.code, p.name, p.status, p.priority, p.criticality,
             c.trade_name AS customer, p.planned_start_at, p.planned_end_at,
             count(t.id)::int AS tasks,
             count(t.id) FILTER (WHERE t.status = 'COMPLETED')::int AS completed_tasks
      FROM app.project_projects p
      JOIN app.customer_customers c ON c.id = p.customer_id
      LEFT JOIN app.execution_tasks t ON t.project_id = p.id AND t.deleted_at IS NULL
      WHERE p.tenant_id = $1 AND p.deleted_at IS NULL
      GROUP BY p.id, c.trade_name
      ORDER BY p.updated_at DESC`,
    TASKS: `
      SELECT p.code AS project_code, p.name AS project, t.title, t.status,
             t.priority, t.due_at, u.display_name AS assignee
      FROM app.execution_tasks t
      JOIN app.project_projects p ON p.id = t.project_id
      LEFT JOIN app.identity_users u ON u.id = t.assignee_user_id
      WHERE t.tenant_id = $1 AND t.deleted_at IS NULL
      ORDER BY t.due_at NULLS LAST`,
    RISKS: `
      SELECT p.code AS project_code, p.name AS project, r.title, r.status,
             r.probability, r.impact, r.score, r.mitigation, r.due_at
      FROM app.governance_risks r
      JOIN app.project_projects p ON p.id = r.project_id
      WHERE r.tenant_id = $1
      ORDER BY r.score DESC, r.created_at DESC`,
    DEPLOYMENTS: `
      SELECT p.code AS project_code, p.name AS project, d.name, e.name AS environment,
             d.strategy, d.status, d.started_at, d.finished_at, d.error_message
      FROM app.delivery_deployments d
      JOIN app.project_projects p ON p.id = d.project_id
      JOIN app.delivery_environments e ON e.id = d.environment_id
      WHERE d.tenant_id = $1
      ORDER BY d.created_at DESC`,
    DEFECTS: `
      SELECT p.code AS project_code, p.name AS project, d.title, d.severity,
             d.priority, d.status, d.detected_at, d.resolved_at
      FROM app.quality_defects d
      JOIN app.project_projects p ON p.id = d.project_id
      WHERE d.tenant_id = $1
      ORDER BY d.detected_at DESC`,
    EXECUTIVE: `
      SELECT 'Projetos ativos' AS indicator, count(*)::text AS value
      FROM app.project_projects WHERE tenant_id = $1 AND deleted_at IS NULL AND status NOT IN ('COMPLETED','CANCELLED')
      UNION ALL
      SELECT 'Tarefas atrasadas', count(*)::text
      FROM app.execution_tasks WHERE tenant_id = $1 AND deleted_at IS NULL AND due_at < now() AND status NOT IN ('COMPLETED','CANCELLED')
      UNION ALL
      SELECT 'Riscos críticos', count(*)::text
      FROM app.governance_risks WHERE tenant_id = $1 AND status = 'OPEN' AND score >= 15
      UNION ALL
      SELECT 'Defeitos abertos', count(*)::text
      FROM app.quality_defects WHERE tenant_id = $1 AND status NOT IN ('RESOLVED','CLOSED')
      UNION ALL
      SELECT 'Deployments com falha', count(*)::text
      FROM app.delivery_deployments WHERE tenant_id = $1 AND status = 'FAILED'`,
  };
  const sql = queries[type];
  if (!sql) throw new Error(`Unsupported report type: ${type}`);
  const result = await client.query(sql, [tenantId]);
  return normalizeRows(result.rows as Record<string, unknown>[]);
}

async function writeCsv(filePath: string, rows: Record<string, unknown>[]): Promise<void> {
  const headers = rows.length ? Object.keys(rows[0]!) : ['message'];
  const content = [
    headers.map(csvEscape).join(','),
    ...(rows.length ? rows.map((row) => headers.map((header) => csvEscape(row[header])).join(',')) : ['"Nenhum registro encontrado"']),
  ].join('\n');
  await import('node:fs/promises').then((fs) => fs.writeFile(filePath, `\uFEFF${content}`, 'utf8'));
}

async function writeXlsx(filePath: string, rows: Record<string, unknown>[]): Promise<void> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'ImplantaHub';
  const worksheet = workbook.addWorksheet('Relatório');
  const headers = rows.length ? Object.keys(rows[0]!) : ['message'];
  worksheet.columns = headers.map((header) => ({ header, key: header, width: Math.max(14, Math.min(40, header.length + 8)) }));
  if (rows.length) worksheet.addRows(rows);
  else worksheet.addRow({ message: 'Nenhum registro encontrado' });
  worksheet.getRow(1).font = { bold: true };
  worksheet.autoFilter = { from: 'A1', to: `${String.fromCharCode(64 + Math.min(headers.length, 26))}1` };
  await workbook.xlsx.writeFile(filePath);
}

async function writePdf(filePath: string, title: string, rows: Record<string, unknown>[]): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const document = new PDFDocument({ margin: 40, size: 'A4' });
    const output = createWriteStream(filePath);
    document.pipe(output);
    document.fontSize(20).text(`ImplantaHub — ${title}`, { align: 'left' });
    document.moveDown(0.5).fontSize(9).fillColor('#667085').text(`Gerado em ${new Date().toLocaleString('pt-BR')}`);
    document.moveDown().fillColor('#111827');
    if (!rows.length) document.fontSize(11).text('Nenhum registro encontrado.');
    for (const [index, row] of rows.entries()) {
      if (document.y > 730) document.addPage();
      document.fontSize(11).font('Helvetica-Bold').text(`${index + 1}. ${Object.values(row)[0] ?? 'Registro'}`);
      document.font('Helvetica').fontSize(8);
      for (const [key, value] of Object.entries(row)) {
        document.text(`${key}: ${typeof value === 'object' ? JSON.stringify(value) : String(value ?? '')}`);
      }
      document.moveDown(0.7);
    }
    document.end();
    output.on('finish', resolve);
    output.on('error', reject);
  });
}

const reportWorker = new Worker(
  'reports',
  async (job) => {
    const data = z.object({
      reportId: z.string().uuid(),
      tenantId: z.string().uuid(),
      requestedBy: z.string().uuid(),
      type: z.string(),
      format: z.enum(['CSV', 'XLSX', 'PDF']),
    }).parse(job.data);

    await mkdir(env.REPORTS_DIR, { recursive: true });
    const extension = data.format.toLowerCase();
    const fileName = `${data.type.toLowerCase()}-${data.reportId}.${extension}`;
    const filePath = join(env.REPORTS_DIR, basename(fileName));

    try {
      const rows = await withTenant(data.tenantId, async (client) => {
        await client.query(`UPDATE app.reporting_jobs SET status = 'PROCESSING', started_at = now(), updated_at = now() WHERE id = $1`, [data.reportId]);
        return reportRows(client, data.tenantId, data.type);
      });

      if (data.format === 'CSV') await writeCsv(filePath, rows);
      if (data.format === 'XLSX') await writeXlsx(filePath, rows);
      if (data.format === 'PDF') await writePdf(filePath, data.type, rows);

      await withTenant(data.tenantId, async (client) => {
        await client.query(`
          UPDATE app.reporting_jobs
          SET status = 'COMPLETED', object_key = $2, finished_at = now(),
              expires_at = now() + interval '7 days', error_message = NULL, updated_at = now()
          WHERE id = $1
        `, [data.reportId, fileName]);
      });
      await notificationQueue.add('report-ready', {
        tenantId: data.tenantId,
        userId: data.requestedBy,
        title: 'Relatório concluído',
        body: `O relatório ${data.type} está disponível para download.`,
        link: '/reports',
      }, { jobId: `report-ready-${data.reportId}` });
    } catch (error) {
      await withTenant(data.tenantId, (client) => client.query(`
        UPDATE app.reporting_jobs
        SET status = 'FAILED', error_message = $2, finished_at = now(), updated_at = now()
        WHERE id = $1
      `, [data.reportId, error instanceof Error ? error.message : String(error)]));
      throw error;
    }
  },
  { connection: redis, concurrency: 3 },
);

function tcpProbe(host: string, port: number, timeoutMs = 8_000): Promise<{ reachable: boolean; latencyMs: number }> {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const socket = net.createConnection({ host, port });
    const timer = setTimeout(() => socket.destroy(new Error('Connection timeout')), timeoutMs);
    socket.once('connect', () => {
      clearTimeout(timer);
      const latencyMs = Date.now() - started;
      socket.end();
      resolve({ reachable: true, latencyMs });
    });
    socket.once('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
}

const integrationWorker = new Worker(
  'integrations',
  async (job) => {
    const data = z.object({ integrationJobId: z.string().uuid(), tenantId: z.string().uuid() }).parse(job.data);
    await withTenant(data.tenantId, (client) => client.query(`
      UPDATE app.integration_jobs SET status = 'RUNNING', started_at = now(), attempt_count = attempt_count + 1, updated_at = now()
      WHERE id = $1
    `, [data.integrationJobId]));

    try {
      const result = await withTenant(data.tenantId, async (client) => {
        const query = await client.query(`
          SELECT j.*, c.type AS connection_type, c.config_encrypted
          FROM app.integration_jobs j
          JOIN app.integration_connections c ON c.id = j.connection_id
          WHERE j.id = $1
          LIMIT 1
        `, [data.integrationJobId]);
        const record = query.rows[0];
        if (!record) throw new Error('Integration job not found');
        const config = JSON.parse(decryptSecret(record.config_encrypted)) as Record<string, unknown>;

        if (record.connection_type === 'HTTP') {
          const response = await fetch(String(config.url), {
            method: String(config.method ?? 'GET'),
            signal: AbortSignal.timeout(Number(config.timeoutMs ?? 10_000)),
          });
          return { reachable: response.ok, status: response.status, statusText: response.statusText };
        }

        if (['ORACLE', 'SFTP', 'TCP'].includes(record.connection_type)) {
          return tcpProbe(String(config.host), Number(config.port ?? (record.connection_type === 'SFTP' ? 22 : 1521)));
        }

        throw new Error(`Unsupported connection type: ${record.connection_type}`);
      });

      await withTenant(data.tenantId, async (client) => {
        await client.query(`
          UPDATE app.integration_jobs
          SET status = 'COMPLETED', result = $2::jsonb, finished_at = now(), last_error = NULL, updated_at = now()
          WHERE id = $1
        `, [data.integrationJobId, JSON.stringify(result)]);
        await client.query(`
          UPDATE app.integration_connections c
          SET status = 'ACTIVE', last_tested_at = now(), last_error = NULL, updated_at = now()
          FROM app.integration_jobs j
          WHERE j.id = $1 AND c.id = j.connection_id
        `, [data.integrationJobId]);
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await withTenant(data.tenantId, async (client) => {
        await client.query(`
          UPDATE app.integration_jobs
          SET status = 'FAILED', last_error = $2, finished_at = now(), updated_at = now()
          WHERE id = $1
        `, [data.integrationJobId, message]);
        await client.query(`
          UPDATE app.integration_connections c
          SET status = 'ERROR', last_tested_at = now(), last_error = $2, updated_at = now()
          FROM app.integration_jobs j
          WHERE j.id = $1 AND c.id = j.connection_id
        `, [data.integrationJobId, message]);
      });
      throw error;
    }
  },
  { connection: redis, concurrency: 5 },
);

for (const worker of [notificationWorker, reportWorker, integrationWorker]) {
  worker.on('failed', (job, error) => {
    console.error(JSON.stringify({
      level: 'error', service: 'implantahub-worker', queue: worker.name,
      jobId: job?.id, error: error.message,
    }));
  });
}

let shuttingDown = false;
interface WebhookDeliveryCandidate {
  id: string;
  attemptCount: number;
  url: string;
  secretEncrypted: string;
  eventId: string;
  eventType: string;
  aggregateType: string;
  aggregateId: string;
  payload: Record<string, unknown>;
  correlationId: string;
  occurredAt: Date;
}

async function claimWebhookDeliveries(tenantId: string): Promise<WebhookDeliveryCandidate[]> {
  return withTenant(tenantId, async (client) => {
    await client.query(`
      UPDATE app.integration_webhook_deliveries
      SET status = 'FAILED', next_attempt_at = now(), updated_at = now(),
          response_body = COALESCE(response_body, 'Processing lease expired before delivery')
      WHERE tenant_id = $1
        AND status = 'PROCESSING'
        AND updated_at < now() - interval '5 minutes'
    `, [tenantId]);

    await client.query(`
      INSERT INTO app.integration_webhook_deliveries(
        id, tenant_id, endpoint_id, event_id, status, next_attempt_at
      )
      SELECT gen_random_uuid(), $1, endpoint.id, event.id, 'PENDING', now()
      FROM app.integration_webhook_endpoints endpoint
      JOIN app.integration_outbox_events event
        ON event.tenant_id = endpoint.tenant_id
       AND event.status = 'PUBLISHED'
      WHERE endpoint.tenant_id = $1
        AND endpoint.status = 'ACTIVE'
        AND jsonb_typeof(endpoint.event_types) = 'array'
        AND (
          jsonb_array_length(endpoint.event_types) = 0
          OR endpoint.event_types ? event.event_type
        )
        AND NOT EXISTS (
          SELECT 1
          FROM app.integration_webhook_deliveries delivery
          WHERE delivery.endpoint_id = endpoint.id
            AND delivery.event_id = event.id
        )
      ORDER BY event.created_at
      LIMIT 100
      ON CONFLICT (endpoint_id, event_id) DO NOTHING
    `, [tenantId]);

    const result = await client.query<{
      id: string;
      attempt_count: number;
      url: string;
      secret_encrypted: string;
      event_id: string;
      event_type: string;
      aggregate_type: string;
      aggregate_id: string;
      payload: Record<string, unknown>;
      correlation_id: string;
      created_at: Date;
    }>(`
      SELECT delivery.id, delivery.attempt_count, endpoint.url, endpoint.secret_encrypted,
             event.id AS event_id, event.event_type, event.aggregate_type,
             event.aggregate_id, event.payload, event.correlation_id, event.created_at
      FROM app.integration_webhook_deliveries delivery
      JOIN app.integration_webhook_endpoints endpoint ON endpoint.id = delivery.endpoint_id
      JOIN app.integration_outbox_events event ON event.id = delivery.event_id
      WHERE delivery.tenant_id = $1
        AND endpoint.status = 'ACTIVE'
        AND delivery.status IN ('PENDING', 'FAILED')
        AND delivery.next_attempt_at <= now()
      ORDER BY delivery.next_attempt_at, delivery.created_at
      FOR UPDATE OF delivery SKIP LOCKED
      LIMIT 20
    `, [tenantId]);

    if (result.rows.length > 0) {
      await client.query(`
        UPDATE app.integration_webhook_deliveries
        SET status = 'PROCESSING', attempt_count = attempt_count + 1, updated_at = now()
        WHERE id = ANY($1::uuid[])
      `, [result.rows.map((row) => row.id)]);
    }

    return result.rows.map((row) => ({
      id: row.id,
      attemptCount: row.attempt_count + 1,
      url: row.url,
      secretEncrypted: row.secret_encrypted,
      eventId: row.event_id,
      eventType: row.event_type,
      aggregateType: row.aggregate_type,
      aggregateId: row.aggregate_id,
      payload: row.payload,
      correlationId: row.correlation_id,
      occurredAt: row.created_at,
    }));
  });
}

async function deliverWebhook(tenantId: string, delivery: WebhookDeliveryCandidate): Promise<void> {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const event = {
    eventId: delivery.eventId,
    eventType: delivery.eventType,
    eventVersion: 1,
    occurredAt: delivery.occurredAt.toISOString(),
    producer: 'implantahub-worker',
    tenantId,
    correlationId: delivery.correlationId,
    aggregate: { type: delivery.aggregateType, id: delivery.aggregateId },
    data: delivery.payload,
  };
  const body = JSON.stringify(event);
  const secret = decryptSecret(delivery.secretEncrypted);
  const signature = createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex');

  try {
    const response = await fetch(delivery.url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'user-agent': 'ImplantaHub-Webhook/1.0',
        'x-implantahub-event': delivery.eventType,
        'x-implantahub-delivery': delivery.id,
        'x-implantahub-timestamp': timestamp,
        'x-implantahub-signature': `sha256=${signature}`,
      },
      body,
      signal: AbortSignal.timeout(10_000),
    });
    const responseBody = (await response.text()).slice(0, 4_000);
    if (!response.ok) throw Object.assign(new Error(`Webhook returned HTTP ${response.status}`), {
      responseStatus: response.status,
      responseBody,
    });

    await withTenant(tenantId, (client) => client.query(`
      UPDATE app.integration_webhook_deliveries
      SET status = 'DELIVERED', response_status = $2, response_body = $3,
          delivered_at = now(), updated_at = now()
      WHERE id = $1
    `, [delivery.id, response.status, responseBody]));
  } catch (error) {
    const detail = error as Error & { responseStatus?: number; responseBody?: string };
    const exhausted = delivery.attemptCount >= 8;
    const delaySeconds = Math.min(3_600, 15 * (2 ** Math.max(0, delivery.attemptCount - 1)));
    await withTenant(tenantId, async (client) => {
      await client.query(`
        UPDATE app.integration_webhook_deliveries
        SET status = $2, response_status = $3, response_body = $4,
            next_attempt_at = now() + ($5::integer * interval '1 second'), updated_at = now()
        WHERE id = $1
      `, [
        delivery.id,
        exhausted ? 'DEAD' : 'FAILED',
        detail.responseStatus ?? null,
        (detail.responseBody ?? detail.message).slice(0, 4_000),
        delaySeconds,
      ]);
      if (exhausted) {
        await client.query(`
          INSERT INTO app.integration_dead_letters(
            id, tenant_id, source, reference_id, event_type, payload, error, retry_count
          ) VALUES (gen_random_uuid(), $1, 'WEBHOOK', $2, $3, $4::jsonb, $5, $6)
        `, [tenantId, delivery.id, delivery.eventType, body, detail.message, delivery.attemptCount]);
      }
    });
  }
}

async function dispatchWebhooks(): Promise<void> {
  while (!shuttingDown) {
    try {
      const tenants = await pool.query<{ id: string }>(`SELECT id FROM app.tenancy_tenants WHERE status = 'ACTIVE'`);
      for (const tenant of tenants.rows) {
        const deliveries = await claimWebhookDeliveries(tenant.id);
        for (const delivery of deliveries) await deliverWebhook(tenant.id, delivery);
      }
      await new Promise((resolve) => setTimeout(resolve, 3_000));
    } catch (error) {
      console.error(JSON.stringify({
        level: 'error', service: 'implantahub-worker', message: 'webhook dispatcher failed',
        error: error instanceof Error ? error.message : String(error),
      }));
      await new Promise((resolve) => setTimeout(resolve, 5_000));
    }
  }
}


interface OutboxCandidate {
  id: string;
  eventType: string;
  eventVersion: number;
  aggregateType: string;
  aggregateId: string;
  payload: Record<string, unknown>;
  correlationId: string;
  createdAt: Date;
}

async function claimOutboxEvents(tenantId: string): Promise<OutboxCandidate[]> {
  return withTenant(tenantId, async (client) => {
    await client.query(`
      UPDATE app.integration_outbox_events
      SET status = 'FAILED', available_at = now(), processing_started_at = NULL,
          last_error = 'Processing lease expired before publication'
      WHERE tenant_id = $1
        AND status = 'PROCESSING'
        AND processing_started_at < now() - interval '5 minutes'
    `, [tenantId]);

    const result = await client.query<{
      id: string; event_type: string; event_version: number; aggregate_type: string;
      aggregate_id: string; payload: Record<string, unknown>; correlation_id: string; created_at: Date;
    }>(`
      WITH candidates AS (
        SELECT id
        FROM app.integration_outbox_events
        WHERE tenant_id = $1
          AND status IN ('PENDING', 'FAILED')
          AND available_at <= now()
        ORDER BY created_at
        FOR UPDATE SKIP LOCKED
        LIMIT 50
      )
      UPDATE app.integration_outbox_events event
      SET status = 'PROCESSING', processing_started_at = now()
      FROM candidates
      WHERE event.id = candidates.id
      RETURNING event.id, event.event_type, event.event_version, event.aggregate_type,
                event.aggregate_id, event.payload, event.correlation_id, event.created_at
    `, [tenantId]);

    return result.rows.map((event) => ({
      id: event.id,
      eventType: event.event_type,
      eventVersion: event.event_version,
      aggregateType: event.aggregate_type,
      aggregateId: event.aggregate_id,
      payload: event.payload,
      correlationId: event.correlation_id,
      createdAt: event.created_at,
    }));
  });
}

async function markOutboxFailure(tenantId: string, event: OutboxCandidate, error: unknown): Promise<void> {
  const message = error instanceof Error ? error.message : String(error);
  await withTenant(tenantId, async (client) => {
    const result = await client.query<{ status: string; attempt_count: number }>(`
      UPDATE app.integration_outbox_events
      SET attempt_count = attempt_count + 1,
          status = CASE WHEN attempt_count + 1 >= 10 THEN 'DEAD' ELSE 'FAILED' END,
          available_at = now() + (
            LEAST(3600, (15 * power(2, LEAST(attempt_count, 8)))::integer) * interval '1 second'
          ),
          processing_started_at = NULL,
          last_error = $3
      WHERE tenant_id = $1 AND id = $2
      RETURNING status, attempt_count
    `, [tenantId, event.id, message.slice(0, 4_000)]);

    const state = result.rows[0];
    if (state?.status === 'DEAD') {
      await client.query(`
        INSERT INTO app.integration_dead_letters(
          id, tenant_id, source, reference_id, event_type, payload, error, retry_count
        ) VALUES (gen_random_uuid(), $1, 'OUTBOX', $2, $3, $4::jsonb, $5, $6)
      `, [tenantId, event.id, event.eventType, JSON.stringify(event.payload), message.slice(0, 4_000), state.attempt_count]);
    }
  });
}

async function publishOutbox(): Promise<void> {
  let connection: Awaited<ReturnType<typeof amqp.connect>> | null = null;

  while (!shuttingDown) {
    try {
      connection ??= await amqp.connect(env.RABBITMQ_URL);
      const channel = await connection.createConfirmChannel();
      await channel.assertExchange('implantahub.events', 'topic', { durable: true });
      const tenants = await pool.query<{ id: string }>(`SELECT id FROM app.tenancy_tenants WHERE status = 'ACTIVE'`);

      for (const tenant of tenants.rows) {
        const events = await claimOutboxEvents(tenant.id);
        for (const event of events) {
          const message = {
            eventId: event.id,
            eventType: event.eventType,
            eventVersion: event.eventVersion,
            occurredAt: event.createdAt.toISOString(),
            producer: 'implantahub-worker',
            tenantId: tenant.id,
            correlationId: event.correlationId,
            aggregate: { type: event.aggregateType, id: event.aggregateId },
            data: event.payload,
          };

          try {
            channel.publish('implantahub.events', event.eventType, Buffer.from(JSON.stringify(message)), {
              persistent: true,
              contentType: 'application/json',
              messageId: event.id,
              correlationId: event.correlationId,
              timestamp: Date.now(),
            });
            await channel.waitForConfirms();
            await withTenant(tenant.id, (client) => client.query(`
              UPDATE app.integration_outbox_events
              SET status = 'PUBLISHED', published_at = now(), processing_started_at = NULL, last_error = NULL
              WHERE tenant_id = $1 AND id = $2
            `, [tenant.id, event.id]));
          } catch (error) {
            await markOutboxFailure(tenant.id, event, error);
            throw error;
          }
        }
      }

      await channel.close();
      await new Promise((resolve) => setTimeout(resolve, 2_000));
    } catch (error) {
      console.error(JSON.stringify({
        level: 'error', service: 'implantahub-worker', message: 'outbox publisher failed',
        error: error instanceof Error ? error.message : String(error),
      }));
      if (connection) await connection.close().catch(() => undefined);
      connection = null;
      await new Promise((resolve) => setTimeout(resolve, 5_000));
    }
  }

  if (connection) await connection.close();
}

void publishOutbox();
void dispatchWebhooks();

async function shutdown(signal: string) {
  shuttingDown = true;
  console.log(JSON.stringify({ level: 'info', service: 'implantahub-worker', signal, message: 'shutting down' }));
  await Promise.all([notificationWorker.close(), reportWorker.close(), integrationWorker.close()]);
  await notificationQueue.close();
  await redis.quit();
  await pool.end();
  process.exit(0);
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
