import { useState } from 'react';
import type { Data } from '../model';
import { emergencyBackup } from '../services/emergency-backup';
import { recordDiagnostic, readDiagnostics } from '../services/app-diagnostics';
import { storageHealth } from '../services/storage-health';
import { download } from '../services/storage';
export function DataSecurity({
  data,
  syncStatus,
}: {
  data: Data;
  syncStatus: string;
}) {
  const [message, setMessage] = useState('');
  const [health, setHealth] =
    useState<Awaited<ReturnType<typeof storageHealth>>>();
  const run = async (action: () => Promise<void>) => {
    try {
      await action();
    } catch (error) {
      recordDiagnostic('backup', error);
      setMessage('Não foi possível concluir. Os dados permanecem preservados.');
    }
  };
  return (
    <section aria-label="Dados e Segurança">
      <p>Sincronização: {syncStatus}</p>
      <p>
        Backups de emergência incluem SHA-256 para detectar corrupção. Guarde o
        arquivo em local privado.
      </p>
      <div className="button-row">
        <button
          onClick={() =>
            run(async () => {
              download(
                await emergencyBackup(data),
                'rota-backup-emergencia.json',
              );
              setMessage('Download do backup de emergência solicitado.');
            })
          }
        >
          Baixar backup de emergência
        </button>
        <button
          onClick={() =>
            run(async () => {
              setHealth(await storageHealth());
            })
          }
        >
          Verificar quota da origem
        </button>
        <button
          onClick={() =>
            run(async () => {
              const granted = await navigator.storage?.persist?.();
              setMessage(
                granted
                  ? 'Armazenamento persistente concedido.'
                  : 'Armazenamento persistente não concedido ou indisponível. Mantenha backups.',
              );
            })
          }
        >
          Solicitar armazenamento persistente
        </button>
        <button
          onClick={() =>
            run(async () => {
              const health = await storageHealth();
              download(
                JSON.stringify(
                  {
                    format: 'rota-diagnostic',
                    version: 1,
                    generatedAt: new Date().toISOString(),
                    schemas: {
                      data: 6,
                      planning: data.planningVersion,
                      notification: data.notificationVersion,
                      investment: data.investmentVersion,
                      reporting: data.reportingVersion,
                      imports: data.importVersion,
                      assets: data.assetVersion,
                    },
                    pwa: {
                      supported: 'serviceWorker' in navigator,
                      controlled: !!navigator.serviceWorker?.controller,
                    },
                    storage: health,
                    sync: syncStatus.includes('Sincronizado')
                      ? 'confirmed'
                      : 'unconfirmed',
                    events: readDiagnostics(localStorage),
                  },
                  null,
                  2,
                ),
                'rota-diagnostico.json',
              );
              setMessage(
                'Diagnóstico técnico solicitado, sem dados financeiros ou credenciais.',
              );
            })
          }
        >
          Baixar diagnóstico
        </button>
      </div>
      {health && (
        <p>
          Quota da origem (caches e armazenamento, não a quota específica do
          localStorage):{' '}
          {health.percent === null
            ? 'Indisponível'
            : `${health.percent.toFixed(1)}% · ${health.level === 'normal' ? 'Normal' : 'Atenção: exporte um backup e revise as cópias locais.'}`}
        </p>
      )}
      {message && <output>{message}</output>}
    </section>
  );
}
