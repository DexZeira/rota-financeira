import { useEffect, useState } from 'react';
import { recordDiagnostic } from '../services/app-diagnostics';

export function OfflineStatus() {
  const [status, setStatus] = useState('');
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null);
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
  return status ? (
    <aside
      className="muted pwa-status"
      aria-label="Estado do aplicativo offline"
    >
      <output>{status}</output>
      {waiting && (
        <button
          onClick={() => {
            if (
              document.querySelector(
                '[role="dialog"], [role="alertdialog"], [aria-busy="true"], form:focus-within',
              )
            ) {
              setStatus('Feche o formulário aberto antes de atualizar.');
              return;
            }
            if (
              !window.confirm(
                'Atualizar e recarregar esta aba? Salve suas edições antes de continuar.',
              )
            )
              return;
            const updated = () => {
              if (waiting.state === 'activated') {
                waiting.removeEventListener('statechange', updated);
                window.location.reload();
              }
            };
            waiting.addEventListener('statechange', updated);
            waiting.postMessage({ type: 'ROTA_ACTIVATE_UPDATE' });
          }}
        >
          Atualizar aplicativo
        </button>
      )}
    </aside>
  ) : null;
}
