import { useEffect, useRef, type ReactNode } from 'react';

export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  const closeRef = useRef<HTMLButtonElement>(null), previous = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (!open) return;
    previous.current = document.activeElement as HTMLElement;
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('keydown', onKey); previous.current?.focus(); };
  }, [open, onClose]);
  if (!open) return null;
  return <div className="sheet-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><dialog open className="sheet" aria-labelledby="sheet-title" onCancel={onClose}><header><h2 id="sheet-title">{title}</h2><button ref={closeRef} aria-label="Fechar painel" onClick={onClose}>×</button></header><div className="sheet-body">{children}</div></dialog></div>;
}
