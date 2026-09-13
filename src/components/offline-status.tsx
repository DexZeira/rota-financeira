import { useEffect, useState } from 'react';

export function OfflineStatus() {
  const [status, setStatus] = useState('');
  useEffect(() => {
    if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
    let active = true;
    let registration: ServiceWorkerRegistration | undefined;
    let worker: ServiceWorker | null = null;
    const update = () => {
      if (!active) return;
      setStatus(registration?.waiting
        ? 'Atualização pronta. Feche todas as abas do Rota e abra novamente para aplicá-la.'
        : worker?.state === 'activated' || registration?.active
          ? 'Aplicação disponível offline neste navegador. A sincronização precisa de internet.'
          : 'Preparando acesso offline…');
    };
    const installing = () => {
      worker?.removeEventListener('statechange', update);
      worker = registration?.installing ?? null;
      worker?.addEventListener('statechange', update);
      update();
    };
    void navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' }).then((value) => {
      if (!active) return;
      registration = value;
      registration.addEventListener('updatefound', installing);
      installing();
    }).catch(() => {
      if (active) setStatus('Acesso offline indisponível neste navegador. O uso online continua disponível.');
    });
    return () => {
      active = false;
      registration?.removeEventListener('updatefound', installing);
      worker?.removeEventListener('statechange', update);
    };
  }, []);
  return status ? <output className="muted">{status}</output> : null;
}
