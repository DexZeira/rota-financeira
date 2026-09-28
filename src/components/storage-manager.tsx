import { useState } from 'react';
import { Card } from './common';
import { inspectStorage, ownerCopies, removeStoredCopy, storageFailure, type StoredCopy } from '../services/storage-quota';
import { OWNER_KEY } from '../services/sync-core';
import { download } from '../services/storage';

export function StorageManager() {
  const [inventory, setInventory] = useState<ReturnType<typeof inspectStorage>>();
  const [selected, setSelected] = useState<StoredCopy>();
  const [confirmed, setConfirmed] = useState(false);
  const [message, setMessage] = useState('');
  function currentCopy(copy: StoredCopy) {
    if (!ownerCopies([copy], localStorage.getItem(OWNER_KEY)).length || localStorage.getItem(copy.key) !== copy.text)
      throw Error('A conta ou esta cópia mudou. Verifique o armazenamento novamente.');
    return copy.text;
  }
  function refresh() {
    try { const inventory = inspectStorage(localStorage); setInventory({ ...inventory, copies: ownerCopies(inventory.copies, localStorage.getItem(OWNER_KEY)) }); setSelected(undefined); setMessage(''); }
    catch (error) { setMessage(storageFailure(error)); }
  }
  return <Card title="Armazenamento e cópias locais" action={<button onClick={refresh}>Verificar espaço</button>}>
    <p>O espaço é compartilhado com outras cópias neste navegador. Os dados atuais e a recuperação da conta ativa ficam protegidos. Nenhum backup é apagado automaticamente.</p>
    {inventory && <>
      <p>Uso aproximado do localStorage: {(inventory.bytes / 1024 / 1024).toFixed(2)} MB. A quota varia conforme o navegador.</p>
      {inventory.copies.length === 0 && <p>Nenhuma cópia adicional encontrada.</p>}
      {inventory.copies.map((copy, index) => <div className="detail" key={copy.key}>
        <span>Cópia {index + 1} · {copy.key.startsWith('rota-money-before-migration:planning-v2:') ? 'Antes das vigências de recorrência' : copy.key.startsWith('rota-money-before-migration:planning-v1:') ? 'Antes do planejamento financeiro' : copy.key.startsWith('rota-money-before-migration:intelligence-v1:') ? 'Antes da inteligência financeira' : copy.key.startsWith('rota-money-before-migration:') ? 'Antes da migração monetária' : copy.key.startsWith('rota-money-rounding:') ? 'Antes de arredondamento' : copy.key.includes('account:') ? 'Cópia de conta' : 'Recuperação'} · {(copy.bytes / 1024).toFixed(1)} KB {copy.protected ? '· protegida' : ''}</span>
        <button onClick={() => { setSelected(copy); setConfirmed(false); setMessage(''); }}>Gerenciar cópia {index + 1}</button>
      </div>)}
    </>}
    {selected && <div className="card">
      <p>Salve esta cópia antes de removê-la. A remoção afeta somente esta cópia adicional neste navegador.</p>
      <button onClick={() => { try { download(currentCopy(selected), 'rota-financeira-copia-local.json'); setMessage('Download solicitado. Confirme que o arquivo foi salvo antes de remover.'); } catch { setMessage('Download indisponível ou cópia alterada. Verifique o armazenamento novamente.'); } }}>Baixar esta cópia</button>
      <button onClick={async () => { try { await navigator.clipboard.writeText(currentCopy(selected)); setMessage('Cópia transferida para a área de transferência. Salve em um arquivo antes de remover.'); } catch { setMessage('Não foi possível copiar. A cópia local foi preservada.'); } }}>Copiar esta cópia</button>
      {!selected.protected && <>
        <label><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} /> Confirmei que salvei esta cópia e quero removê-la deste navegador.</label>
        <button className="danger" disabled={!confirmed} onClick={() => {
          try { currentCopy(selected); removeStoredCopy(localStorage, selected); refresh(); setMessage('Cópia adicional removida.'); }
          catch (error) { setMessage(storageFailure(error)); }
        }}>Remover somente esta cópia</button>
      </>}
      <button onClick={() => setSelected(undefined)}>Cancelar</button>
    </div>}
    {message && <output>{message}</output>}
  </Card>;
}
