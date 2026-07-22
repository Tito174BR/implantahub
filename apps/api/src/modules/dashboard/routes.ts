import type { FastifyInstance } from 'fastify';

import { withTenantClient } from '../../db/client.js';
import { envelope } from '../../lib/envelope.js';

export async function dashboardRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/v1/dashboard/summary', {
    preHandler: app.requireRole('ADMIN', 'MANAGER', 'ANALYST'),
    schema: { tags: ['Dashboard'], summary: 'Consultar indicadores operacionais' },
  }, async (request) => {
    const tenantId = request.user.tenantId!;

    const result = await withTenantClient(tenantId, async (client) => {
      const [projectStats, taskStats, governanceStats, qualityStats, deliveryStats, phaseStats] = await Promise.all([
        client.query(`
          SELECT count(*)::int AS total,
                 count(*) FILTER (WHERE status NOT IN ('COMPLETED','CANCELLED'))::int AS active,
                 count(*) FILTER (WHERE status = 'BLOCKED')::int AS blocked,
                 count(*) FILTER (WHERE status = 'COMPLETED')::int AS completed
          FROM app.project_projects WHERE tenant_id = $1 AND deleted_at IS NULL
        `, [tenantId]),
        client.query(`
          SELECT count(*)::int AS total,
                 count(*) FILTER (WHERE status IN ('PENDING','IN_PROGRESS','BLOCKED'))::int AS pending,
                 count(*) FILTER (WHERE status = 'COMPLETED')::int AS completed,
                 count(*) FILTER (WHERE due_at < now() AND status NOT IN ('COMPLETED','CANCELLED'))::int AS overdue
          FROM app.execution_tasks WHERE tenant_id = $1 AND deleted_at IS NULL
        `, [tenantId]),
        client.query(`
          SELECT count(*) FILTER (WHERE status = 'OPEN')::int AS open_risks,
                 count(*) FILTER (WHERE status = 'OPEN' AND score >= 15)::int AS critical_risks,
                 (SELECT count(*)::int FROM app.governance_blockers WHERE tenant_id = $1 AND status = 'OPEN') AS blockers,
                 (SELECT count(*)::int FROM app.governance_approvals WHERE tenant_id = $1 AND status = 'PENDING') AS pending_approvals
          FROM app.governance_risks WHERE tenant_id = $1
        `, [tenantId]),
        client.query(`
          SELECT count(*) FILTER (WHERE status NOT IN ('RESOLVED','CLOSED'))::int AS open_defects,
                 count(*) FILTER (WHERE status NOT IN ('RESOLVED','CLOSED') AND severity IN ('HIGH','CRITICAL'))::int AS critical_defects,
                 (SELECT count(*)::int FROM app.quality_test_runs WHERE tenant_id = $1 AND status = 'PASSED') AS passed_tests,
                 (SELECT count(*)::int FROM app.quality_test_runs WHERE tenant_id = $1 AND status = 'FAILED') AS failed_tests
          FROM app.quality_defects WHERE tenant_id = $1
        `, [tenantId]),
        client.query(`
          SELECT count(*)::int AS total,
                 count(*) FILTER (WHERE status = 'SUCCEEDED')::int AS succeeded,
                 count(*) FILTER (WHERE status = 'FAILED')::int AS failed,
                 count(*) FILTER (WHERE status IN ('PLANNED','RUNNING'))::int AS active
          FROM app.delivery_deployments WHERE tenant_id = $1
        `, [tenantId]),
        client.query(`
          SELECT COALESCE(round(avg(progress)), 0)::int AS average_progress,
                 count(*) FILTER (WHERE status = 'IN_PROGRESS')::int AS active_phases
          FROM app.project_phases WHERE tenant_id = $1
        `, [tenantId]),
      ]);

      return {
        projects: projectStats.rows[0] ?? { total: 0, active: 0, blocked: 0, completed: 0 },
        tasks: taskStats.rows[0] ?? { total: 0, pending: 0, completed: 0, overdue: 0 },
        governance: governanceStats.rows[0] ?? { openRisks: 0, criticalRisks: 0, blockers: 0, pendingApprovals: 0 },
        quality: qualityStats.rows[0] ?? { openDefects: 0, criticalDefects: 0, passedTests: 0, failedTests: 0 },
        delivery: deliveryStats.rows[0] ?? { total: 0, succeeded: 0, failed: 0, active: 0 },
        phases: phaseStats.rows[0] ?? { averageProgress: 0, activePhases: 0 },
        generatedAt: new Date().toISOString(),
      };
    });

    return envelope(request, result);
  });
}
