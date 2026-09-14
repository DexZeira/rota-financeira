import { useState, type ReactNode } from 'react';
import { ArrowUpRight, ChevronRight, Inbox, Ellipsis } from 'lucide-react';
import { Popover, PopoverTrigger, PopoverContent, PopoverTitle } from '@/components/ui/popover';
export function PageHeader({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return <header className="page-header"><div><h1>{title}</h1>{description && <p>{description}</p>}</div>{action}</header>;
}
export function HeroMetric({ label, value, context, action }: { label: string; value: ReactNode; context?: ReactNode; action?: ReactNode }) {
  return <section className="financial-hero"><div><p className="hero-label">{label}</p><strong className="hero-value">{value}</strong>{context && <div className="hero-context">{context}</div>}</div>{action && <div className="hero-action">{action}</div>}</section>;
}
export function FinancialItem({ title, description, value, context, children, action }: { title: ReactNode; description?: ReactNode; value?: ReactNode; context?: ReactNode; children?: ReactNode; action?: ReactNode }) {
  return <article className="financial-item"><div className="financial-item-main"><div className="financial-item-name"><h3>{title}</h3>{description && <p>{description}</p>}</div><div className="financial-item-value"><strong>{value}</strong>{context && <small>{context}</small>}</div>{action}</div>{children}</article>;
}
export function Disclosure({ title, description, children }: { title: string; description?: ReactNode; children: ReactNode }) {
  return <details className="disclosure"><summary><span>{title}{description && <small>{description}</small>}</span><ChevronRight size={18} aria-hidden="true" /></summary><div className="disclosure-body">{children}</div></details>;
}
export function QuickAction({ label, children, onClick }: { label: string; children: ReactNode; onClick: () => void }) {
  return <button className="quick-action" onClick={onClick}><span>{children}</span>{label}<ArrowUpRight size={14} aria-hidden="true" /></button>;
}
export function EmptyState({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return <div className="empty-state"><Inbox size={28} aria-hidden="true"/><h3>{title}</h3>{description && <p>{description}</p>}{action}</div>;
}
export function PageSkeleton() {
  return <output className="page-skeleton" aria-label="Carregando página"><span className="sr-only">Carregando página</span><i/><i/><div><i/><i/><i/></div></output>;
}
export function ActionsMenu({ label, children }: { label: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return <Popover open={open} onOpenChange={setOpen}><PopoverTrigger className="icon-button" aria-label={label}><Ellipsis size={20}/></PopoverTrigger><PopoverContent align="end" className="actions-popover" onClick={(event) => { if ((event.target as HTMLElement).closest('button')) setOpen(false); }}><PopoverTitle className="sr-only">{label}</PopoverTitle><div className="row-actions">{children}</div></PopoverContent></Popover>;
}
