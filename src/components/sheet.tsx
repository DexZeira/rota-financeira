import type { ReactNode } from 'react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  return <Dialog open={open} onOpenChange={(value) => { if (!value) onClose(); }}><DialogContent className="finance-sheet"><DialogTitle>{title}</DialogTitle><div className="sheet-body">{children}</div></DialogContent></Dialog>;
}
