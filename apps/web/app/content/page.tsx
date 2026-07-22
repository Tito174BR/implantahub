'use client';

import { Download, FileUp, Files, Plus, RefreshCw, UploadCloud } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

import { AppShell } from '../../components/app-shell';
import { Badge, Button, Card, EmptyState, ErrorBox, Field, Loading, Modal, Select } from '../../components/ui';
import { apiDownload, apiFetch } from '../../lib/api';
import type { ApiEnvelope, ApiListEnvelope, Customer, Project } from '../../lib/types';

interface DocumentRecord {
  id: string;
  projectId: string | null;
  customerId: string | null;
  title: string;
  category: string;
  status: string;
  currentVersion: number;
  updatedAt: string;
}
interface DocumentVersion {
  id: string;
  documentId: string;
  version: number;
  fileName: string;
  mimeType: string | null;
  sizeBytes: number;
  status: string;
  createdAt: string;
}

export default function DocumentsPage() {
  const [documents, setDocuments] = useState<DocumentRecord[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [versions, setVersions] = useState<Record<string, DocumentVersion[]>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [uploadDocument, setUploadDocument] = useState<DocumentRecord | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ title: '', category: 'PROJECT_PLAN', projectId: '', customerId: '' });

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [documentResponse, projectResponse, customerResponse] = await Promise.all([
        apiFetch<ApiListEnvelope<DocumentRecord>>('/documents?limit=100'),
        apiFetch<ApiListEnvelope<Project>>('/projects'),
        apiFetch<ApiListEnvelope<Customer>>('/customers'),
      ]);
      setDocuments(documentResponse.data);
      setProjects(projectResponse.data);
      setCustomers(customerResponse.data);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível carregar os documentos.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function createDocument() {
    setSaving(true);
    try {
      await apiFetch('/documents', {
        method: 'POST',
        body: JSON.stringify({
          title: form.title,
          category: form.category,
          status: 'ACTIVE',
          projectId: form.projectId || null,
          customerId: form.customerId || null,
        }),
      });
      setCreateOpen(false);
      setForm({ title: '', category: 'PROJECT_PLAN', projectId: '', customerId: '' });
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível criar o documento.');
    } finally {
      setSaving(false);
    }
  }

  async function upload() {
    if (!uploadDocument || !file) return;
    setSaving(true);
    setError('');
    try {
      const response = await apiFetch<ApiEnvelope<{ versionId: string; uploadUrl: string; requiredHeaders: Record<string, string> }>>(`/documents/${uploadDocument.id}/upload-url`, {
        method: 'POST',
        body: JSON.stringify({ fileName: file.name, mimeType: file.type || 'application/octet-stream', sizeBytes: file.size }),
      });
      await apiFetch(response.data.uploadUrl, {
        method: 'PUT',
        headers: response.data.requiredHeaders,
        body: file,
      });
      setUploadDocument(null);
      setFile(null);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível enviar o arquivo.');
    } finally {
      setSaving(false);
    }
  }

  async function toggleVersions(documentId: string) {
    if (versions[documentId]) {
      setVersions((current) => { const copy = { ...current }; delete copy[documentId]; return copy; });
      return;
    }
    try {
      const response = await apiFetch<ApiListEnvelope<DocumentVersion>>(`/document-versions?documentId=${documentId}&limit=100`);
      setVersions((current) => ({ ...current, [documentId]: response.data }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível carregar as versões.');
    }
  }

  async function downloadVersion(version: DocumentVersion) {
    try {
      const { blob, fileName } = await apiDownload(`/document-versions/${version.id}/download`);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = fileName ?? version.fileName;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível gerar o download.');
    }
  }

  return (
    <AppShell title="Documentos" subtitle="Arquivos versionados, evidências e documentação dos projetos." eyebrow="Conhecimento" actions={<Button onClick={() => setCreateOpen(true)}><Plus size={16} /> Novo documento</Button>}>
      {error ? <ErrorBox message={error} /> : null}
      <Card className="overflow-hidden">
        <div className="flex items-center justify-between border-b border-[var(--border)] px-5 py-4"><h2 className="font-semibold">Biblioteca</h2><Button variant="secondary" size="sm" onClick={() => void load()}><RefreshCw size={14} /> Atualizar</Button></div>
        {loading ? <Loading /> : documents.length === 0 ? <EmptyState icon={<Files />} title="Nenhum documento" description="Cadastre o documento e envie sua primeira versão." /> : (
          <div className="divide-y divide-[var(--border)]">
            {documents.map((document) => (
              <div key={document.id}>
                <div className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center">
                  <div className="grid size-10 place-items-center rounded-xl bg-[var(--brand-soft)] text-[var(--brand)]"><Files size={18} /></div>
                  <div className="min-w-0 flex-1"><div className="font-medium">{document.title}</div><div className="mt-1 text-xs text-[var(--muted)]">{document.category} · versão {document.currentVersion}</div></div>
                  <Badge tone="success" dot>{document.status}</Badge>
                  <Button variant="secondary" size="sm" onClick={() => void toggleVersions(document.id)}><Download size={14} /> Versões</Button>
                  <Button size="sm" onClick={() => setUploadDocument(document)}><FileUp size={14} /> Enviar arquivo</Button>
                </div>
                {versions[document.id] ? (
                  <div className="border-t border-[var(--border)] bg-[var(--surface-muted)] px-5 py-3">
                    {versions[document.id]!.length === 0 ? <div className="text-xs text-[var(--muted)]">Nenhuma versão enviada.</div> : versions[document.id]!.map((version) => (
                      <div key={version.id} className="flex items-center gap-3 py-2 text-sm">
                        <span className="font-semibold">v{version.version}</span>
                        <span className="min-w-0 flex-1 truncate text-[var(--muted)]">{version.fileName}</span>
                        <Badge tone={version.status === 'AVAILABLE' ? 'success' : 'warning'}>{version.status}</Badge>
                        <Button variant="ghost" size="sm" disabled={version.status !== 'AVAILABLE'} onClick={() => void downloadVersion(version)}><Download size={14} /> Baixar</Button>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </Card>

      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Novo documento">
        <div className="grid gap-4">
          <Field label="Título"><input className="input-shell" value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} /></Field>
          <Field label="Categoria"><input className="input-shell" value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })} /></Field>
          <Field label="Projeto"><Select value={form.projectId} onChange={(event) => setForm({ ...form, projectId: event.target.value })}><option value="">Sem projeto</option>{projects.map((project) => <option key={project.id} value={project.id}>{project.code} — {project.name}</option>)}</Select></Field>
          <Field label="Cliente"><Select value={form.customerId} onChange={(event) => setForm({ ...form, customerId: event.target.value })}><option value="">Sem cliente</option>{customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.code} — {customer.tradeName ?? customer.legalName}</option>)}</Select></Field>
          <div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => setCreateOpen(false)}>Cancelar</Button><Button disabled={saving || !form.title} onClick={() => void createDocument()}>{saving ? 'Salvando...' : 'Criar documento'}</Button></div>
        </div>
      </Modal>

      <Modal open={Boolean(uploadDocument)} onClose={() => { setUploadDocument(null); setFile(null); }} title="Enviar nova versão" description={uploadDocument?.title}>
        <div className="grid gap-4">
          <label className="grid min-h-44 cursor-pointer place-items-center rounded-2xl border-2 border-dashed border-[var(--border-strong)] bg-[var(--surface-muted)] p-6 text-center">
            <div><UploadCloud className="mx-auto text-[var(--brand)]" size={30} /><div className="mt-3 font-medium">{file ? file.name : 'Escolha um arquivo'}</div><div className="mt-1 text-xs text-[var(--muted)]">Limite de 200 MB por versão.</div></div>
            <input className="hidden" type="file" onChange={(event) => setFile(event.target.files?.[0] ?? null)} />
          </label>
          <div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => setUploadDocument(null)}>Cancelar</Button><Button disabled={saving || !file} onClick={() => void upload()}>{saving ? 'Enviando...' : 'Enviar versão'}</Button></div>
        </div>
      </Modal>
    </AppShell>
  );
}
