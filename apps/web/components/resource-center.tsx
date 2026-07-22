'use client';

import {
  Boxes,
  CalendarDays,
  CheckCircle2,
  Database,
  Edit3,
  FileJson,
  FolderPlus,
  MailCheck,
  Play,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Trash2,
  Wifi,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { apiFetch } from '../lib/api';
import type { ApiEnvelope, ApiListEnvelope, Customer, Project } from '../lib/types';
import { Badge, Button, Card, EmptyState, ErrorBox, Field, Loading, Modal, SearchInput, Select } from './ui';

interface CatalogField {
  api: string;
  column: string;
  type: 'string' | 'text' | 'uuid' | 'number' | 'boolean' | 'date' | 'json';
  required?: boolean;
  readOnly?: boolean;
  relation?: { path: string; labelFields: string[] };
  defaultValue?: unknown;
}

interface CatalogResource {
  key: string;
  path: string;
  label: string;
  group: string;
  description: string;
  titleField: string;
  filters: string[];
  fields: CatalogField[];
  allowCreate: boolean;
  allowUpdate: boolean;
  allowDelete: boolean;
}

type RecordValue = string | number | boolean | null | undefined | Record<string, unknown> | unknown[];
type PlatformRecord = Record<string, RecordValue> & { id: string; status?: string; createdAt?: string; updatedAt?: string };
type RelationRecord = Record<string, unknown> & { id: string; projectId?: string };

function relationLabel(record: RelationRecord, fields: string[]): string {
  const values = fields.map((field) => record[field]).filter((value) => value !== null && value !== undefined && value !== '');
  return values.length ? values.map(String).join(' — ') : record.id;
}

const commonStatuses = [
  'DRAFT', 'PENDING', 'OPEN', 'PLANNED', 'ACTIVE', 'IN_PROGRESS', 'PROCESSING',
  'SUBMITTED', 'APPROVED', 'REJECTED', 'BLOCKED', 'FAILED', 'SUCCEEDED',
  'COMPLETED', 'RESOLVED', 'CLOSED', 'CANCELLED', 'INACTIVE', 'SENT', 'READ',
];

function labelize(value: string): string {
  return value
    .replace(/([A-Z])/g, ' $1')
    .replaceAll('_', ' ')
    .replace(/^./, (letter) => letter.toUpperCase());
}

function formatValue(value: RecordValue): string {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'boolean') return value ? 'Sim' : 'Não';
  if (typeof value === 'object') return JSON.stringify(value);
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value)) {
    return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value));
  }
  return String(value);
}

function statusTone(status?: string): 'neutral' | 'brand' | 'success' | 'warning' | 'danger' | 'info' {
  if (!status) return 'neutral';
  if (['COMPLETED', 'APPROVED', 'SUCCEEDED', 'ACTIVE', 'SENT', 'RESOLVED', 'CLOSED'].includes(status)) return 'success';
  if (['FAILED', 'REJECTED', 'CANCELLED', 'ERROR'].includes(status)) return 'danger';
  if (['BLOCKED', 'PENDING', 'OPEN', 'PLANNED'].includes(status)) return 'warning';
  if (['IN_PROGRESS', 'PROCESSING', 'SUBMITTED'].includes(status)) return 'info';
  return 'brand';
}

function emptyForm(resource: CatalogResource | null): Record<string, unknown> {
  if (!resource) return {};
  return Object.fromEntries(resource.fields.filter((field) => !field.readOnly).map((field) => {
    const defaultValue = field.defaultValue;
    return [
      field.api,
      defaultValue !== undefined
        ? (field.type === 'json' ? JSON.stringify(defaultValue, null, 2) : defaultValue)
        : field.type === 'boolean' ? false : field.type === 'json' ? '{}' : '',
    ];
  }));
}

export function ResourceCenter({ groups }: { groups: string[] }) {
  const [catalog, setCatalog] = useState<CatalogResource[]>([]);
  const [resourceKey, setResourceKey] = useState('');
  const [records, setRecords] = useState<PlatformRecord[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [relationRecords, setRelationRecords] = useState<Record<string, RelationRecord[]>>({});
  const [search, setSearch] = useState('');
  const [projectId, setProjectId] = useState('');
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<PlatformRecord | null>(null);
  const [form, setForm] = useState<Record<string, unknown>>({});

  const resources = useMemo(() => catalog.filter((resource) => groups.includes(resource.group)), [catalog, groups]);
  const selected = useMemo(() => resources.find((resource) => resource.key === resourceKey) ?? resources[0] ?? null, [resources, resourceKey]);

  useEffect(() => {
    async function bootstrap() {
      try {
        const [catalogResponse, projectResponse, customerResponse] = await Promise.all([
          apiFetch<ApiEnvelope<CatalogResource[]>>('/platform/catalog'),
          apiFetch<ApiListEnvelope<Project>>('/projects'),
          apiFetch<ApiListEnvelope<Customer>>('/customers'),
        ]);
        const filtered = catalogResponse.data.filter((resource) => groups.includes(resource.group));
        setCatalog(catalogResponse.data);
        setResourceKey(filtered[0]?.key ?? '');
        setProjects(projectResponse.data);
        setCustomers(customerResponse.data);
        setRelationRecords((current) => ({
          ...current,
          projects: projectResponse.data as unknown as RelationRecord[],
          customers: customerResponse.data as unknown as RelationRecord[],
        }));
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'Não foi possível carregar os módulos.');
      }
    }
    void bootstrap();
  }, [groups]);

  const loadRecords = useCallback(async () => {
    if (!selected) return;
    setLoading(true);
    setError('');
    const params = new URLSearchParams();
    if (search.trim()) params.set('search', search.trim());
    if (projectId && selected.filters.includes('projectId')) params.set('projectId', projectId);
    if (status && selected.filters.includes('status')) params.set('status', status);
    try {
      const response = await apiFetch<ApiListEnvelope<PlatformRecord>>(`/${selected.path}?${params.toString()}`);
      setRecords(response.data);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível carregar os registros.');
    } finally {
      setLoading(false);
    }
  }, [projectId, search, selected, status]);

  useEffect(() => {
    void loadRecords();
  }, [loadRecords]);

  useEffect(() => {
    if (!modalOpen || !selected) return;
    const paths = [...new Set(selected.fields.flatMap((field) => field.relation?.path ? [field.relation.path] : []))]
      .filter((path) => !relationRecords[path]);
    if (!paths.length) return;

    let active = true;
    void Promise.all(paths.map(async (path) => {
      const separator = path.includes('?') ? '&' : '?';
      const response = await apiFetch<ApiEnvelope<RelationRecord[]>>(`/${path}${separator}limit=200`);
      return [path, response.data] as const;
    })).then((loaded) => {
      if (!active) return;
      setRelationRecords((current) => ({ ...current, ...Object.fromEntries(loaded) }));
    }).catch((cause) => {
      if (active) setError(cause instanceof Error ? cause.message : 'Não foi possível carregar os campos relacionados.');
    });
    return () => { active = false; };
  }, [modalOpen, relationRecords, selected]);

  function startCreate() {
    setEditing(null);
    const initial = emptyForm(selected);
    if (projectId && selected?.fields.some((field) => field.api === 'projectId')) initial.projectId = projectId;
    setForm(initial);
    setModalOpen(true);
  }

  function startEdit(record: PlatformRecord) {
    setEditing(record);
    const initial = emptyForm(selected);
    for (const field of selected?.fields.filter((item) => !item.readOnly) ?? []) {
      const value = record[field.api];
      if (field.type === 'date' && typeof value === 'string' && value) {
        const date = new Date(value);
        initial[field.api] = Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 16);
      } else {
        initial[field.api] = typeof value === 'object' && value !== null ? JSON.stringify(value, null, 2) : value ?? '';
      }
    }
    setForm(initial);
    setModalOpen(true);
  }

  async function saveRecord() {
    if (!selected) return;
    setSaving(true);
    setError('');
    try {
      const payload = Object.fromEntries(Object.entries(form).filter(([, value]) => value !== ''));
      if (editing) {
        await apiFetch(`/${selected.path}/${editing.id}`, { method: 'PATCH', body: JSON.stringify(payload) });
      } else {
        await apiFetch(`/${selected.path}`, { method: 'POST', body: JSON.stringify(payload) });
      }
      setModalOpen(false);
      await loadRecords();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível salvar o registro.');
    } finally {
      setSaving(false);
    }
  }

  async function runSpecialAction(record: PlatformRecord) {
    if (!selected) return;
    setError('');
    try {
      if (selected.key === 'integration-connections') {
        await apiFetch(`/integration-connections/${record.id}/test`, { method: 'POST', body: JSON.stringify({}) });
      } else if (selected.key === 'integration-jobs') {
        await apiFetch(`/integration-jobs/${record.id}/run`, { method: 'POST' });
      } else if (selected.key === 'notifications') {
        await apiFetch(`/notifications/${record.id}/read`, { method: 'POST' });
      } else if (selected.key === 'webhook-deliveries') {
        await apiFetch(`/webhook-deliveries/${record.id}/retry`, { method: 'POST' });
      }
      await loadRecords();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível executar a ação.');
    }
  }

  async function deleteRecord(record: PlatformRecord) {
    if (!selected || !window.confirm(`Excluir este registro de ${selected.label.toLowerCase()}?`)) return;
    try {
      await apiFetch(`/${selected.path}/${record.id}`, { method: 'DELETE' });
      await loadRecords();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível excluir o registro.');
    }
  }

  const visibleFields = selected?.fields.filter((field) => !['projectId', 'customerId'].includes(field.api)).slice(0, 4) ?? [];

  return (
    <div className="grid gap-5">
      <Card className="overflow-hidden">
        <div className="flex gap-2 overflow-x-auto border-b border-[var(--border)] p-3">
          {resources.map((resource) => (
            <button
              key={resource.key}
              type="button"
              onClick={() => { setResourceKey(resource.key); setSearch(''); setStatus(''); }}
              className={`shrink-0 rounded-xl px-4 py-2.5 text-left transition ${selected?.key === resource.key ? 'bg-[var(--brand-soft)] text-[var(--brand)]' : 'text-[var(--muted)] hover:bg-[var(--surface-muted)]'}`}
            >
              <div className="text-xs font-semibold">{resource.label}</div>
              <div className="mt-1 hidden max-w-48 truncate text-[10px] opacity-75 lg:block">{resource.description}</div>
            </button>
          ))}
        </div>

        <div className="p-4 sm:p-5">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <div className="grid size-9 place-items-center rounded-xl bg-[var(--brand-soft)] text-[var(--brand)]"><Boxes size={17} /></div>
                <div>
                  <h2 className="font-semibold text-[var(--text)]">{selected?.label ?? 'Módulo'}</h2>
                  <p className="mt-0.5 text-xs text-[var(--muted)]">{selected?.description}</p>
                </div>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="secondary" size="sm" onClick={() => void loadRecords()}><RefreshCw size={14} /> Atualizar</Button>
              {selected?.allowCreate ? <Button size="sm" onClick={startCreate}><Plus size={14} /> Novo registro</Button> : null}
            </div>
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-[minmax(220px,1fr)_240px_180px]">
            <SearchInput value={search} onChange={(event) => setSearch(event.target.value)} placeholder={`Buscar em ${selected?.label.toLowerCase() ?? 'registros'}...`} />
            {selected?.filters.includes('projectId') ? (
              <Select value={projectId} onChange={(event) => setProjectId(event.target.value)}>
                <option value="">Todos os projetos</option>
                {projects.map((project) => <option key={project.id} value={project.id}>{project.code} — {project.name}</option>)}
              </Select>
            ) : <div />}
            {selected?.filters.includes('status') ? (
              <Select value={status} onChange={(event) => setStatus(event.target.value)}>
                <option value="">Todos os status</option>
                {commonStatuses.map((item) => <option key={item} value={item}>{item}</option>)}
              </Select>
            ) : <div />}
          </div>
        </div>
      </Card>

      {error ? <ErrorBox message={error} /> : null}

      {loading ? <Loading label="Carregando registros do módulo..." /> : records.length === 0 ? (
        <EmptyState
          icon={<Database size={21} />}
          title={`Nenhum registro em ${selected?.label ?? 'este módulo'}`}
          description="Crie o primeiro registro para iniciar o fluxo operacional deste módulo."
          action={selected?.allowCreate ? <Button onClick={startCreate}><FolderPlus size={16} /> Criar registro</Button> : undefined}
        />
      ) : (
        <div className="grid gap-3">
          {records.map((record) => {
            const title = formatValue(record[selected?.titleField ?? 'id']);
            return (
              <Card key={record.id} className="p-4 sm:p-5" hover>
                <div className="flex flex-col gap-4 xl:flex-row xl:items-center">
                  <div className="flex min-w-0 flex-1 items-start gap-3">
                    <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-[var(--surface-muted)] text-[var(--muted)]">
                      {record.status === 'COMPLETED' || record.status === 'APPROVED' ? <CheckCircle2 size={18} /> : <ShieldCheck size={18} />}
                    </div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="truncate font-semibold text-[var(--text)]">{title}</h3>
                        {record.status ? <Badge tone={statusTone(record.status)} dot>{record.status}</Badge> : null}
                      </div>
                      <div className="mt-2 grid gap-x-6 gap-y-1 text-xs text-[var(--muted)] sm:grid-cols-2 lg:grid-cols-4">
                        {visibleFields.map((field) => (
                          <div key={field.api} className="truncate"><span className="font-medium text-[var(--text-soft)]">{labelize(field.api)}:</span> {formatValue(record[field.api])}</div>
                        ))}
                      </div>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {record.createdAt ? <span className="mr-2 hidden items-center gap-1 text-[11px] text-[var(--muted)] sm:flex"><CalendarDays size={13} /> {formatValue(record.createdAt)}</span> : null}
                    {selected?.key === 'integration-connections' ? <Button variant="secondary" size="sm" onClick={() => void runSpecialAction(record)}><Wifi size={14} /> Testar</Button> : null}
                    {selected?.key === 'integration-jobs' ? <Button variant="secondary" size="sm" onClick={() => void runSpecialAction(record)}><Play size={14} /> Executar</Button> : null}
                    {selected?.key === 'notifications' && record.status !== 'READ' ? <Button variant="secondary" size="sm" onClick={() => void runSpecialAction(record)}><MailCheck size={14} /> Marcar lida</Button> : null}
                    {selected?.key === 'webhook-deliveries' && ['FAILED', 'DEAD'].includes(String(record.status)) ? <Button variant="secondary" size="sm" onClick={() => void runSpecialAction(record)}><RefreshCw size={14} /> Reprocessar</Button> : null}
                    {selected?.allowUpdate ? <Button variant="secondary" size="icon" onClick={() => startEdit(record)} aria-label="Editar"><Edit3 size={15} /></Button> : null}
                    {selected?.allowDelete ? <Button variant="ghost" size="icon" onClick={() => void deleteRecord(record)} aria-label="Excluir"><Trash2 size={15} /></Button> : null}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? `Editar ${selected?.label.toLowerCase()}` : `Novo registro em ${selected?.label.toLowerCase()}`}
        description={selected?.description}
        width="max-w-3xl"
      >
        <div className="grid gap-4 sm:grid-cols-2">
          {selected?.fields.filter((field) => !field.readOnly).map((field) => {
            const value = form[field.api];
            if (field.relation) {
              const allOptions = relationRecords[field.relation.path] ?? [];
              const currentProjectId = String(form.projectId ?? '');
              const options = allOptions.filter((option) => (
                !currentProjectId || !option.projectId || option.projectId === currentProjectId
              ));
              return (
                <Field key={field.api} label={labelize(field.api)}>
                  <Select value={String(value ?? '')} onChange={(event) => setForm((current) => ({ ...current, [field.api]: event.target.value }))} required={field.required}>
                    <option value="">{field.required ? 'Selecione uma opção' : 'Nenhum'}</option>
                    {options.map((option) => (
                      <option key={option.id} value={option.id}>{relationLabel(option, field.relation!.labelFields)}</option>
                    ))}
                  </Select>
                </Field>
              );
            }
            if (field.api === 'status') {
              return (
                <Field key={field.api} label="Status">
                  <Select value={String(value ?? '')} onChange={(event) => setForm((current) => ({ ...current, [field.api]: event.target.value }))}>
                    <option value="">Padrão do módulo</option>
                    {commonStatuses.map((item) => <option key={item} value={item}>{item}</option>)}
                  </Select>
                </Field>
              );
            }
            if (field.type === 'boolean') {
              return (
                <Field key={field.api} label={labelize(field.api)}>
                  <Select value={String(Boolean(value))} onChange={(event) => setForm((current) => ({ ...current, [field.api]: event.target.value === 'true' }))}>
                    <option value="true">Sim</option><option value="false">Não</option>
                  </Select>
                </Field>
              );
            }
            if (field.type === 'text' || field.type === 'json') {
              return (
                <Field key={field.api} label={labelize(field.api)} hint={field.type === 'json' ? 'Informe um objeto ou lista JSON válida.' : undefined}>
                  <textarea
                    className="input-shell min-h-28 resize-y sm:col-span-2"
                    value={String(value ?? '')}
                    onChange={(event) => setForm((current) => ({ ...current, [field.api]: event.target.value }))}
                    required={field.required}
                  />
                </Field>
              );
            }
            return (
              <Field key={field.api} label={labelize(field.api)}>
                <input
                  className="input-shell"
                  type={field.type === 'number' ? 'number' : field.type === 'date' ? 'datetime-local' : 'text'}
                  value={String(value ?? '')}
                  onChange={(event) => setForm((current) => ({ ...current, [field.api]: event.target.value }))}
                  required={field.required}
                />
              </Field>
            );
          })}
        </div>
        <div className="mt-6 flex justify-end gap-2 border-t border-[var(--border)] pt-5">
          <Button variant="secondary" onClick={() => setModalOpen(false)}>Cancelar</Button>
          <Button onClick={() => void saveRecord()} disabled={saving}>{saving ? 'Salvando...' : editing ? 'Salvar alterações' : 'Criar registro'}</Button>
        </div>
      </Modal>
    </div>
  );
}
