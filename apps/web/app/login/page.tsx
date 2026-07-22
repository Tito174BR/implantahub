'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowRight, CheckCircle2, Eye, EyeOff, LockKeyhole, ShieldCheck, Sparkles } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { Logo } from '../../components/logo';
import { Button, ErrorBox, Field } from '../../components/ui';
import { apiFetch } from '../../lib/api';
import { clearSession, setAccessToken, setTenant, setUser } from '../../lib/session';

const formSchema = z.object({
  email: z.string().email('Informe um e-mail válido.'),
  password: z.string().min(1, 'Informe a senha.'),
});

type FormData = z.infer<typeof formSchema>;

interface LoginResponse {
  data: {
    accessToken: string;
    user: { id: string; displayName: string; email: string };
  };
}

interface TenantResponse {
  data: Array<{ id: string; name: string; slug: string; status: string; role: string }>;
}

interface SelectTenantResponse {
  data: {
    accessToken: string;
    tenant: { id: string; name: string; slug: string; role: string };
  };
}

const features = [
  'Projetos, clientes e tarefas em um único workspace',
  'Auditoria e rastreabilidade de ponta a ponta',
  'Multiempresa, permissões e integrações preparadas',
];

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      email: 'admin@implantahub.local',
      password: 'Admin@123456',
    },
  });

  async function submit(data: FormData) {
    setError(null);
    clearSession();
    try {
      const login = await apiFetch<LoginResponse>('/auth/login', {
        method: 'POST',
        body: JSON.stringify(data),
      });
      setAccessToken(login.data.accessToken);
      setUser(login.data.user);

      const tenants = await apiFetch<TenantResponse>('/auth/tenants');
      const tenant = tenants.data[0];
      if (!tenant) throw new Error('Nenhuma empresa disponível para este usuário.');

      const selected = await apiFetch<SelectTenantResponse>('/auth/select-tenant', {
        method: 'POST',
        body: JSON.stringify({ tenantId: tenant.id }),
      });

      setAccessToken(selected.data.accessToken);
      setTenant(selected.data.tenant);
      router.replace(selected.data.tenant.role === 'CUSTOMER' ? '/portal' : '/dashboard');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível entrar.');
    }
  }

  return (
    <main className="min-h-screen bg-[#0a0d16] text-white lg:grid lg:grid-cols-[minmax(0,1.05fr)_minmax(500px,0.95fr)]">
      <section className="relative hidden min-h-screen overflow-hidden border-r border-white/10 p-12 lg:flex lg:flex-col">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_15%_15%,rgba(99,91,255,0.34),transparent_34%),radial-gradient(circle_at_90%_80%,rgba(45,212,191,0.16),transparent_34%)]" />
        <div className="grid-pattern absolute inset-0 opacity-[0.08]" />

        <div className="relative z-10">
          <Logo inverse />
        </div>

        <div className="relative z-10 my-auto max-w-2xl py-16">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.06] px-3 py-1.5 text-xs font-medium text-white/80">
            <Sparkles size={14} className="text-[#a9a4ff]" />
            Enterprise implementation workspace
          </div>
          <h1 className="text-balance text-5xl font-bold leading-[1.05] tracking-[-0.055em] xl:text-[64px]">
            Implantações complexas, sob controle.
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-8 text-white/55">
            Centralize planejamento, execução, homologação e governança em uma plataforma criada para times que precisam entregar com previsibilidade.
          </p>

          <div className="mt-10 grid gap-4">
            {features.map((feature) => (
              <div key={feature} className="flex items-center gap-3 text-sm text-white/72">
                <CheckCircle2 size={18} className="text-[#8b83ff]" />
                {feature}
              </div>
            ))}
          </div>
        </div>

        <div className="relative z-10 grid grid-cols-3 gap-4">
          <div className="rounded-2xl border border-white/10 bg-white/[0.045] p-4 backdrop-blur-sm">
            <div className="text-2xl font-semibold">360°</div>
            <div className="mt-1 text-xs text-white/45">Visão operacional</div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/[0.045] p-4 backdrop-blur-sm">
            <div className="text-2xl font-semibold">100%</div>
            <div className="mt-1 text-xs text-white/45">Rastreabilidade</div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/[0.045] p-4 backdrop-blur-sm">
            <div className="text-2xl font-semibold">SaaS</div>
            <div className="mt-1 text-xs text-white/45">Multiempresa</div>
          </div>
        </div>
      </section>

      <section className="flex min-h-screen items-center justify-center bg-[var(--surface)] px-5 py-10 text-[var(--text)] sm:px-10">
        <div className="w-full max-w-[430px]">
          <div className="mb-10 lg:hidden"><Logo /></div>

          <div className="mb-8">
            <div className="mb-3 inline-flex items-center gap-2 text-xs font-semibold text-[var(--brand)]">
              <ShieldCheck size={15} /> Ambiente seguro
            </div>
            <h2 className="text-3xl font-bold tracking-[-0.04em]">Bem-vindo de volta</h2>
            <p className="mt-2 text-sm leading-6 text-[var(--muted)]">Entre no seu workspace para continuar acompanhando as implantações.</p>
          </div>

          <form className="grid gap-5" onSubmit={form.handleSubmit(submit)}>
            <Field label="E-mail corporativo" error={form.formState.errors.email?.message}>
              <input className="input-shell" type="email" autoComplete="email" placeholder="voce@empresa.com" {...form.register('email')} />
            </Field>

            <Field label="Senha" error={form.formState.errors.password?.message}>
              <div className="relative">
                <LockKeyhole className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted)]" size={16} />
                <input className="input-shell pl-9 pr-10" type={showPassword ? 'text' : 'password'} autoComplete="current-password" {...form.register('password')} />
                <button className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--muted)] hover:text-[var(--text)]" type="button" onClick={() => setShowPassword((value) => !value)} aria-label="Exibir senha">
                  {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                </button>
              </div>
            </Field>

            <div className="text-xs leading-5 text-[var(--muted)]">
              A sessão usa token de curta duração e renovação protegida por cookie HttpOnly.
            </div>

            {error ? <ErrorBox message={error} /> : null}

            <Button className="w-full" type="submit" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting ? 'Autenticando...' : 'Entrar no workspace'}
              <ArrowRight size={17} />
            </Button>
          </form>

          <div className="mt-7 rounded-xl border border-[var(--border)] bg-[var(--surface-muted)] p-4">
            <div className="text-xs font-semibold text-[var(--text-soft)]">Acesso local</div>
            <div className="mt-2 grid gap-1 font-mono text-[11px] text-[var(--muted)]">
              <span>admin@implantahub.local</span>
              <span>Admin@123456</span>
            </div>
          </div>

          <p className="mt-8 text-center text-[11px] leading-5 text-[var(--muted)]">
            Ao continuar, você concorda com os Termos de Uso e a Política de Privacidade da plataforma.
          </p>
        </div>
      </section>
    </main>
  );
}
