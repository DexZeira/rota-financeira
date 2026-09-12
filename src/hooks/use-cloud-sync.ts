import { useCallback, useEffect, useRef, useState } from 'react';
import type { Data } from '../model';
import { defaults } from '../model';
import { backup, load, save } from '../services/storage';
import {
  loadCloudState,
  saveCloudState,
  type SyncErrorDetails,
} from '../services/cloud-sync';
import {
  accountKey,
  fingerprint,
  metaKey,
  OWNER_KEY,
  resolveInitialSync,
  switchAccount,
  syncStatus,
  type CloudState,
  type SyncMeta,
} from '../services/sync-core';

export function useCloudSync(
  user: string | undefined,
  ready: boolean,
  data: Data,
  apply: (data: Data) => void,
) {
  const [settled, setSettled] = useState<string>();
  const [status, setStatus] = useState('Somente neste dispositivo');
  const [lastSync, setLastSync] = useState<string>();
  const [error, setError] = useState<SyncErrorDetails | undefined>();
  const [wake, setWake] = useState(0);
  const [conflict, setConflict] = useState<{
    remote: CloudState | null;
    localUpdated?: string;
  } | null>(null);
  const latest = useRef({ data, apply, user });
  const generation = useRef(0);
  const busy = useRef(false);
  const meta = useRef<SyncMeta>({});
  const conflictRef = useRef(false);
  const reviewedRevision = useRef<string | null | undefined>(undefined);
  const device = useRef('');
  const prepared = useRef<string | undefined>(undefined);
  useEffect(() => {
    latest.current = { data, apply, user };
  }, [data, apply, user]);

  const synchronize = useCallback(
    async (choice?: 'local' | 'cloud' | 'empty') => {
      const owner = latest.current.user;
      if (!owner || prepared.current !== owner || busy.current) return;
      const ticket = generation.current;
      const valid = () => {
        try { return ticket === generation.current && latest.current.user === owner && localStorage.getItem(OWNER_KEY) === owner; }
        catch { return false; }
      };
      busy.current = true;
      try {
        setError(undefined);
        if (!valid()) throw Error('Conta mudou em outra aba.');
        if (!navigator.onLine) {
          setSettled(owner);
          setStatus(
            'Offline — alterações serão sincronizadas quando possível.',
          );
          return;
        }
        setStatus('Salvando…');
        const remote = await loadCloudState(owner);
        if (!valid()) return;
        const local = load(localStorage);
        if (
          choice &&
          reviewedRevision.current !== undefined &&
          reviewedRevision.current !== (remote?.updated_at ?? null)
        ) {
          reviewedRevision.current = remote?.updated_at ?? null;
          conflictRef.current = true;
          setConflict({ remote, localUpdated: meta.current.localUpdated });
          setStatus('A nuvem mudou novamente. Revise sua escolha.');
          return;
        }
        if (
          choice === 'local' &&
          !conflictRef.current &&
          remote &&
          remote.updated_at !== meta.current.revision
        ) {
          reviewedRevision.current = remote.updated_at;
          conflictRef.current = true;
          setConflict({ remote, localUpdated: meta.current.localUpdated });
          setStatus('Dados diferentes encontrados');
          return;
        }
        const decision = choice
          ? choice === 'cloud'
            ? 'download'
            : 'upload'
          : resolveInitialSync(local, remote, meta.current.base);
        if (decision === 'conflict' || decision === 'migration') {
          reviewedRevision.current = remote?.updated_at ?? null;
          conflictRef.current = true;
          setConflict({ remote, localUpdated: meta.current.localUpdated });
          setStatus('Escolha quais dados usar');
          return;
        }
        if (decision === 'download' && !remote)
          throw Error('Ainda não há dados na nuvem.');
        const next =
          decision === 'download'
            ? remote!.data
            : choice === 'empty'
              ? defaults()
              : local;
        let result = remote;
        if (decision === 'upload') {
          result = await saveCloudState(
            owner,
            next,
            device.current,
            remote?.updated_at ?? null,
          );
          if (!valid()) return;
          if (!result) {
            const newest = await loadCloudState(owner);
            if (!valid()) return;
            reviewedRevision.current = newest?.updated_at ?? null;
            conflictRef.current = true;
            setConflict({
              remote: newest,
              localUpdated: meta.current.localUpdated,
            });
            setStatus('Dados diferentes encontrados');
            return;
          }
        }
        if (!valid() || !result) return;
        // Never replace a new local edit made while a request was in flight.
        if (decision === 'download' || choice === 'empty') {
          if (fingerprint(load(localStorage)) !== fingerprint(local)) {
            conflictRef.current = true;
            setConflict({
              remote: result,
              localUpdated: meta.current.localUpdated,
            });
            return;
          }
          localStorage.setItem(`rota-cloud-recovery:${owner}`, backup(local));
          save(localStorage, next);
          latest.current.apply(next);
        }
        meta.current = {
          ...meta.current,
          base: fingerprint(result.data),
          revision: result.updated_at,
          lastSync: new Date().toISOString(),
        };
        localStorage.setItem(metaKey(owner), JSON.stringify(meta.current));
        localStorage.setItem(accountKey(owner), backup(load(localStorage)));
        conflictRef.current = false;
        reviewedRevision.current = undefined;
        setConflict(null);
        setSettled(owner);
        setLastSync(meta.current.lastSync);
        const pending = fingerprint(load(localStorage)) !== meta.current.base;
        setStatus(pending ? 'Salvando…' : 'Salvo');
        if (pending) setWake((value) => value + 1);
      } catch (caught) {
        if (valid()) {
          const source = caught && typeof caught === 'object'
            ? caught as Partial<SyncErrorDetails>
            : {};
          const details: SyncErrorDetails = {
            message: typeof source.message === 'string'
              ? source.message
              : 'Erro desconhecido de sincronização.',
            code: typeof source.code === 'string' ? source.code : undefined,
            details: typeof source.details === 'string' ? source.details : undefined,
            hint: typeof source.hint === 'string' ? source.hint : undefined,
            status: typeof source.status === 'number' ? source.status : undefined,
          };
          setError(details);
          // The selected account has already been isolated locally, so it can work offline.
          setSettled(owner);
          setStatus(syncStatus(details, navigator.onLine));
        }
      } finally {
        if (ticket === generation.current) busy.current = false;
      }
    },
    [],
  );

  useEffect(() => {
    if (!ready) return;
    const ticket = ++generation.current;
    prepared.current = undefined;
    busy.current = false;
    conflictRef.current = false;
    reviewedRevision.current = undefined;
    queueMicrotask(() => {
      if (ticket !== generation.current) return;
      setConflict(null);
      setError(undefined);
      setSettled(undefined);
      if (!user) {
        setLastSync(undefined);
        setStatus('Somente neste dispositivo');
        return;
      }
      try {
        const next = switchAccount(localStorage, user, load(localStorage));
        latest.current.apply(next);
        meta.current = JSON.parse(
          localStorage.getItem(metaKey(user)) || '{}',
        ) as SyncMeta;
        device.current =
          localStorage.getItem('rota-cloud-device') || crypto.randomUUID();
        localStorage.setItem('rota-cloud-device', device.current);
        prepared.current = user;
        setLastSync(meta.current.lastSync);
        void synchronize();
      } catch {
        setStatus(
          'Falha ao preparar os dados locais. Faça backup antes de continuar.',
        );
      }
    });
    return () => {
      generation.current = ticket + 1;
    };
  }, [user, ready, synchronize]);

  useEffect(() => {
    if (!user || !ready) return;
    const timer = window.setTimeout(() => {
      if (!conflictRef.current) void synchronize();
    }, 1000);
    return () => window.clearTimeout(timer);
  }, [data, user, ready, synchronize, wake]);
  useEffect(() => {
    if (!user || !ready) return;
    let delay = 15000;
    let timer: ReturnType<typeof setTimeout>;
    let active = true;
    const tick = async () => {
      if (!conflictRef.current && document.visibilityState === 'visible')
        await synchronize();
      delay = navigator.onLine ? 30000 : Math.min(delay * 2, 120000);
      if (active)
        timer = setTimeout(() => {
          void tick();
        }, delay);
    };
    const resume = () => {
      if (!conflictRef.current) void synchronize();
    };
    const offline = () =>
      setStatus('Offline — alterações serão sincronizadas quando possível.');
    timer = setTimeout(() => {
      void tick();
    }, delay);
    window.addEventListener('online', resume);
    window.addEventListener('offline', offline);
    window.addEventListener('focus', resume);
    return () => {
      active = false;
      clearTimeout(timer);
      window.removeEventListener('online', resume);
      window.removeEventListener('offline', offline);
      window.removeEventListener('focus', resume);
    };
  }, [user, ready, synchronize]);
  const changed = () => {
    if (!user) return;
    meta.current.localUpdated = new Date().toISOString();
    localStorage.setItem(metaKey(user), JSON.stringify(meta.current));
    setStatus(
      navigator.onLine
        ? 'Salvando…'
        : 'Offline — alterações serão sincronizadas quando possível.',
    );
  };
  return {
    status,
    lastSync,
    conflict,
    synchronize,
    changed,
    pending: !!user && settled !== user,
    error,
  };
}
