import { createContext, useContext, useState, type ReactNode } from 'react';
import { Eye, EyeOff } from 'lucide-react';

const Privacy = createContext({ hidden: false, toggle: () => {} });
export function ValuePrivacy({ children }: { children: ReactNode }) {
  const [hidden, setHidden] = useState(() => {
    try { return localStorage.getItem('rota-ui-hide-values') === 'true'; } catch { return false; }
  });
  const toggle = () => setHidden((previous) => {
    const next = !previous;
    try { localStorage.setItem('rota-ui-hide-values', String(next)); } catch { /* UI preference is optional. */ }
    return next;
  });
  return <Privacy.Provider value={{ hidden, toggle }}>{children}</Privacy.Provider>;
}
export function useValuePrivacy() { return useContext(Privacy); }
export function PrivateValue({ children }: { children: ReactNode }) {
  const { hidden } = useValuePrivacy();
  const monetary = typeof children === 'string' && /R\$|US\$|€/.test(children);
  return <span data-money={monetary || undefined}>{hidden && monetary ? <span aria-label="Valor oculto">••••</span> : children}</span>;
}
export function PrivacyToggle() {
  const { hidden, toggle } = useValuePrivacy();
  return <button className="icon-button privacy-toggle" aria-label={hidden ? 'Mostrar valores' : 'Ocultar valores'} aria-pressed={hidden} onClick={toggle}>{hidden ? <EyeOff size={18} aria-hidden="true"/> : <Eye size={18} aria-hidden="true"/>}</button>;
}
