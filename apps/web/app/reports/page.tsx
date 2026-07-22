'use client';

import { BarChart3, Download, FileSpreadsheet, FileText, Plus, RefreshCw } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

import { AppShell } from '../../components/app-shell';
import { Badge, Button, Card, EmptyState, ErrorBox, Field, Loading, Modal, Select } from '../../components/ui';
import { apiDownload, apiFetch } from '../../lib/api';
import type { ApiEnvelope, ApiListEnvelope } from '../../lib/types';

interface ReportJob {
  id: string;
  type: string;
  format: string;
  status: string;
  objectKey?: string | null;
  errorMessage?: string | null;
  createdAt: string;
  finishedAt?: string | null;
}

const statusTone = (status: string): 'neutral' | 'brand' | 'success' | 'warning' | 'danger' | 'info' => {
  if (status === 'COMPLETED') return 'success';
  if (status === 'FAILED') return 'danger';
  if (status === 'PROCESSING') return 'info';
  if (status === 'PENDING') return 'warning';
  return 'neutral';
};

export default function ReportsPage() {
  const [reports, setReports] = useState<ReportJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ type: 'EXECUTIVE', format: 'PDF' });

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await apiFetch<ApiListEnvelope<ReportJob>>('/report-jobs?limit=100');
      setReports(response.data);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível carregar os relatórios.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function createReport() {
    setSaving(true);
    setError('');
    try {
      await apiFetch<ApiEnvelope<{ id: string; status: string }>>('/reports', {
        method: 'POST',
        body: JSON.stringify({ ...form, filters: {} }),
      });
      setOpen(false);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível solicitar o relatório.');
    } finally {
      setSaving(false);
    }
  }

  async function download(report: ReportJob) {
    setError('');
    try {
      const { blob, fileName } = await apiDownload(`/reports/${report.id}/download`);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = fileName ?? `${report.type.toLowerCase()}-${report.id}.${report.format.toLowerCase()}`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível baixar o relatório.');
    }
  }

  return (
    <AppShell
      title="Relatórios"
      subtitle="Gere exportações executivas e operacionais processadas em segundo plano."
      eyebrow="Inteligência"
      actions={<Button onClick={() => setOpen(true)}><Plus size={16} /> Novo relatório</Button>}
    >
      {error ? <ErrorBox message={error} /> : null}
      <div className="mb-5 grid gap-4 sm:grid-cols-3">
        <Card className="p-5"><BarChart3 size={20} className="text-[var(--brand)]" /><div className="mt-4 text-3xl font-bold">{reports.length}</div><div className="mt-1 text-sm text-[var(--muted)]">Relatórios solicitados</div></Card>
        <Card className="p-5"><FileText size={20} className="text-[var(--success)]" /><div className="mt-4 text-3xl font-bold">{reports.filter((item) => item.status === 'COMPLETED').length}</div><div className="mt-1 text-sm text-[var(--muted)]">Concluídos</div></Card>
        <Card className="p-5"><FileSpreadsheet size={20} className="text-[var(--warning)]" /><div className="mt-4 text-3xl font-bold">{reports.filter((item) => ['PENDING', 'PROCESSING'].includes(item.status)).length}</div><div className="mt-1 text-sm text-[var(--muted)]">Em processamento</div></Card>
      </div>

      <Card className="overflow-hidden">
        <div className="flex items-center justify-between border-b border-[var(--border)] px-5 py-4">
          <h2 className="font-semibold">Histórico de exportações</h2>
          <Button variant="secondary" size="sm" onClick={() => void load()}><RefreshCw size={14} /> Atualizar</Button>
        </div>
        {loading ? <Loading /> : reports.length === 0 ? <EmptyState title="Nenhum relatório solicitado" description="Solicite uma exportação para começar." /> : (
          <div className="divide-y divide-[var(--border)]">
            {reports.map((report) => (
              <div key={report.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center">
                <div className="grid size-10 place-items-center rounded-xl bg-[var(--surface-muted)] text-[var(--muted)]"><FileText size={18} /></div>
                <div className="min-w-0 flex-1">
                  <div className="font-medium">{report.type}</div>
                  <div className="mt-1 text-xs text-[var(--muted)]">{report.format} · {new Date(report.createdAt).toLocaleString('pt-BR')}</div>
                  {report.errorMessage ? <div className="mt-1 text-xs text-[var(--danger)]">{report.errorMessage}</div> : null}
                </div>
                <Badge tone={statusTone(report.status)} dot>{report.status}</Badge>
                <Button variant="secondary" size="sm" disabled={report.status !== 'COMPLETED'} onClick={() => void download(report)}><Download size={14} /> Baixar</Button>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Modal open={open} onClose={() => setOpen(false)} title="Novo relatório" description="O worker gerará o arquivo e notificará quando estiver pronto.">
        <div className="grid gap-4">
          <Field label="Tipo">
            <Select value={form.type} onChange={(event) => setForm({ ...form, type: event.target.value })}>
              <option value="EXECUTIVE">Executivo</option>
              <option value="PORTFOLIO">Portfólio</option>
              <option value="TASKS">Tarefas</option>
              <option value="RISKS">Riscos</option>
              <option value="DEPLOYMENTS">Deployments</option>
              <option value="DEFECTS">Defeitos</option>
            </Select>
          </Field>
          <Field label="Formato">
            <Select value={form.format} onChange={(event) => setForm({ ...form, format: event.target.value })}>
              <option value="PDF">PDF</option>
              <option value="XLSX">Excel</option>
              <option value="CSV">CSV</option>
            </Select>
          </Field>
          <div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => setOpen(false)}>Cancelar</Button><Button onClick={() => void createReport()} disabled={saving}>{saving ? 'Solicitando...' : 'Gerar relatório'}</Button></div>
        </div>
      </Modal>
    </AppShell>
  );
}
