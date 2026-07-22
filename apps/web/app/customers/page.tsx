'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Building2, ExternalLink, Plus, UsersRound } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { AppShell } from '../../components/app-shell';
import { Badge, Button, Card, EmptyState, ErrorBox, Field, Loading, Modal, SearchInput, StatCard } from '../../components/ui';
import { apiFetch } from '../../lib/api';
import { initials } from '../../lib/format';
import type { ApiListEnvelope, Customer, Project } from '../../lib/types';

const formSchema = z.object({
  code: z.string().min(2, 'Informe um código.'),
  legalName: z.string().min(2, 'Informe a razão social.'),
  tradeName: z.string().optional(),
  taxIdentifier: z.string().optional(),
});

type FormData = z.infer<typeof formSchema>;

export default function CustomersPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const customers = useQuery({
    queryKey: ['customers'],
    queryFn: () => apiFetch<ApiListEnvelope<Customer>>('/customers'),
  });
  const projects = useQuery({
    queryKey: ['projects'],
    queryFn: () => apiFetch<ApiListEnvelope<Project>>('/projects'),
  });

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: { code: '', legalName: '', tradeName: '', taxIdentifier: '' },
  });

  const mutation = useMutation({
    mutationFn: (data: FormData) => apiFetch('/customers', {
      method: 'POST',
      body: JSON.stringify({
        ...data,
        tradeName: data.tradeName || null,
        taxIdentifier: data.taxIdentifier || null,
      }),
    }),
    onSuccess: async () => {
      form.reset();
      setModalOpen(false);
      await queryClient.invalidateQueries({ queryKey: ['customers'] });
    },
  });

  const projectCount = useMemo(() => {
    const map = new Map<string, number>();
    for (const project of projects.data?.data ?? []) {
      map.set(project.customerId, (map.get(project.customerId) ?? 0) + 1);
    }
    return map;
  }, [projects.data]);

  const averageProjects = customers.data?.data.length
    ? ((projects.data?.data.length ?? 0) / customers.data.data.length).toFixed(1)
    : '0.0';

  const filtered = useMemo(() => {
    const term = search.trim().toLocaleLowerCase('pt-BR');
    if (!term) return customers.data?.data ?? [];
    return (customers.data?.data ?? []).filter((customer) =>
      [customer.code, customer.legalName, customer.tradeName, customer.taxIdentifier]
        .filter(Boolean)
        .some((value) => String(value).toLocaleLowerCase('pt-BR').includes(term)),
    );
  }, [customers.data, search]);

  return (
    <AppShell
      eyebrow="Customer portfolio"
      title="Clientes"
      subtitle="Gerencie organizações, contratos e o portfólio de projetos vinculado a cada cliente."
      actions={<Button onClick={() => setModalOpen(true)}><Plus size={16} /> Novo cliente</Button>}
    >
      <section className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Clientes ativos" value={customers.data?.data.length ?? 0} detail="Organizações no workspace" icon={<Building2 size={18} />} />
        <StatCard label="Projetos vinculados" value={projects.data?.data.length ?? 0} detail="Portfólio total" icon={<ExternalLink size={18} />} tone="info" />
        <StatCard label="Média por cliente" value={averageProjects} detail="Projetos por organização" icon={<UsersRound size={18} />} tone="success" />
      </section>

      <Card className="mt-5 overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-[var(--border)] p-4 sm:flex-row sm:items-center sm:justify-between">
          <SearchInput className="w-full sm:max-w-sm" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar por nome, código ou CNPJ..." />
          <div className="text-xs text-[var(--muted)]">{filtered.length} resultado(s)</div>
        </div>

        {customers.isPending ? <Loading /> : null}
        {customers.error ? <div className="p-5"><ErrorBox message={customers.error.message} /></div> : null}

        {!customers.isPending && filtered.length === 0 ? (
          <div className="p-5">
            <EmptyState icon={<Building2 size={21} />} title="Nenhum cliente encontrado" description="Cadastre a primeira organização ou ajuste o termo da busca." action={<Button onClick={() => setModalOpen(true)}><Plus size={15} /> Cadastrar cliente</Button>} />
          </div>
        ) : null}

        {filtered.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] border-collapse text-left">
              <thead>
                <tr className="border-b border-[var(--border)] bg-[var(--surface-muted)] text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">
                  <th className="px-5 py-3">Cliente</th>
                  <th className="px-5 py-3">Código</th>
                  <th className="px-5 py-3">Documento</th>
                  <th className="px-5 py-3">Projetos</th>
                  <th className="px-5 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {filtered.map((customer) => (
                  <tr key={customer.id} className="transition hover:bg-[var(--surface-muted)]">
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <div className="grid size-9 place-items-center rounded-xl bg-[var(--brand-soft)] text-xs font-bold text-[var(--brand)]">{initials(customer.tradeName ?? customer.legalName)}</div>
                        <div>
                          <div className="text-sm font-semibold">{customer.tradeName ?? customer.legalName}</div>
                          {customer.tradeName ? <div className="mt-1 max-w-[280px] truncate text-xs text-[var(--muted)]">{customer.legalName}</div> : null}
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-4 font-mono text-xs text-[var(--muted)]">{customer.code}</td>
                    <td className="px-5 py-4 text-xs text-[var(--text-soft)]">{customer.taxIdentifier ?? 'Não informado'}</td>
                    <td className="px-5 py-4 text-sm font-semibold">{projectCount.get(customer.id) ?? 0}</td>
                    <td className="px-5 py-4"><Badge tone="success" dot>{customer.status === 'ACTIVE' ? 'Ativo' : customer.status}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </Card>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Cadastrar cliente" description="Inclua uma nova organização no workspace.">
        <form className="grid gap-5" onSubmit={form.handleSubmit((data) => mutation.mutate(data))}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Código" error={form.formState.errors.code?.message}><input className="input-shell" placeholder="CLI-002" {...form.register('code')} /></Field>
            <Field label="CNPJ ou documento"><input className="input-shell" placeholder="00.000.000/0001-00" {...form.register('taxIdentifier')} /></Field>
          </div>
          <Field label="Razão social" error={form.formState.errors.legalName?.message}><input className="input-shell" placeholder="Empresa Exemplo Ltda." {...form.register('legalName')} /></Field>
          <Field label="Nome fantasia"><input className="input-shell" placeholder="Empresa Exemplo" {...form.register('tradeName')} /></Field>
          {mutation.error ? <ErrorBox message={mutation.error.message} /> : null}
          <div className="flex justify-end gap-2 border-t border-[var(--border)] pt-5">
            <Button variant="secondary" type="button" onClick={() => setModalOpen(false)}>Cancelar</Button>
            <Button type="submit" disabled={mutation.isPending}>{mutation.isPending ? 'Salvando...' : 'Cadastrar cliente'}</Button>
          </div>
        </form>
      </Modal>
    </AppShell>
  );
}
