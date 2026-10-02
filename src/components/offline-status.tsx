import { useEffect, useState } from 'react';
import { recordDiagnostic } from '../services/app-diagnostics';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Feedback } from './finance-ui';

export function OfflineStatus() {
  const [status, setStatus] = useState('');
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null);
  const [confirmUpdate, setConfirmUpdate] = useState(false);
  useEffect(() => {
    if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
    let active = true;
    let registration: ServiceWorkerRegistration | undefined;
    let worker: ServiceWorker | null = null;
    const update = () => {
      if (!active) return;
      setWaiting(registration?.waiting ?? null);
      setStatus(
        registration?.waiting
          ? 'Nova versão pronta. Salve ou feche os formulários antes de atualizar.'
          : worker?.state === 'activated' || registration?.active
            ? 'Aplicação disponível offline neste navegador. A sincronização precisa de internet.'
            : 'Preparando acesso offline…',
      );
    };
    const installing = () => {
      worker?.removeEventListener('statechange', update);
      worker = registration?.installing ?? null;
      worker?.addEventListener('statechange', update);
      update();
    };
    void navigator.serviceWorker
      .register('/sw.js', { updateViaCache: 'none' })
      .then((value) => {
        if (!active) return;
        registration = value;
        registration.addEventListener('updatefound', installing);
        installing();
      })
      .catch((error) => {
        recordDiagnostic('pwa', error);
        if (active)
          setStatus(
            'Acesso offline indisponível neste navegador. O uso online continua disponível.',
          );
      });
    return () => {
      active = false;
      registration?.removeEventListener('updatefound', installing);
      worker?.removeEventListener('statechange', update);
    };
  }, []);
  function applyUpdate() {
    if (!waiting) return;
    const updated = () => {
      if (waiting.state === 'activated') {
        waiting.removeEventListener('statechange', updated);
        window.location.reload();
      }
    };
    waiting.addEventListener('statechange', updated);
    waiting.postMessage({ type: 'ROTA_ACTIVATE_UPDATE' });
  }
  return status ? (
    <aside
      className="muted pwa-status"
      aria-label="Estado do aplicativo offline"
    >
      <Feedback tone={waiting ? 'warning' : 'offline'} announce>{status}</Feedback>
      {waiting && (
        <AlertDialog
          open={confirmUpdate}
          onOpenChange={(open) => {
            if (
              open &&
              document.querySelector(
                '[role="dialog"], [role="alertdialog"], [aria-busy="true"], form:focus-within',
              )
            ) {
              setStatus('Feche o formulário aberto antes de atualizar.');
              return;
            }
            setConfirmUpdate(open);
          }}
        >
          <AlertDialogTrigger render={<button aria-label="Atualizar aplicativo" />}>Atualizar aplicativo</AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogTitle>Atualizar aplicativo agora?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta aba será recarregada. Salve suas edições antes de continuar.
            </AlertDialogDescription>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction onClick={applyUpdate}>Atualizar e recarregar</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </aside>
  ) : null;
}
