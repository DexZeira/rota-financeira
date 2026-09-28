import { useState } from 'react';
import { defaults, collections } from '../model';
import { parseEmergencyBackup } from '../services/emergency-backup';
import { recoveryCopy } from '../services/recovery';
import { save, STORAGE_KEY, download } from '../services/storage';
import { withWriteLock } from '../services/tab-coordination';
import { OWNER_KEY } from '../services/sync-core';
export function RecoveryMode() {
  const [candidate, setCandidate] = useState<ReturnType<typeof defaults>>();
  const [confirmation, setConfirmation] = useState('');
  const [message, setMessage] = useState('');
  const [expected, setExpected] = useState<{
    raw: string | null;
    owner: string | null;
  }>();
  const select = (data: ReturnType<typeof defaults>) => {
    setExpected({
      raw: localStorage.getItem(STORAGE_KEY),
      owner: localStorage.getItem(OWNER_KEY),
    });
    setConfirmation('');
    setCandidate(data);
  };
  return (
    <main className="workspace">
      <h1>Recuperação dos dados</h1>
      <p>
        Os dados existentes permanecem preservados. Nenhuma cópia será aplicada
        sem confirmação.
      </p>
      <button
        onClick={() => {
          try {
            const copy = recoveryCopy(localStorage);
            if (copy) select(copy);
            else setMessage('Nenhuma cópia válida disponível para esta conta.');
          } catch {
            setMessage('Armazenamento indisponível.');
          }
        }}
      >
        Restaurar cópia anterior
      </button>
      <label>
        Importar backup
        <input
          type="file"
          accept=".json"
          onChange={async (e) => {
            setCandidate(undefined);
            setConfirmation('');
            try {
              const f = e.target.files?.[0];
              if (f) {
                if (f.size > 20_000_000) throw Error();
                select(await parseEmergencyBackup(await f.text()));
              }
            } catch {
              setMessage('Backup inválido. Nada foi alterado.');
            }
          }}
        />
      </label>
      <button
        onClick={() => {
          try {
            select(defaults());
          } catch {
            setMessage('Armazenamento indisponível.');
          }
        }}
      >
        Iniciar vazio
      </button>
      {candidate && (
        <>
          <p>Preview: {collections.reduce((sum, key) => sum + candidate[key].length, 0)} registros. Nenhuma alteração aplicada.</p>
          <p>
            Para substituir os dados, digite RESTAURAR. Uma cópia dos bytes
            atuais será preservada antes da gravação.
          </p>
          <input
            aria-label="Confirmação de recuperação"
            value={confirmation}
            onChange={(e) => setConfirmation(e.target.value)}
          />
          <button
            disabled={confirmation !== 'RESTAURAR'}
            onClick={async () => {
              try {
                await withWriteLock(() => {
                  if (
                    !expected ||
                    localStorage.getItem(STORAGE_KEY) !== expected.raw ||
                    localStorage.getItem(OWNER_KEY) !== expected.owner
                  )
                    throw Error();
                  const raw =
                    localStorage.getItem(STORAGE_KEY) ||
                    localStorage.getItem('rota-financeira') ||
                    '';
                  localStorage.setItem(`rota-corrupted-recovery:${expected.owner || 'guest'}`, raw);
                  download(raw, 'rota-antes-recuperacao.json');
                  save(localStorage, candidate);
                });
                window.location.hash = '';
                window.location.reload();
              } catch {
                setMessage(
                  'Recuperação não aplicada. Verifique espaço e compatibilidade da versão.',
                );
              }
            }}
          >
            Confirmar recuperação
          </button>
        </>
      )}
      <button
        onClick={() => {
          window.location.hash = '';
          window.location.reload();
        }}
      >
        Voltar ao aplicativo
      </button>
      {message && <output>{message}</output>}
    </main>
  );
}
