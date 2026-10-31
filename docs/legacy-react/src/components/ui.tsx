import { AlertCircle, ArrowLeft, ChevronLeft, ChevronRight, Inbox, Loader2, X, Zap } from 'lucide-react';
import {
  createContext, useCallback, useContext, useEffect, useId, useRef, useState,
  type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes,
} from 'react';
import { Link } from 'react-router';
import { label as labelOf } from '@brightloop/shared';
import { lastTiming, onTiming } from '../lib/api';
import type { useForm } from '../lib/form';

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');

// ---------- Buttons ----------

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'accent';
const variants: Record<Variant, string> = {
  primary: 'bg-brand-600 text-white hover:bg-brand-700 shadow-card',
  accent: 'bg-accent-400 text-brand-900 hover:brightness-95 shadow-card',
  secondary: 'bg-surface text-ink border border-line hover:bg-canvas shadow-card',
  ghost: 'text-muted hover:text-ink hover:bg-brand-50',
  danger: 'bg-surface text-bad-600 border border-line hover:bg-bad-50',
};

export function Button({ variant = 'primary', size = 'md', loading, icon, children, className, disabled, ...rest }:
  ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: 'sm' | 'md'; loading?: boolean; icon?: ReactNode }) {
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      className={cx(
        'inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap',
        size === 'sm' ? 'h-8 px-3 text-[13px]' : 'h-10 px-4 text-sm',
        variants[variant], className,
      )}
    >
      {loading ? <Loader2 className="size-4 animate-spin" aria-hidden /> : icon}
      {children}
    </button>
  );
}

export function LinkButton({ to, variant = 'secondary', size = 'md', icon, children }: { to: string; variant?: Variant; size?: 'sm' | 'md'; icon?: ReactNode; children: ReactNode }) {
  return (
    <Link to={to} className={cx('inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors whitespace-nowrap', size === 'sm' ? 'h-8 px-3 text-[13px]' : 'h-10 px-4 text-sm', variants[variant])}>
      {icon}{children}
    </Link>
  );
}

// ---------- Inputs ----------

const control = 'w-full rounded-lg border bg-surface px-3 text-sm text-ink placeholder:text-muted/70 transition-colors focus:outline-none focus:ring-2 focus:ring-brand-200 focus:border-brand-400 disabled:bg-canvas disabled:text-muted';
const invalidCls = 'border-bad-600 focus:ring-bad-50 focus:border-bad-600';

export const Input = ({ invalid, className, ...p }: InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }) =>
  <input {...p} aria-invalid={invalid || undefined} className={cx(control, 'h-10', invalid ? invalidCls : 'border-line', className)} />;

export const Select = ({ invalid, className, children, ...p }: SelectHTMLAttributes<HTMLSelectElement> & { invalid?: boolean }) =>
  <select {...p} aria-invalid={invalid || undefined} className={cx(control, 'h-10 pr-8', invalid ? invalidCls : 'border-line', className)}>{children}</select>;

export const Textarea = ({ invalid, className, ...p }: TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }) =>
  <textarea {...p} aria-invalid={invalid || undefined} className={cx(control, 'py-2 min-h-20', invalid ? invalidCls : 'border-line', className)} />;

export function Field({ label, error, hint, required, htmlFor, children, className }: { label?: string; error?: string; hint?: ReactNode; required?: boolean; htmlFor?: string; children: ReactNode; className?: string }) {
  return (
    <div className={cx('space-y-1.5', className)}>
      {label && <label htmlFor={htmlFor} className="block text-[13px] font-medium text-ink">{label}{required && <span className="text-bad-600"> *</span>}</label>}
      {children}
      {error ? <p role="alert" className="flex items-center gap-1 text-[12.5px] text-bad-600"><AlertCircle className="size-3.5 shrink-0" />{error}</p>
        : hint ? <p className="text-[12.5px] text-muted">{hint}</p> : null}
    </div>
  );
}

type Form = ReturnType<typeof useForm<Record<string, unknown>>>;
type Bound = { f: Form; name: string; label?: string; hint?: ReactNode; required?: boolean; className?: string };

export function FInput({ f, name, label, hint, required, className, ...p }: Bound & InputHTMLAttributes<HTMLInputElement>) {
  const id = useId();
  return (
    <Field label={label} error={f.errors[name]} hint={hint} required={required} htmlFor={id} className={className}>
      <Input id={id} name={name} value={String(f.values[name] ?? '')} onChange={(e) => f.set(name, e.target.value)} onBlur={() => f.blur(name)} invalid={!!f.errors[name]} {...p} />
    </Field>
  );
}

export function FSelect({ f, name, label, hint, required, className, options, placeholder }: Bound & { options: { value: string; label: string }[]; placeholder?: string }) {
  const id = useId();
  return (
    <Field label={label} error={f.errors[name]} hint={hint} required={required} htmlFor={id} className={className}>
      <Select id={id} value={String(f.values[name] ?? '')} onChange={(e) => f.set(name, e.target.value)} onBlur={() => f.blur(name)} invalid={!!f.errors[name]}>
        {placeholder !== undefined && <option value="">{placeholder}</option>}
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </Select>
    </Field>
  );
}

export function FTextarea({ f, name, label, hint, className, ...p }: Bound & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const id = useId();
  return (
    <Field label={label} error={f.errors[name]} hint={hint} htmlFor={id} className={className}>
      <Textarea id={id} value={String(f.values[name] ?? '')} onChange={(e) => f.set(name, e.target.value)} onBlur={() => f.blur(name)} invalid={!!f.errors[name]} {...p} />
    </Field>
  );
}

export function Toggle({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) {
  const id = useId();
  return (
    <div className="flex items-start gap-3">
      <button id={id} type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)}
        className={cx('relative mt-0.5 h-5 w-9 shrink-0 rounded-full transition-colors', checked ? 'bg-brand-600' : 'bg-line')}>
        <span className={cx('absolute top-0.5 size-4 rounded-full bg-white shadow transition-transform', checked ? 'translate-x-4.5' : 'translate-x-0.5')} />
      </button>
      <label htmlFor={id} className="cursor-pointer text-sm">
        <span className="font-medium">{label}</span>
        {hint && <span className="block text-[12.5px] text-muted">{hint}</span>}
      </label>
    </div>
  );
}

export const FToggle = ({ f, name, label, hint }: Bound & { label: string }) =>
  <Toggle checked={Boolean(f.values[name])} onChange={(v) => f.set(name, v)} label={label} hint={typeof hint === 'string' ? hint : undefined} />;

// ---------- Layout bits ----------

export function Card({ children, className, title, actions, pad = true }: { children: ReactNode; className?: string; title?: ReactNode; actions?: ReactNode; pad?: boolean }) {
  return (
    <section className={cx('rounded-xl border border-line bg-surface shadow-card', className)}>
      {(title || actions) && (
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3 sm:px-5">
          <h2 className="text-[15px] font-semibold">{title}</h2>
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className={pad ? 'p-4 sm:p-5' : ''}>{children}</div>
    </section>
  );
}

export function PageHeader({ title, subtitle, actions, back }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; back?: { to: string; label: string } }) {
  return (
    <div className="mb-5 space-y-2">
      {back && <Link to={back.to} className="inline-flex items-center gap-1 text-[13px] text-muted hover:text-brand-700"><ArrowLeft className="size-3.5" />{back.label}</Link>}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}

const tones = {
  gray: 'bg-canvas text-muted ring-line',
  brand: 'bg-brand-50 text-brand-700 ring-brand-200',
  green: 'bg-ok-50 text-ok-600 ring-ok-600/20',
  amber: 'bg-warn-50 text-warn-600 ring-warn-600/20',
  red: 'bg-bad-50 text-bad-600 ring-bad-600/20',
  blue: 'bg-info-50 text-info-600 ring-info-600/20',
} as const;
export type Tone = keyof typeof tones;

export const Badge = ({ tone = 'gray', children, className }: { tone?: Tone; children: ReactNode; className?: string }) =>
  <span className={cx('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[12px] font-medium ring-1 ring-inset whitespace-nowrap', tones[tone], className)}>{children}</span>;

const STATUS_TONE: Record<string, Tone> = {
  DRAFT: 'gray', QUOTATION: 'blue', CONFIRMED: 'brand', ACTIVE: 'green', PAUSED: 'amber', CLOSED: 'gray',
  PAID: 'green', CANCELLED: 'gray', OVERDUE: 'red',
};
export function StatusBadge({ status, overdue }: { status: string; overdue?: boolean }) {
  const s = overdue ? 'OVERDUE' : status;
  return <Badge tone={STATUS_TONE[s] ?? 'gray'}><span className="size-1.5 rounded-full bg-current" aria-hidden />{labelOf(s)}</Badge>;
}

export function Tabs({ tabs, value, onChange }: { tabs: { key: string; label: string; count?: number }[]; value: string; onChange: (k: string) => void }) {
  return (
    <div role="tablist" className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1">
      {tabs.map((t) => (
        <button key={t.key} role="tab" aria-selected={value === t.key} onClick={() => onChange(t.key)}
          className={cx('inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg px-3 text-[13px] font-medium transition-colors',
            value === t.key ? 'bg-brand-600 text-white' : 'text-muted hover:bg-brand-50 hover:text-ink')}>
          {t.label}
          {t.count != null && <span className={cx('num rounded-full px-1.5 text-[11px]', value === t.key ? 'bg-white/20' : 'bg-canvas')}>{t.count.toLocaleString('en-IN')}</span>}
        </button>
      ))}
    </div>
  );
}

export function Pagination({ page, pageSize, total, onPage }: { page: number; pageSize: number; total: number; onPage: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const from = total ? (page - 1) * pageSize + 1 : 0;
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line px-4 py-3 text-[13px] text-muted">
      <span className="num">{from.toLocaleString('en-IN')}–{Math.min(page * pageSize, total).toLocaleString('en-IN')} of {total.toLocaleString('en-IN')}</span>
      <div className="flex items-center gap-3">
        <SpeedBadge />
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="Previous page"><ChevronLeft className="size-4" /></Button>
          <span className="num px-1">{page} / {pages}</span>
          <Button variant="ghost" size="sm" disabled={page >= pages} onClick={() => onPage(page + 1)} aria-label="Next page"><ChevronRight className="size-4" /></Button>
        </div>
      </div>
    </div>
  );
}

/** Live proof of the "< 2 seconds" requirement: the server-side time of the last query. */
export function SpeedBadge() {
  const [ms, setMs] = useState(lastTiming());
  useEffect(() => onTiming(setMs), []);
  if (ms == null) return null;
  return (
    <span title="Server time for the last request" className={cx('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11.5px] font-medium num', ms < 2000 ? 'bg-ok-50 text-ok-600' : 'bg-bad-50 text-bad-600')}>
      <Zap className="size-3" aria-hidden />{ms < 10 ? ms.toFixed(1) : Math.round(ms)} ms
    </span>
  );
}

export function Empty({ title, hint, action, icon }: { title: string; hint?: ReactNode; action?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
      <div className="mb-3 grid size-11 place-items-center rounded-full bg-brand-50 text-brand-600">{icon ?? <Inbox className="size-5" />}</div>
      <p className="font-medium">{title}</p>
      {hint && <p className="mt-1 max-w-sm text-sm text-muted">{hint}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export const Spinner = ({ className }: { className?: string }) => <Loader2 className={cx('size-5 animate-spin text-brand-500', className)} aria-label="Loading" />;

export function Loading({ rows = 6 }: { rows?: number }) {
  return (
    <div className="space-y-2 p-4" aria-busy>
      {Array.from({ length: rows }, (_, i) => <div key={i} className="h-9 animate-pulse rounded-lg bg-canvas" />)}
    </div>
  );
}

export function ErrorNote({ error, className }: { error: unknown; className?: string }) {
  if (!error) return null;
  const msg = error instanceof Error ? error.message : String(error);
  return <div role="alert" className={cx('flex items-start gap-2 rounded-lg border border-bad-600/20 bg-bad-50 px-3 py-2.5 text-sm text-bad-600', className)}><AlertCircle className="mt-0.5 size-4 shrink-0" />{msg}</div>;
}

export function KV({ items }: { items: [ReactNode, ReactNode][] }) {
  return (
    <dl className="grid grid-cols-[minmax(0,auto)_1fr] gap-x-4 gap-y-2.5 text-sm">
      {items.map(([k, v], i) => (
        <div key={i} className="contents">
          <dt className="text-muted">{k}</dt>
          <dd className="min-w-0 text-right font-medium break-words">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

// ---------- Modal ----------

export function Modal({ open, onClose, title, children, footer, wide }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog ref={ref} onClose={onClose} onClick={(e) => { if (e.target === ref.current) onClose(); }}
      className={cx('m-auto w-[calc(100%-2rem)] rounded-2xl border border-line bg-surface p-0 text-ink shadow-pop backdrop:bg-ink/40 backdrop:backdrop-blur-[2px]', wide ? 'max-w-3xl' : 'max-w-lg')}>
      {open && (
        <div className="flex max-h-[85vh] flex-col">
          <header className="flex items-center justify-between border-b border-line px-5 py-3.5">
            <h2 className="text-base font-semibold">{title}</h2>
            <button onClick={onClose} className="rounded-lg p-1 text-muted hover:bg-canvas hover:text-ink" aria-label="Close"><X className="size-4" /></button>
          </header>
          <div className="overflow-y-auto px-5 py-4">{children}</div>
          {footer && <footer className="flex flex-wrap justify-end gap-2 border-t border-line bg-canvas/60 px-5 py-3">{footer}</footer>}
        </div>
      )}
    </dialog>
  );
}

// ---------- Toasts ----------

type Toast = { id: number; tone: 'ok' | 'bad' | 'info'; text: ReactNode };
const ToastCtx = createContext<(text: ReactNode, tone?: Toast['tone']) => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const push = useCallback((text: ReactNode, tone: Toast['tone'] = 'ok') => {
    const id = Date.now() + Math.random();
    setItems((t) => [...t.slice(-3), { id, tone, text }]);
    setTimeout(() => setItems((t) => t.filter((x) => x.id !== id)), tone === 'bad' ? 7000 : 4500);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="no-print pointer-events-none fixed inset-x-4 bottom-4 z-50 flex flex-col items-end gap-2 sm:left-auto" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className={cx('pointer-events-auto max-w-sm rounded-xl border px-4 py-3 text-sm shadow-pop',
            t.tone === 'ok' ? 'border-ok-600/20 bg-surface' : t.tone === 'bad' ? 'border-bad-600/30 bg-bad-50 text-bad-600' : 'border-line bg-surface')}>
            {t.text}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
export const useToast = () => useContext(ToastCtx);

// ---------- Tables ----------

export const Th = ({ children, className }: { children?: ReactNode; className?: string }) =>
  <th scope="col" className={cx('whitespace-nowrap px-4 py-2.5 text-left text-[12px] font-semibold uppercase tracking-wide text-muted', className)}>{children}</th>;
export const Td = ({ children, className }: { children?: ReactNode; className?: string }) =>
  <td className={cx('px-4 py-3 align-middle', className)}>{children}</td>;

export function Table({ head, children }: { head: ReactNode; children: ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-sm">
        <thead className="border-b border-line bg-canvas/60"><tr>{head}</tr></thead>
        <tbody className="divide-y divide-line">{children}</tbody>
      </table>
    </div>
  );
}
