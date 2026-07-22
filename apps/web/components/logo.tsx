import { Boxes } from 'lucide-react';

export function Logo({ compact = false, inverse = false }: { compact?: boolean; inverse?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <div className="grid size-9 shrink-0 place-items-center rounded-xl bg-[var(--brand)] text-white shadow-[0_8px_20px_rgba(99,91,255,0.28)]">
        <Boxes size={19} strokeWidth={2.4} />
      </div>
      {!compact ? (
        <div className="leading-none">
          <div className={`text-[15px] font-extrabold tracking-[-0.02em] ${inverse ? 'text-white' : 'text-[var(--text)]'}`}>ImplantaHub</div>
          <div className={`mt-1 text-[10px] font-semibold uppercase tracking-[0.18em] ${inverse ? 'text-white/45' : 'text-[var(--muted)]'}`}>Delivery Cloud</div>
        </div>
      ) : null}
    </div>
  );
}
