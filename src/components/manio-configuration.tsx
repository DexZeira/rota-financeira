import { useEffect, useRef, useState } from 'react';
import { categories, money, today, type Data } from '../model';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogContent, AlertDialogTitle, AlertDialogDescription, AlertDialogCancel } from '@/components/ui/alert-dialog';
import { Field, FieldLabel } from '@/components/ui/field';
import { EmptyState, Feedback } from './finance-ui';
import { supabase } from '../services/supabase';
import { manioReaderEmail, testManioSheet, syncManioSheet, listManioConnections, saveManioConnections, disconnectManioConnection, listManioTransactions, type ManioConnection, type ManioStoredTransaction } from '../services/manio-client';
import { manioImportLines } from '../services/manio-import';
import { previewImport, prepareImport } from '../services/import/import-session';
import { fileHash } from '../services/import/transaction-normalizer';
import type { Review } from '../services/import/types';
import './manio-configuration.css';

type Tab = { id: string; sheetName: string; accountId: string; accountName: string; accountType: 'checking' | 'card'; enabled: boolean };
const blankTab = (): Tab => ({ id: crypto.randomUUID(), sheetName: '', accountId: crypto.randomUUID(), accountName: 'C6 Bank', accountType: 'checking', enabled: true });
export function ManioConfiguration({ data, owner, onSave }: { data: Data; owner: string; onSave: (next: Data, base: Data) => Promise<void> }) {
  const [connections, setConnections] = useState<ManioConnection[]>([]);
  const [open, setOpen] = useState(false), [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const dialogReturnFocus = useRef<HTMLElement | null>(null);
  const [error, setError] = useState(''), [message, setMessage] = useState('');
  const [email, setEmail] = useState(''), [spreadsheetId, setSpreadsheetId] = useState('');
  const [institution, setInstitution] = useState('C6 Bank'), [tabs, setTabs] = useState<Tab[]>([blankTab()]);
  const [tested, setTested] = useState(false), [diagnostic, setDiagnostic] = useState('');
  const [selected, setSelected] = useState<ManioConnection | null>(null);
  const [transactions, setTransactions] = useState<ManioStoredTransaction[]>([]);
  const [chosen, setChosen] = useState<Record<string, string>>({});
  const [disconnect, setDisconnect] = useState<ManioConnection | null>(null);
  const [page, setPage] = useState(0);
  const authenticated = !!supabase && owner !== 'guest';
  useEffect(() => {
    if (!authenticated) return;
    let active = true;
    listManioConnections(owner).then(rows => { if (active) setConnections(rows); }).catch(() => { if (active) setError('Não foi possível carregar o Manio. Confira o setup no servidor.'); });
    return () => { active = false; };
  }, [owner, authenticated]);
  async function run(action: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError(''); setMessage('');
    try { await action(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Não foi possível concluir a operação.'); }
    finally { lock.current = false; setBusy(false); }
  }
  async function configure(connection?: ManioConnection) {
    if (!lock.current) dialogReturnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    await run(async () => {
      setEmail(await manioReaderEmail());
      setSpreadsheetId(connection?.spreadsheet_id ?? '');
      setInstitution(connection?.institution_name ?? 'C6 Bank');
      const existing = connection ? connections.filter(c => c.spreadsheet_id === connection.spreadsheet_id) : [];
      setTabs(existing.length ? existing.map(c => ({ id: c.id, sheetName: c.sheet_name, accountId: c.id, accountName: c.account_reference, accountType: c.account_type, enabled: c.enabled })) : [blankTab()]);
      setTested(false); setDiagnostic(''); setOpen(true);
    });
  }
  function updateTab(id: string, patch: Partial<Tab>) { setTested(false); setTabs(tabs.map(t => t.id === id ? { ...t, ...patch } : t)); }
  async function test() {
    await run(async () => {
      const enabled = tabs.filter(t => t.enabled);
      if (!enabled.length || new Set(tabs.map(t => t.sheetName.trim())).size !== tabs.length) throw Error('Informe abas distintas e habilite ao menos uma.');
      const results = [];
      for (const tab of enabled) {
        if (!tab.accountName.trim()) throw Error('Informe a conta destino para cada aba.');
        const result = await testManioSheet(spreadsheetId.trim(), tab.sheetName.trim());
        results.push(`${tab.sheetName}: ${result.sampleRowsCount} linhas de amostra; colunas ${Object.values(result.columnsDetected).join(', ')}.`);
      }
      setDiagnostic(results.join(' ')); setTested(true);
    });
  }
  async function connect() {
    await run(async () => {
      if (!tested) throw Error('Teste todas as abas habilitadas antes de conectar.');
      await saveManioConnections(owner, tabs.map(t => ({
        id: connections.find(c => c.spreadsheet_id === spreadsheetId.trim() && c.sheet_name === t.sheetName.trim())?.id ?? t.accountId,
        spreadsheet_id: spreadsheetId.trim(), sheet_name: t.sheetName.trim(), institution_name: institution.trim(),
        account_reference: t.accountName.trim(), account_type: t.accountType, enabled: t.enabled,
      })));
      setConnections(await listManioConnections(owner)); setOpen(false);
      setMessage('Configuração conectada. Sincronize para ler a planilha e revise os movimentos antes de contabilizar.');
    });
  }
  async function readTransactions(c: ManioConnection) {
    const rows = await listManioTransactions(owner, c.id);
    setSelected(c); setTransactions(rows); setPage(0);
  }
  async function synchronize(c: ManioConnection) {
    await run(async () => {
      const summary = await syncManioSheet(c.id);
      setConnections(await listManioConnections(owner));
      await readTransactions(c);
      setMessage(`Leitura concluída: ${summary.newTransactions} novas, ${summary.updatedTransactions} atualizadas, ${summary.existingTransactions} já existentes. Revise antes de contabilizar.`);
    });
  }
  const lines = selected ? manioImportLines(transactions, selected) : [];
  const previews = previewImport(data, lines);
  async function review(index: number, action: Review['action'], recordKind: Review['recordKind'] = '', recordId = '') {
    await run(async () => {
      const transaction = transactions[index], row = lines[index];
      if (!selected || !transaction || !row.transaction) return;
      if (transaction.type === 'transfer' && action === 'create') throw Error('Transferências não são receitas ou despesas. Concilie as duas pontas na importação existente.');
      const hash = await fileHash(new TextEncoder().encode(selected.id + transaction.source_key));
      const next = prepareImport(data, [{ ...row, line: 1, transaction: { ...row.transaction, line: 1 } }], { 1: {
        action, category: chosen[transaction.id] || (categories.includes(transaction.source_category) ? transaction.source_category : previews[index].category.category),
        recordKind, recordId, override: false, remember: false,
      } }, { source: 'manio', fileName: 'Manio · ' + selected.sheet_name, hash });
      await onSave(next, data); setMessage('Decisão salva. Os lançamentos anteriores foram preservados.');
    });
  }
  return <section className="manio-integration" aria-labelledby="manio-heading" aria-busy={busy}>
    <header className="manio-heading"><div><h3 id="manio-heading">Manio</h3><p>Sincronize suas transações via Manio e Google Sheets. Somente leitura/importação.</p></div>
      <button disabled={busy || !authenticated} onClick={() => void configure()}>Configurar Manio</button></header>
    {!authenticated && <p>Entre na sua conta do Rota para configurar o Manio. CSV/OFX continua disponível no modo local.</p>}
    {busy && !open && !disconnect && <Feedback tone="loading" announce>Processando a solicitação Manio…</Feedback>}
    {error && !open && !disconnect && <Feedback tone="error" announce>{error}</Feedback>}
    {message && <Feedback tone="success" announce>{message}</Feedback>}
    {connections.map(c => <article className="manio-connection" key={c.id}>
      <div><h4>{c.institution_name}</h4><p>Origem · Manio · {c.status === 'disconnected' ? 'Desconectado' : c.status === 'error' ? 'Precisa de atenção' : 'Conectado'}{busy && selected?.id === c.id ? ' · Processando' : ''}</p>
        <p>Conta: {c.account_reference} · {c.account_type === 'card' ? 'Cartão' : 'Conta corrente'} · Aba: {c.sheet_name}</p>
        <p>Última leitura da planilha: {c.last_sync_at ? new Date(c.last_sync_at).toLocaleString('pt-BR') : 'Ainda não realizada'}</p>
        {selected?.id === c.id && <p>{transactions.length} movimentos disponíveis para revisão.</p>}
        {c.status === 'disconnected' && <p>O histórico permanece. A autorização bancária deve ser gerenciada no Manio.</p>}
        {c.status === 'error' && <p>Não foi possível atualizar. Confira o compartilhamento, a aba e a configuração antes de tentar novamente.</p>}
      </div>
      <div className="manio-actions">
        {c.enabled && c.status !== 'disconnected' && <button disabled={busy} onClick={() => void synchronize(c)}>Sincronizar agora · {c.account_reference}</button>}
        <button disabled={busy} onClick={() => void configure(c)}>Configurar · {c.account_reference}</button>
        <button disabled={busy} onClick={() => void run(() => readTransactions(c))}>Revisar movimentos · {c.account_reference}</button>
        {c.status !== 'disconnected' && <button disabled={busy} onClick={() => setDisconnect(c)}>Desconectar · {c.account_reference}</button>}
      </div>
    </article>)}
    <p className="inline-note">Os dados bancários são disponibilizados pelo Manio no Google Sheets. O Rota informa a última leitura da planilha, não o estado do banco. Nenhum saldo da planilha altera seu caixa.</p>
    {selected && <section aria-label="Movimentos Manio" className="manio-review">
      <h4>Revisar · {selected.account_reference}</h4><p>Os movimentos entram no Dashboard somente após importação ou conciliação. Correções da origem nunca sobrescrevem categorias ou lançamentos confirmados.</p>
      {!transactions.length && <EmptyState title="Nenhum movimento disponível" description="A planilha pode não ter linhas novas. Isso não indica erro do Manio."/>}
      {transactions.slice(page * 25, (page + 1) * 25).map((t, offset) => {
        const index = page * 25 + offset, p = previews[index];
        const previous = p.duplicate?.link;
        const changed = previous && (previous.transaction.date !== t.date || previous.transaction.amountCents !== t.amount_cents || previous.transaction.description !== t.description || previous.transaction.direction !== lines[index].transaction?.direction);
        return <article key={t.id} className="manio-transaction">
          <div><strong>{t.description}</strong><p>{t.date} · {t.type === 'transfer' ? 'Transferência — sem efeito automático no caixa' : t.type === 'income' ? 'Entrada +' : 'Saída −'} {money(t.amount_cents / 100)} · {selected.account_reference}</p>
            {previous ? <p>{changed ? 'Origem alterada. Revise o lançamento existente; nenhuma alteração automática foi feita.' : 'Já revisada/importada. Não será contabilizada novamente.'}</p> : <p>Revisão necessária{p.candidates.length ? ' · Correspondência possível: concilie para evitar duplicação.' : ''}</p>}
          </div>
          {!previous && <details><summary>Revisar movimento</summary><div className="manio-actions">
            {t.type === 'expense' && <label>Categoria para {t.description}<select value={chosen[t.id] || (categories.includes(t.source_category) ? t.source_category : p.category.category)} onChange={e => setChosen({ ...chosen, [t.id]: e.target.value })} disabled={busy}>{categories.map(category => <option key={category}>{category}</option>)}</select></label>}
            {t.type !== 'transfer' && !p.candidates.length && !p.transferLines.length && t.date <= today() && <button disabled={busy} onClick={() => void review(index, 'create')}>Importar lançamento</button>}
            {p.candidates.filter(candidate => !['debts', 'recurrences'].includes(candidate.kind)).map(candidate => <button key={candidate.kind + candidate.id} disabled={busy} onClick={() => void review(index, 'match', candidate.kind as Review['recordKind'], candidate.id)}>Conciliar com {candidate.name}</button>)}
            {t.type === 'transfer' && <p>Não importe como receita/despesa. Preserve a evidência ou ignore fora do caixa; para conciliar pares use o fluxo de importação existente.</p>}
            <button disabled={busy} onClick={() => void review(index, 'ignore')}>Ignorar sem alterar caixa</button>
          </div></details>}
        </article>;
      })}
      {transactions.length > 25 && <div className="manio-actions"><button disabled={busy || page === 0} onClick={() => setPage(page - 1)}>Página anterior</button><span>Página {page + 1}</span><button disabled={busy || (page + 1) * 25 >= transactions.length} onClick={() => setPage(page + 1)}>Próxima página</button></div>}
    </section>}
    <Dialog open={open} onOpenChange={value => { if (!busy) setOpen(value); }}><DialogContent className="manio-dialog" finalFocus={dialogReturnFocus}>
      <DialogTitle>Configurar Manio</DialogTitle><DialogDescription>Conecte seu banco ao Manio e selecione Google Sheets como destino. Mantenha a planilha privada.</DialogDescription>
      <p>Compartilhe a planilha como <strong>Leitor</strong> com <strong className="manio-reader-email">{email}</strong>. O administrador deve vinculá-la ao seu usuário no Supabase antes do teste.</p>
      <form aria-busy={busy} aria-describedby={error ? 'manio-config-error' : undefined} onSubmit={e => { e.preventDefault(); void (tested ? connect() : test()); }}>
        <fieldset disabled={busy}><legend>Planilha e contas destino</legend>
          <Field><FieldLabel htmlFor="manio-spreadsheet">ID da planilha (obrigatório)</FieldLabel><input id="manio-spreadsheet" required maxLength={150} pattern="[A-Za-z0-9_-]{20,150}" value={spreadsheetId} onChange={e => { setSpreadsheetId(e.target.value); setTested(false); }}/></Field>
          <Field><FieldLabel htmlFor="manio-institution">Instituição (obrigatório)</FieldLabel><input id="manio-institution" required maxLength={100} value={institution} onChange={e => { setInstitution(e.target.value); setTested(false); }}/></Field>
          {tabs.map((tab, i) => <fieldset className="manio-tab" key={tab.id}><legend>Aba {i + 1}</legend>
            <Field><FieldLabel htmlFor={tab.id + '-sheet'}>Nome da aba (obrigatório)</FieldLabel><input id={tab.id + '-sheet'} required maxLength={100} value={tab.sheetName} onChange={e => updateTab(tab.id, { sheetName: e.target.value })}/></Field>
            <Field><FieldLabel htmlFor={tab.id + '-account'}>Conta destino (obrigatório)</FieldLabel><input id={tab.id + '-account'} required maxLength={150} value={tab.accountName} onChange={e => updateTab(tab.id, { accountName: e.target.value })}/></Field>
            <Field><FieldLabel htmlFor={tab.id + '-type'}>Tipo de conta</FieldLabel><select id={tab.id + '-type'} value={tab.accountType} onChange={e => updateTab(tab.id, { accountType: e.target.value as Tab['accountType'] })}><option value="checking">Conta corrente</option><option value="card">Cartão</option></select></Field>
            <label><input type="checkbox" checked={tab.enabled} onChange={e => updateTab(tab.id, { enabled: e.target.checked })}/> Habilitar leitura desta aba</label>
            {tabs.length > 1 && !connections.some(c => c.id === tab.accountId) && <button type="button" onClick={() => { setTabs(tabs.filter(t => t.id !== tab.id)); setTested(false); }}>Remover aba {i + 1}</button>}
          </fieldset>)}
          <button type="button" disabled={tabs.length >= 10} onClick={() => { setTabs([...tabs, blankTab()]); setTested(false); }}>Adicionar aba</button>
          <p>Conta destino identifica a origem na revisão; o modelo atual não cria saldo individual. Depois de uma leitura, preserve o mapeamento para manter a identidade e o histórico.</p>
          {diagnostic && <Feedback tone="success">{diagnostic}</Feedback>}
          {error && <Feedback id="manio-config-error" tone="error" announce>{error}</Feedback>}
          <div className="manio-actions"><button type="button" onClick={() => void test()}>Testar conexão</button><button type="submit" disabled={!tested}>Conectar</button></div>
        </fieldset>
        {busy && <Feedback tone="loading" announce>Validando ou salvando a configuração…</Feedback>}
      </form>
    </DialogContent></Dialog>
    <AlertDialog open={!!disconnect} onOpenChange={value => { if (!busy && !value) setDisconnect(null); }}><AlertDialogContent>
      <AlertDialogTitle>Desconectar {disconnect?.account_reference}?</AlertDialogTitle><AlertDialogDescription>As leituras desta aba serão desativadas. Os movimentos e lançamentos históricos permanecem. Gerencie a autorização bancária no Manio.</AlertDialogDescription>
      <AlertDialogCancel disabled={busy}>Cancelar</AlertDialogCancel><button disabled={busy} onClick={() => void run(async () => {
        if (!disconnect) return;
        await disconnectManioConnection(owner, disconnect.id); setConnections(await listManioConnections(owner)); setDisconnect(null); setMessage('Leitura desativada. Histórico preservado.');
      })}>Confirmar desconexão</button>
      {error && <Feedback tone="error" announce>{error}</Feedback>}
    </AlertDialogContent></AlertDialog>
  </section>;
}
