'use client';

import {
  Activity,
  BarChart3,
  Bell,
  Building2,
  CalendarDays,
  Check,
  ChevronDown,
  CircleHelp,
  ClipboardCheck,
  Command,
  FileClock,
  Files,
  FlaskConical,
  FolderKanban,
  Gauge,
  LayoutDashboard,
  ListChecks,
  LogOut,
  Menu,
  MessageSquareText,
  Moon,
  PlugZap,
  Rocket,
  Search,
  Settings,
  ShieldAlert,
  Sun,
  UserCog,
  UsersRound,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import type { ReactNode } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';

import { apiFetch, restoreSession } from '../lib/api';
import { initials } from '../lib/format';
import {
  clearSession,
  getTenant,
  getUser,
  setAccessToken,
  setTenant as persistTenant,
  type StoredTenant,
  type StoredUser,
} from '../lib/session';
import type { ApiEnvelope, ApiListEnvelope, Customer, Project, Task } from '../lib/types';
import { Logo } from './logo';
import { Badge, Button } from './ui';

const navigation = [
  {
    label: 'Workspace',
    items: [
      { href: '/dashboard', label: 'Visão geral', icon: LayoutDashboard },
      { href: '/projects', label: 'Projetos', icon: FolderKanban },
      { href: '/tasks', label: 'Tarefas', icon: ClipboardCheck },
      { href: '/customers', label: 'Clientes', icon: Building2 },
    ],
  },
  {
    label: 'Implantação',
    items: [
      { href: '/planning', label: 'Planejamento', icon: CalendarDays },
      { href: '/execution', label: 'Execução', icon: ListChecks },
      { href: '/delivery', label: 'Entrega técnica', icon: Rocket },
      { href: '/quality', label: 'Qualidade', icon: FlaskConical },
      { href: '/pilot', label: 'Piloto e operação', icon: Gauge },
    ],
  },
  {
    label: 'Gestão',
    items: [
      { href: '/governance', label: 'Governança', icon: ShieldAlert },
      { href: '/content', label: 'Documentos', icon: Files },
      { href: '/communication', label: 'Notificações', icon: MessageSquareText },
      { href: '/reports', label: 'Relatórios', icon: BarChart3 },
      { href: '/integrations', label: 'Integrações', icon: PlugZap },
    ],
  },
  {
    label: 'Administração',
    roles: ['ADMIN'],
    items: [
      { href: '/administration', label: 'Usuários e acessos', icon: UserCog },
      { href: '/audit', label: 'Auditoria', icon: FileClock },
    ],
  },
];

interface TenantOption extends StoredTenant {
  status: string;
}

interface NotificationItem {
  id: string;
  title: string;
  body: string;
  status: string;
  link?: string | null;
  createdAt?: string;
}

interface SearchResults {
  projects: Project[];
  tasks: Task[];
  customers: Customer[];
}

const emptySearchResults: SearchResults = { projects: [], tasks: [], customers: [] };

export function AppShell({ children, title, subtitle, eyebrow, actions }: {
  children: ReactNode;
  title: string;
  subtitle?: string | undefined;
  eyebrow?: string | undefined;
  actions?: ReactNode | undefined;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [tenantOpen, setTenantOpen] = useState(false);
  const [notificationOpen, setNotificationOpen] = useState(false);
  const [tenant, setTenant] = useState<StoredTenant | null>(null);
  const [tenants, setTenants] = useState<TenantOption[]>([]);
  const [user, setUser] = useState<StoredUser | null>(null);
  const [dark, setDark] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResults>(emptySearchResults);
  const [searching, setSearching] = useState(false);

  async function loadNotifications() {
    const response = await apiFetch<ApiListEnvelope<NotificationItem>>('/notifications?limit=10');
    setNotifications(response.data);
  }

  async function loadTenants() {
    const response = await apiFetch<ApiEnvelope<TenantOption[]>>('/auth/tenants');
    setTenants(response.data);
  }

  useEffect(() => {
    let active = true;

    void (async () => {
      const restored = await restoreSession();
      if (!active) return;
      if (!restored) {
        router.replace('/login');
        return;
      }

      setTenant(getTenant());
      setUser(getUser());
      const savedTheme = localStorage.getItem('implantahub.theme');
      const nextDark = savedTheme === 'dark' || (!savedTheme && window.matchMedia('(prefers-color-scheme: dark)').matches);
      setDark(nextDark);
      document.documentElement.dataset.theme = nextDark ? 'dark' : 'light';
      await loadNotifications().catch(() => undefined);
    })();

    return () => { active = false; };
  }, [router]);

  useEffect(() => {
    setMobileOpen(false);
    setProfileOpen(false);
    setTenantOpen(false);
    setNotificationOpen(false);
    setSearchTerm('');
    setSearchResults(emptySearchResults);
  }, [pathname]);

  useEffect(() => {
    function focusSearch(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        searchInputRef.current?.focus();
      }
    }
    window.addEventListener('keydown', focusSearch);
    return () => window.removeEventListener('keydown', focusSearch);
  }, []);

  useEffect(() => {
    const query = searchTerm.trim();
    if (query.length < 2) {
      setSearchResults(emptySearchResults);
      setSearching(false);
      return;
    }
    setSearching(true);
    const timer = window.setTimeout(() => {
      const encoded = encodeURIComponent(query);
      void Promise.all([
        apiFetch<ApiListEnvelope<Project>>(`/projects?search=${encoded}&limit=5`),
        apiFetch<ApiListEnvelope<Task>>(`/tasks?search=${encoded}&limit=5`),
        apiFetch<ApiListEnvelope<Customer>>(`/customers?search=${encoded}&limit=5`),
      ]).then(([projects, tasks, customers]) => {
        setSearchResults({ projects: projects.data, tasks: tasks.data, customers: customers.data });
      }).catch(() => {
        setSearchResults(emptySearchResults);
      }).finally(() => setSearching(false));
    }, 250);
    return () => window.clearTimeout(timer);
  }, [searchTerm]);

  const breadcrumbs = useMemo(() => {
    const parts = pathname.split('/').filter(Boolean);
    return parts.map((part, index) => ({
      label: part.replaceAll('-', ' '),
      href: `/${parts.slice(0, index + 1).join('/')}`,
    }));
  }, [pathname]);

  const visibleNavigation = useMemo(() => navigation.filter((group) => (
    !group.roles || (tenant?.role ? group.roles.includes(tenant.role) : false)
  )), [tenant?.role]);

  const unreadNotifications = notifications.filter((item) => item.status !== 'READ').length;
  const hasSearchResults = searchResults.projects.length + searchResults.tasks.length + searchResults.customers.length > 0;

  function toggleTheme() {
    const next = !dark;
    setDark(next);
    document.documentElement.dataset.theme = next ? 'dark' : 'light';
    localStorage.setItem('implantahub.theme', next ? 'dark' : 'light');
  }

  async function switchTenant(nextTenant: TenantOption) {
    if (nextTenant.id === tenant?.id) {
      setTenantOpen(false);
      return;
    }
    const selected = await apiFetch<ApiEnvelope<{ accessToken: string; tenant: StoredTenant }>>('/auth/select-tenant', {
      method: 'POST',
      body: JSON.stringify({ tenantId: nextTenant.id }),
    });
    setAccessToken(selected.data.accessToken);
    persistTenant(selected.data.tenant);
    setTenant(selected.data.tenant);
    setTenantOpen(false);
    router.replace(selected.data.tenant.role === 'CUSTOMER' ? '/portal' : '/dashboard');
    router.refresh();
  }

  async function markNotificationRead(notification: NotificationItem) {
    if (notification.status !== 'READ') {
      await apiFetch(`/notifications/${notification.id}/read`, { method: 'POST' });
      setNotifications((current) => current.map((item) => (
        item.id === notification.id ? { ...item, status: 'READ' } : item
      )));
    }
    if (notification.link) router.push(notification.link);
    setNotificationOpen(false);
  }

  async function markAllNotificationsRead() {
    await apiFetch('/notifications/read-all', { method: 'POST' });
    setNotifications((current) => current.map((item) => ({ ...item, status: 'READ' })));
  }

  async function logout() {
    try {
      await apiFetch('/auth/logout', { method: 'POST' });
    } finally {
      clearSession();
      router.replace('/login');
    }
  }

  const sidebar = (
    <div className="flex h-full flex-col">
      <div className="flex h-[72px] items-center justify-between px-5">
        <Logo />
        <Button className="lg:hidden" variant="ghost" size="icon" onClick={() => setMobileOpen(false)} aria-label="Fechar menu">
          <X size={19} />
        </Button>
      </div>

      <div className="relative px-4 pb-4">
        <button
          type="button"
          onClick={() => {
            setTenantOpen((value) => !value);
            if (!tenants.length) void loadTenants();
          }}
          className="flex w-full items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface-muted)] px-3 py-2.5 text-left transition hover:border-[var(--border-strong)]"
        >
          <div className="grid size-8 shrink-0 place-items-center rounded-lg bg-[var(--brand-soft)] text-xs font-bold text-[var(--brand)]">
            {initials(tenant?.name ?? 'ImplantaHub')}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-xs font-semibold text-[var(--text)]">{tenant?.name ?? 'ImplantaHub'}</div>
            <div className="mt-0.5 text-[10px] uppercase tracking-wider text-[var(--muted)]">{tenant?.role ?? 'Workspace'}</div>
          </div>
          <ChevronDown size={14} className="text-[var(--muted)]" />
        </button>
        {tenantOpen ? (
          <div className="animate-in absolute left-4 right-4 top-[calc(100%-10px)] z-50 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-1.5 shadow-[var(--shadow-lg)]">
            {tenants.length ? tenants.map((item) => (
              <button key={item.id} type="button" onClick={() => void switchTenant(item)} className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left hover:bg-[var(--surface-muted)]">
                <div className="grid size-7 place-items-center rounded-lg bg-[var(--brand-soft)] text-[10px] font-bold text-[var(--brand)]">{initials(item.name)}</div>
                <div className="min-w-0 flex-1"><div className="truncate text-xs font-medium">{item.name}</div><div className="text-[10px] text-[var(--muted)]">{item.role}</div></div>
                {item.id === tenant?.id ? <Check size={14} className="text-[var(--success)]" /> : null}
              </button>
            )) : <div className="px-3 py-3 text-xs text-[var(--muted)]">Carregando empresas...</div>}
          </div>
        ) : null}
      </div>

      <nav className="flex-1 overflow-y-auto px-3 pb-5">
        {visibleNavigation.map((group) => (
          <div key={group.label} className="mb-6">
            <div className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--muted-light)]">{group.label}</div>
            <div className="grid gap-1">
              {group.items.map(({ href, label, icon: Icon }) => {
                const active = pathname === href || (href !== '/dashboard' && pathname.startsWith(`${href}/`));
                return (
                  <Link key={href} href={href} className={`group flex min-h-10 items-center gap-3 rounded-[10px] px-3 text-[13px] font-medium transition ${active ? 'bg-[var(--brand-soft)] text-[var(--brand)]' : 'text-[var(--muted)] hover:bg-[var(--surface-muted)] hover:text-[var(--text)]'}`}>
                    <Icon size={17} strokeWidth={active ? 2.3 : 2} />
                    <span className="flex-1">{label}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="border-t border-[var(--border)] p-3">
        <Link href="/settings" className="flex min-h-10 items-center gap-3 rounded-[10px] px-3 text-[13px] font-medium text-[var(--muted)] hover:bg-[var(--surface-muted)] hover:text-[var(--text)]">
          <Settings size={17} /> Configurações
        </Link>
        <Link href="/help" className="flex min-h-10 items-center gap-3 rounded-[10px] px-3 text-[13px] font-medium text-[var(--muted)] hover:bg-[var(--surface-muted)] hover:text-[var(--text)]">
          <CircleHelp size={17} /> Central de ajuda
        </Link>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[var(--background)] lg:grid lg:grid-cols-[244px_minmax(0,1fr)]">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-[244px] border-r border-[var(--border)] bg-[var(--surface)] lg:block">{sidebar}</aside>

      {mobileOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-[#101828]/45 backdrop-blur-sm" onClick={() => setMobileOpen(false)} />
          <aside className="animate-in absolute inset-y-0 left-0 w-[280px] border-r border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow-lg)]">{sidebar}</aside>
        </div>
      ) : null}

      <div className="min-w-0 lg:col-start-2">
        <header className="sticky top-0 z-30 flex h-[72px] items-center border-b border-[var(--border)] bg-[color-mix(in_srgb,var(--surface)_92%,transparent)] px-4 backdrop-blur-xl sm:px-6 lg:px-8">
          <Button className="mr-3 lg:hidden" variant="ghost" size="icon" onClick={() => setMobileOpen(true)} aria-label="Abrir menu"><Menu size={20} /></Button>

          <div className="hidden max-w-md flex-1 items-center sm:flex">
            <div className="relative w-full max-w-[420px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted)]" size={16} />
              <input
                ref={searchInputRef}
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                className="h-10 w-full rounded-[10px] border border-transparent bg-[var(--surface-muted)] pl-9 pr-16 text-sm text-[var(--text)] outline-none transition placeholder:text-[var(--muted-light)] focus:border-[var(--border-strong)] focus:bg-[var(--surface)]"
                placeholder="Buscar projetos, tarefas e clientes..."
              />
              <div className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-1 rounded-md border border-[var(--border)] bg-[var(--surface)] px-1.5 py-1 text-[10px] font-medium text-[var(--muted)]"><Command size={11} /> K</div>
              {searchTerm.trim().length >= 2 ? (
                <div className="animate-in absolute left-0 right-0 top-[calc(100%+8px)] max-h-[420px] overflow-y-auto rounded-xl border border-[var(--border)] bg-[var(--surface)] p-2 shadow-[var(--shadow-lg)]">
                  {searching ? <div className="px-3 py-4 text-xs text-[var(--muted)]">Buscando...</div> : hasSearchResults ? (
                    <div className="grid gap-2">
                      {searchResults.projects.length ? <SearchGroup title="Projetos">{searchResults.projects.map((project) => <SearchLink key={project.id} href={`/projects/${project.id}`} title={`${project.code} — ${project.name}`} detail={project.status} />)}</SearchGroup> : null}
                      {searchResults.tasks.length ? <SearchGroup title="Tarefas">{searchResults.tasks.map((task) => <SearchLink key={task.id} href={`/projects/${task.projectId}`} title={task.title} detail={task.projectName ?? task.status} />)}</SearchGroup> : null}
                      {searchResults.customers.length ? <SearchGroup title="Clientes">{searchResults.customers.map((customer) => <SearchLink key={customer.id} href="/customers" title={`${customer.code} — ${customer.tradeName ?? customer.legalName}`} detail={customer.status} />)}</SearchGroup> : null}
                    </div>
                  ) : <div className="px-3 py-4 text-xs text-[var(--muted)]">Nenhum resultado encontrado.</div>}
                </div>
              ) : null}
            </div>
          </div>

          <div className="ml-auto flex items-center gap-1.5">
            <Button variant="ghost" size="icon" type="button" onClick={toggleTheme} aria-label="Alternar tema">{dark ? <Sun size={18} /> : <Moon size={18} />}</Button>
            <div className="relative">
              <Button className="relative" variant="ghost" size="icon" type="button" onClick={() => { setNotificationOpen((value) => !value); if (!notificationOpen) void loadNotifications(); }} aria-label="Notificações">
                <Bell size={18} />
                {unreadNotifications ? <span className="absolute right-1.5 top-1 min-w-4 rounded-full bg-[var(--danger)] px-1 text-[9px] font-bold leading-4 text-white">{Math.min(unreadNotifications, 9)}</span> : null}
              </Button>
              {notificationOpen ? (
                <div className="animate-in absolute right-0 top-[calc(100%+8px)] w-[min(360px,calc(100vw-24px))] rounded-xl border border-[var(--border)] bg-[var(--surface)] p-2 shadow-[var(--shadow-lg)]">
                  <div className="flex items-center justify-between px-2 py-2"><div className="text-sm font-semibold">Notificações</div>{unreadNotifications ? <button type="button" onClick={() => void markAllNotificationsRead()} className="text-[11px] font-semibold text-[var(--brand)]">Marcar todas como lidas</button> : null}</div>
                  <div className="max-h-96 overflow-y-auto">
                    {notifications.length ? notifications.map((notification) => (
                      <button key={notification.id} type="button" onClick={() => void markNotificationRead(notification)} className="flex w-full gap-3 rounded-lg px-3 py-3 text-left hover:bg-[var(--surface-muted)]">
                        <span className={`mt-1 size-2 shrink-0 rounded-full ${notification.status === 'READ' ? 'bg-[var(--border-strong)]' : 'bg-[var(--brand)]'}`} />
                        <span className="min-w-0"><span className="block truncate text-xs font-semibold">{notification.title}</span><span className="mt-1 block line-clamp-2 text-[11px] leading-4 text-[var(--muted)]">{notification.body}</span></span>
                      </button>
                    )) : <div className="px-3 py-8 text-center text-xs text-[var(--muted)]">Nenhuma notificação.</div>}
                  </div>
                  <Link href="/communication" className="mt-1 block rounded-lg border-t border-[var(--border)] px-3 py-2.5 text-center text-xs font-semibold text-[var(--brand)]">Abrir central de notificações</Link>
                </div>
              ) : null}
            </div>
            <div className="relative ml-1">
              <button type="button" onClick={() => setProfileOpen((value) => !value)} className="flex items-center gap-2 rounded-xl p-1.5 pr-2 transition hover:bg-[var(--surface-muted)]">
                <div className="grid size-8 place-items-center rounded-full bg-[linear-gradient(135deg,var(--brand),#8b5cf6)] text-[11px] font-bold text-white">{initials(user?.displayName ?? 'Admin')}</div>
                <div className="hidden min-w-0 text-left md:block"><div className="max-w-32 truncate text-xs font-semibold">{user?.displayName ?? 'Administrador'}</div><div className="mt-0.5 max-w-32 truncate text-[10px] text-[var(--muted)]">{user?.email ?? 'admin@implantahub.local'}</div></div>
                <ChevronDown size={14} className="hidden text-[var(--muted)] md:block" />
              </button>

              {profileOpen ? (
                <div className="animate-in absolute right-0 top-[calc(100%+8px)] w-56 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-1.5 shadow-[var(--shadow-lg)]">
                  <div className="border-b border-[var(--border)] px-3 py-2.5"><div className="truncate text-xs font-semibold">{user?.displayName}</div><div className="mt-1 truncate text-[11px] text-[var(--muted)]">{user?.email}</div></div>
                  <Link href="/settings" className="mt-1 flex items-center gap-2 rounded-lg px-3 py-2 text-xs text-[var(--muted)] hover:bg-[var(--surface-muted)] hover:text-[var(--text)]"><UsersRound size={15} /> Minha conta</Link>
                  <button type="button" onClick={logout} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs text-[var(--danger)] hover:bg-[var(--danger-soft)]"><LogOut size={15} /> Sair da plataforma</button>
                </div>
              ) : null}
            </div>
          </div>
        </header>

        <main className="px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          <div className="mx-auto max-w-[1500px]">
            <div className="mb-6">
              <div className="mb-2 flex items-center gap-2 text-[11px] font-medium capitalize text-[var(--muted)]">
                <Activity size={13} />
                {breadcrumbs.map((item, index) => <span key={item.href} className="flex items-center gap-2">{index > 0 ? <span className="text-[var(--border-strong)]">/</span> : null}<span>{item.label}</span></span>)}
              </div>
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div>{eyebrow ? <div className="mb-1.5 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--brand)]">{eyebrow}</div> : null}<h1 className="text-[26px] font-bold tracking-[-0.035em] text-[var(--text)] sm:text-[30px]">{title}</h1>{subtitle ? <p className="mt-1.5 max-w-3xl text-sm leading-6 text-[var(--muted)]">{subtitle}</p> : null}</div>
                {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
              </div>
            </div>
            <div className="animate-in">{children}</div>
          </div>
        </main>
      </div>
    </div>
  );
}

function SearchGroup({ title, children }: { title: string; children: ReactNode }) {
  return <div><div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--muted)]">{title}</div><div className="grid gap-1">{children}</div></div>;
}

function SearchLink({ href, title, detail }: { href: string; title: string; detail: string }) {
  return <Link href={href} className="flex items-center gap-3 rounded-lg px-3 py-2 hover:bg-[var(--surface-muted)]"><Search size={14} className="shrink-0 text-[var(--brand)]" /><span className="min-w-0 flex-1 truncate text-xs font-medium">{title}</span><Badge tone="neutral">{detail}</Badge></Link>;
}
