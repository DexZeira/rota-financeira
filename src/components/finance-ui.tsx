import { useState, type ReactNode } from 'react';
import { PrivateValue } from './value-privacy';
import { BrandLogo } from './brand-logo';
import { ArrowUpRight, ChevronRight, Inbox, Ellipsis } from 'lucide-react';
import { Popover, PopoverTrigger, PopoverContent, PopoverTitle } from '@/components/ui/popover';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
export function PageHeader({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return <header className="page-header"><div><h1>{title}</h1>{description && <p>{description}</p>}</div>{action}</header>;
}
export function HeroMetric({ label, value, context, action }: { label: string; value: ReactNode; context?: ReactNode; action?: ReactNode }) {
  return <section className="financial-hero"><div><p className="hero-label">{label}</p><strong className="hero-value"><PrivateValue>{value}</PrivateValue></strong>{context && <div className="hero-context"><PrivateValue>{context}</PrivateValue></div>}</div>{action && <div className="hero-action">{action}</div>}</section>;
}
export function FinancialItem({ title, description, value, context, children, action }: { title: ReactNode; description?: ReactNode; value?: ReactNode; context?: ReactNode; children?: ReactNode; action?: ReactNode }) {
  return <article className="financial-item"><div className="financial-item-main"><div className="financial-item-name"><h3>{title}</h3>{description && <p>{description}</p>}</div><div className="financial-item-value"><strong><PrivateValue>{value}</PrivateValue></strong>{context && <small><PrivateValue>{context}</PrivateValue></small>}</div>{action}</div>{children}</article>;
}
export function Disclosure({ title, description, children, defaultOpen = false }: { title: string; description?: ReactNode; children: ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return <details className="disclosure" open={open} onToggle={(event) => setOpen(event.currentTarget.open)}><summary><span>{title}{description && <small>{description}</small>}</span><ChevronRight size={18} aria-hidden="true" /></summary><div className="disclosure-body">{children}</div></details>;
}
export function QuickAction({ label, children, onClick }: { label: string; children: ReactNode; onClick: () => void }) {
  return <button className="quick-action" onClick={onClick}><span>{children}</span>{label}<ArrowUpRight size={14} aria-hidden="true" /></button>;
}
export function EmptyState({ title, description, action, icon }: { title: string; description?: string; action?: ReactNode; icon?: ReactNode }) {
  return <Empty className="empty-state"><EmptyHeader><EmptyMedia variant="icon">{icon || <Inbox aria-hidden="true"/>}</EmptyMedia><EmptyTitle><h3>{title}</h3></EmptyTitle>{description && <EmptyDescription>{description}</EmptyDescription>}</EmptyHeader>{action && <EmptyContent>{action}</EmptyContent>}</Empty>;
}
export function PageSkeleton() {
  return <output className="page-skeleton" aria-label="Carregando página"><div className="skeleton-brand"><BrandLogo compact/><span>Preparando seu espaço</span></div><Skeleton/><Skeleton/><div><Skeleton/><Skeleton/><Skeleton/></div></output>;
}
export function Feedback({ tone = 'info', title, children, announce = false, id }: { tone?: 'info' | 'success' | 'warning' | 'error' | 'offline' | 'sync' | 'loading'; title?: string; children: ReactNode; announce?: boolean; id?: string }) {
  return <Alert id={id} className="interface-feedback" data-tone={tone} variant={tone === 'error' ? 'destructive' : 'default'} role={announce ? (tone === 'error' ? 'alert' : 'status') : undefined}>{title && <AlertTitle>{title}</AlertTitle>}<AlertDescription>{children}</AlertDescription></Alert>;
}
export function ActionsMenu({ label, children }: { label: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return <Popover open={open} onOpenChange={setOpen}><PopoverTrigger className="icon-button" aria-label={label}><Ellipsis size={20} aria-hidden="true"/></PopoverTrigger><PopoverContent align="end" className="actions-popover" onClick={(event) => { if ((event.target as HTMLElement).closest('button')) setOpen(false); }}><PopoverTitle className="sr-only">{label}</PopoverTitle><div className="row-actions">{children}</div></PopoverContent></Popover>;
}
