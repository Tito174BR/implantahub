import {
  BarChart3,
  BellRing,
  CheckCircle2,
  FileSearch,
  Files,
  FlaskConical,
  Gauge,
  GitBranch,
  ListChecks,
  ShieldAlert,
} from 'lucide-react';
import Link from 'next/link';

import { AppShell } from '../../components/app-shell';
import { Badge, Card } from '../../components/ui';

const modules = [
  { href: '/planning', name: 'Planejamento', description: 'Templates, equipe, fases e marcos da implantação.', icon: GitBranch },
  { href: '/execution', name: 'Execução', description: 'Checklists, itens, respostas, evidências e colaboração.', icon: ListChecks },
  { href: '/delivery', name: 'Entrega técnica', description: 'Ambientes, componentes, versões e deployments.', icon: CheckCircle2 },
  { href: '/quality', name: 'Qualidade', description: 'Planos, casos, execuções de teste e defeitos.', icon: FlaskConical },
  { href: '/pilot', name: 'Piloto e operação', description: 'Pilotos, métricas de sucesso e incidentes.', icon: Gauge },
  { href: '/governance', name: 'Governança', description: 'Riscos, impedimentos, mudanças e aprovações.', icon: ShieldAlert },
  { href: '/content', name: 'Documentos', description: 'Arquivos versionados, upload seguro e acesso controlado.', icon: Files },
  { href: '/communication', name: 'Comunicação', description: 'Notificações in-app e e-mail com rastreabilidade.', icon: BellRing },
  { href: '/reports', name: 'Relatórios', description: 'Exportações assíncronas em CSV, XLSX e PDF.', icon: BarChart3 },
  { href: '/integrations', name: 'Integrações', description: 'Conexões, jobs, webhooks, inbox e dead letters.', icon: FileSearch },
];

export default function ModulesPage() {
  return (
    <AppShell eyebrow="Mapa operacional" title="Capacidades da plataforma" subtitle="Todos os módulos abaixo estão ligados a endpoints e tabelas reais do workspace.">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {modules.map(({ href, name, description, icon: Icon }) => (
          <Link key={href} href={href}>
            <Card hover className="h-full p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="grid size-10 place-items-center rounded-xl bg-[var(--brand)] text-white"><Icon size={19} /></div>
                <Badge tone="success" dot>Operacional</Badge>
              </div>
              <h2 className="mt-5 font-semibold tracking-[-0.02em]">{name}</h2>
              <p className="mt-2 text-xs leading-5 text-[var(--muted)]">{description}</p>
            </Card>
          </Link>
        ))}
      </div>
    </AppShell>
  );
}
