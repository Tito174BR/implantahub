'use client';

import { AlertCircle, CheckCircle2, ChevronDown, LoaderCircle, Search, X } from 'lucide-react';
import type { ButtonHTMLAttributes, HTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from 'react';
import { forwardRef, useEffect } from 'react';

import type { Tone } from '../lib/status';

const toneClasses: Record<Tone, string> = {
  neutral: 'bg-[var(--surface-muted)] text-[var(--text-soft)] border-[var(--border)]',
  brand: 'bg-[var(--brand-soft)] text-[var(--brand)] border-transparent',
  success: 'bg-[var(--success-soft)] text-[var(--success)] border-transparent',
  warning: 'bg-[var(--warning-soft)] text-[var(--warning)] border-transparent',
  danger: 'bg-[var(--danger-soft)] text-[var(--danger)] border-transparent',
  info: 'bg-[var(--info-soft)] text-[var(--info)] border-transparent',
};

export function Card({ children, className = '', hover = false, ...props }: HTMLAttributes<HTMLDivElement> & {
  hover?: boolean | undefined;
}) {
  return <div className={`saas-card ${hover ? 'saas-card-hover' : ''} ${className}`} {...props}>{children}</div>;
}

export function Badge({ children, tone = 'neutral', dot = false, className = '' }: {
  children: ReactNode;
  tone?: Tone | undefined;
  dot?: boolean | undefined;
  className?: string | undefined;
}) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold leading-none ${toneClasses[tone]} ${className}`}>
      {dot ? <span className="size-1.5 rounded-full bg-current" /> : null}
      {children}
    </span>
  );
}

export function Button({ className = '', variant = 'primary', size = 'md', children, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | undefined;
  size?: 'sm' | 'md' | 'icon' | undefined;
}) {
  const variants = {
    primary: 'border-transparent bg-[var(--brand)] text-white hover:bg-[var(--brand-hover)] shadow-sm',
    secondary: 'border-[var(--border-strong)] bg-[var(--surface)] text-[var(--text-soft)] hover:bg-[var(--surface-muted)] shadow-xs',
    ghost: 'border-transparent bg-transparent text-[var(--muted)] hover:bg-[var(--surface-muted)] hover:text-[var(--text)]',
    danger: 'border-transparent bg-[var(--danger)] text-white hover:opacity-90 shadow-sm',
  };
  const sizes = {
    sm: 'min-h-8 px-3 text-xs rounded-lg',
    md: 'min-h-10 px-4 text-sm rounded-[10px]',
    icon: 'size-9 p-0 rounded-[10px]',
  };
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 border font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${variants[variant]} ${sizes[size]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

export function SearchInput({ className = '', ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className={`relative ${className}`}>
      <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted)]" size={16} />
      <input className="input-shell pl-9" {...props} />
    </div>
  );
}

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Select(
  { className = '', children, ...props },
  ref,
) {
  return (
    <div className={`relative ${className}`}>
      <select ref={ref} className="input-shell appearance-none pr-9" {...props}>{children}</select>
      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[var(--muted)]" size={15} />
    </div>
  );
});

export function Field({ label, error, hint, children }: {
  label: string;
  error?: string | undefined;
  hint?: string | undefined;
  children: ReactNode;
}) {
  return (
    <label className="grid gap-1.5 text-sm font-medium text-[var(--text-soft)]">
      <span>{label}</span>
      {children}
      {error ? <span className="text-xs text-[var(--danger)]">{error}</span> : null}
      {!error && hint ? <span className="text-xs text-[var(--muted)]">{hint}</span> : null}
    </label>
  );
}

export function StatCard({ label, value, detail, icon, tone = 'brand', trend }: {
  label: string;
  value: number | string;
  detail?: string | undefined;
  icon?: ReactNode | undefined;
  tone?: Tone | undefined;
  trend?: string | undefined;
}) {
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-sm font-medium text-[var(--muted)]">{label}</div>
          <div className="mt-2 text-[30px] font-bold tracking-[-0.04em] text-[var(--text)]">{value}</div>
        </div>
        {icon ? <div className={`grid size-10 place-items-center rounded-xl ${toneClasses[tone]}`}>{icon}</div> : null}
      </div>
      <div className="mt-3 flex items-center gap-2 text-xs text-[var(--muted)]">
        {trend ? <span className="font-semibold text-[var(--success)]">{trend}</span> : null}
        {detail ? <span>{detail}</span> : null}
      </div>
    </Card>
  );
}

export function ProgressBar({ value, className = '' }: { value: number; className?: string }) {
  return (
    <div className={`h-1.5 overflow-hidden rounded-full bg-[var(--surface-muted)] ${className}`}>
      <div
        className="h-full rounded-full bg-[var(--brand)] transition-[width] duration-500"
        style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
      />
    </div>
  );
}

export function EmptyState({ icon, title, description, action }: {
  icon?: ReactNode;
  title: string;
  description?: string | undefined;
  action?: ReactNode | undefined;
}) {
  return (
    <div className="grid min-h-64 place-items-center rounded-2xl border border-dashed border-[var(--border-strong)] bg-[var(--surface-muted)]/40 p-8 text-center">
      <div>
        {icon ? <div className="mx-auto grid size-12 place-items-center rounded-2xl border border-[var(--border)] bg-[var(--surface)] text-[var(--muted)] shadow-sm">{icon}</div> : null}
        <h3 className="mt-4 font-semibold text-[var(--text)]">{title}</h3>
        {description ? <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-[var(--muted)]">{description}</p> : null}
        {action ? <div className="mt-5">{action}</div> : null}
      </div>
    </div>
  );
}

export function Loading({ label = 'Carregando dados...' }: { label?: string }) {
  return (
    <div className="flex min-h-32 items-center justify-center gap-2 text-sm text-[var(--muted)]">
      <LoaderCircle className="animate-spin" size={18} />
      {label}
    </div>
  );
}

export function SkeletonCard() {
  return (
    <Card className="p-5">
      <div className="skeleton h-4 w-28 rounded" />
      <div className="skeleton mt-4 h-9 w-20 rounded" />
      <div className="skeleton mt-4 h-3 w-40 rounded" />
    </Card>
  );
}

export function ErrorBox({ message }: { message: string }) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-[color-mix(in_srgb,var(--danger)_25%,var(--border))] bg-[var(--danger-soft)] p-4 text-sm text-[var(--danger)]">
      <AlertCircle className="mt-0.5 shrink-0" size={18} />
      <span>{message}</span>
    </div>
  );
}

export function SuccessBox({ message }: { message: string }) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-[color-mix(in_srgb,var(--success)_25%,var(--border))] bg-[var(--success-soft)] p-4 text-sm text-[var(--success)]">
      <CheckCircle2 className="mt-0.5 shrink-0" size={18} />
      <span>{message}</span>
    </div>
  );
}

export function Modal({ open, onClose, title, description, children, width = 'max-w-xl' }: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string | undefined;
  children: ReactNode;
  width?: string | undefined;
}) {
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const close = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', close);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener('keydown', close);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-[#101828]/45 p-0 backdrop-blur-[2px] sm:items-center sm:p-6" onMouseDown={onClose}>
      <div
        className={`animate-in max-h-[92vh] w-full overflow-hidden rounded-t-2xl border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow-lg)] sm:rounded-2xl ${width}`}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-[var(--border)] px-6 py-5">
          <div>
            <h2 className="text-lg font-semibold tracking-[-0.02em]">{title}</h2>
            {description ? <p className="mt-1 text-sm text-[var(--muted)]">{description}</p> : null}
          </div>
          <Button variant="ghost" size="icon" type="button" aria-label="Fechar" onClick={onClose}>
            <X size={18} />
          </Button>
        </div>
        <div className="max-h-[calc(92vh-82px)] overflow-y-auto p-6">{children}</div>
      </div>
    </div>
  );
}

export function SectionTitle({ title, description, action }: {
  title: string;
  description?: string | undefined;
  action?: ReactNode | undefined;
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h2 className="font-semibold tracking-[-0.01em] text-[var(--text)]">{title}</h2>
        {description ? <p className="mt-1 text-sm text-[var(--muted)]">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}
