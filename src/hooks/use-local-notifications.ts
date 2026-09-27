import { useEffect, useState } from 'react';
import { type Data, today } from '../model';
import {
  deliverNotifications,
  notificationCandidates,
  validNotificationRoute,
} from '../services/local-notifications';
/** Opening/focusing is an opportunity, not a reliable background alarm. */
export function useLocalNotifications(
  data: Data,
  owner: string,
  ready: boolean,
  navigate: (route: string) => void,
) {
  const [diagnostic, setDiagnostic] = useState('');
  useEffect(() => {
    if (!ready) return;
    let active = true;
    const check = async () => {
      if (document.visibilityState !== 'visible') return;
      try {
        if (
          (localStorage.getItem('rota-cloud-owner') || 'guest') !== owner ||
          localStorage.getItem(`rota-notifications-opt-in:${owner}`) !==
            'enabled'
        )
          return;
        const run = async () => {
          const message = await deliverNotifications({
            preferences: data.notificationPreferences,
            owner,
            storage: localStorage,
            candidates: () => notificationCandidates(data, today()),
            stillActive: () =>
              active &&
              document.visibilityState === 'visible' &&
              (localStorage.getItem('rota-cloud-owner') || 'guest') === owner,
          });
          if (active) setDiagnostic(message || '');
        };
        if (navigator.locks)
          await navigator.locks.request(
            'rota-notifications:' + owner,
            { ifAvailable: true },
            async (lock) => {
              if (lock) await run();
            },
          );
        else await run();
      } catch {
        if (active)
          setDiagnostic(
            'Notificações indisponíveis neste dispositivo. Consulte a Central de Alertas.',
          );
      }
    };
    void check();
    window.addEventListener('focus', check);
    document.addEventListener('visibilitychange', check);
    return () => {
      active = false;
      window.removeEventListener('focus', check);
      document.removeEventListener('visibilitychange', check);
    };
  }, [data, owner, ready]);
  useEffect(() => {
    if (!ready) return;
    const open = (route: unknown) => {
      if (validNotificationRoute(route)) navigate(route);
    };
    if (window.location.hash.startsWith('#notification=')) {
      try {
        open(decodeURIComponent(window.location.hash.slice(14)));
      } catch {
        /* malformed link ignored */
      }
      history.replaceState(null, '', location.pathname + location.search);
    }
    const message = (event: MessageEvent) => {
      if (
        event.origin === location.origin &&
        event.data?.type === 'rota-notification'
      )
        open(event.data.route);
    };
    navigator.serviceWorker?.addEventListener('message', message);
    return () =>
      navigator.serviceWorker?.removeEventListener('message', message);
  }, [ready, navigate]);
  return diagnostic;
}
