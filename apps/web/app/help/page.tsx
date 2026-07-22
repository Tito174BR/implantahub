import { BookOpen, ExternalLink, LifeBuoy, ShieldCheck } from 'lucide-react';
import Link from 'next/link';

import { AppShell } from '../../components/app-shell';
import { Card } from '../../components/ui';

const guides = [
  { href: '/projects', title: 'Iniciar uma implantação', description: 'Cadastre o projeto, equipe, fases e marcos antes de iniciar a execução.' },
  { href: '/execution', title: 'Operar checklists', description: 'Organize critérios, responsáveis, respostas e evidências de cada gate.' },
  { href: '/quality', title: 'Executar homologação', description: 'Mantenha planos, casos, execuções e defeitos vinculados ao projeto.' },
  { href: '/governance', title: 'Controlar riscos e mudanças', description: 'Registre riscos, bloqueios, change requests e aprovações formais.' },
];

export default function HelpPage() {
  return (
    <AppShell title="Central de ajuda" subtitle="Referência rápida para operar os principais fluxos da plataforma." eyebrow="Suporte">
      <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
        <Card className="p-5 sm:p-6">
          <div className="flex items-center gap-3"><div className="grid size-10 place-items-center rounded-xl bg-[var(--brand-soft)] text-[var(--brand)]"><BookOpen size={19} /></div><div><h2 className="font-semibold">Guias operacionais</h2><p className="mt-1 text-xs text-[var(--muted)]">Acesse diretamente o módulo relacionado.</p></div></div>
          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            {guides.map((guide) => <Link key={guide.href} href={guide.href} className="rounded-xl border border-[var(--border)] p-4 transition hover:border-[var(--brand)]"><div className="flex items-center justify-between gap-3 font-semibold">{guide.title}<ExternalLink size={15} className="text-[var(--brand)]" /></div><p className="mt-2 text-xs leading-5 text-[var(--muted)]">{guide.description}</p></Link>)}
          </div>
        </Card>
        <div className="grid content-start gap-4">
          <Card className="p-5"><LifeBuoy className="text-[var(--brand)]" size={20} /><h2 className="mt-4 font-semibold">Diagnóstico técnico</h2><p className="mt-2 text-xs leading-5 text-[var(--muted)]">Consulte os logs de API, worker e web, além dos dashboards de Prometheus, Grafana e Loki.</p></Card>
          <Card className="p-5"><ShieldCheck className="text-[var(--success)]" size={20} /><h2 className="mt-4 font-semibold">Rastreabilidade</h2><p className="mt-2 text-xs leading-5 text-[var(--muted)]">Use a Auditoria e o correlation ID para investigar alterações e falhas entre serviços.</p></Card>
        </div>
      </div>
    </AppShell>
  );
}
