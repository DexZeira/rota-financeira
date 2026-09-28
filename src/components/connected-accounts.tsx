import { useMemo, useState, useSyncExternalStore } from 'react';
import { categories, money, type Data } from '../model';
import {
  emptyOpenFinance,
  type Connection,
  type Institution,
} from '../services/open-finance/types';
import { MockOpenFinanceProvider } from '../services/open-finance/mock-provider';
import { OpenFinanceSyncService } from '../services/open-finance/sync';
import { errorCode, errorMessage } from '../services/open-finance/errors';
import {
  reconcileTransfer,
  deleteConnectionData,
  reconcileRemote,
  reviewTransactions,
} from '../services/open-finance/reconciliation';
import type { Review } from '../services/import/types';
import { recordDiagnostic } from '../services/app-diagnostics';
import { transactionPage } from '../services/open-finance/state';

const subscribeNetwork = (notify: () => void) => {
  window.addEventListener('online', notify);
  window.addEventListener('offline', notify);
  return () => {
    window.removeEventListener('online', notify);
    window.removeEventListener('offline', notify);
  };
};
const labels = {
  disconnected: 'Desconectado',
  pending_authorization: 'Aguardando autorização',
  connected: 'Conectado',
  syncing: 'Sincronizando',
  expired: 'Consentimento expirado',
  revoked: 'Revogado',
  error: 'Erro',
  reauthorization_required: 'Renovar acesso',
};
export function ConnectedAccounts({
  data,
  owner,
  onSave,
}: {
  data: Data;
  owner: string;
  onSave: (next: Data, base: Data) => Promise<void>;
}) {
  const online = useSyncExternalStore(
    subscribeNetwork,
    () => navigator.onLine,
    () => true,
  );
  const [chosenCategories, setChosenCategories] = useState<
    Record<string, string>
  >({});
  const mode = import.meta.env.VITE_OPEN_FINANCE_MODE || 'disabled';
  const provider = useMemo(() => new MockOpenFinanceProvider(), []);
  const sync = useMemo(() => new OpenFinanceSyncService(provider), [provider]);
  const [institutions, setInstitutions] = useState<Institution[]>([]),
    [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState('');
  const [days, setDays] = useState<30 | 90 | 365>(30),
    [page, setPage] = useState(0);
  const state = data.openFinance || emptyOpenFinance();
  const own = state.connections.filter((c) => c.userId === owner);
  const {
    total,
    page: currentPage,
    rows,
  } = useMemo(
    () => transactionPage(data.openFinance, owner, page),
    [data.openFinance, owner, page],
  );
  const reviewable = rows.filter((r) => !r.reviewed && r.status === 'posted');
  const previews = useMemo(
    () =>
      reviewTransactions(
        data,
        rows
          .filter((r) => !r.reviewed && r.status === 'posted')
          .map((r) => r.id),
      ),
    [data, rows],
  );
  const previewsById = new Map(reviewable.map((r, i) => [r.id, previews[i]]));
  const save = (next: typeof state) =>
    onSave(
      { ...data, openFinanceVersion: 1, planningVersion: 9, openFinance: next },
      data,
    );
  async function run(action: () => Promise<void>) {
    setBusy(true);
    setMessage('');
    try {
      await action();
    } catch (e) {
      setMessage(
        e instanceof Error && !('code' in e)
          ? e.message
          : errorMessage[errorCode(e)],
      );
      recordDiagnostic('runtime', new Error());
    } finally {
      setBusy(false);
    }
  }
  async function update(c: Connection, action: 'authorize' | 'revoke') {
    const updated =
      action === 'authorize'
        ? await provider.authorize(c, owner)
        : await provider.revokeConsent(c, owner);
    await save({
      ...state,
      connections: state.connections.map((v) => (v.id === c.id ? updated : v)),
    });
  }
  const review = (
    id: string,
    action: Review['action'],
    recordKind: Review['recordKind'] = '',
    recordId = '',
  ) =>
    run(async () => {
      await onSave(
        await reconcileRemote(data, id, {
          action,
          recordKind,
          recordId,
          category:
            chosenCategories[id] ||
            previewsById.get(id)?.category.category ||
            'outras',
          override: false,
          remember: false,
        }),
        data,
      );
    });
  if (mode !== 'mock')
    return (
      <p>
        Integração bancária desabilitada. Provider real e ambiente sandbox ainda
        não configurados. A importação CSV/OFX continua disponível.
      </p>
    );
  return (
    <section
      className="connected-accounts"
      aria-label="Contas conectadas"
      aria-busy={busy}
    >
      <p>
        <strong>Demonstração local — dados fictícios.</strong> Nenhum banco será
        acessado. Os lançamentos confirmados entram no seu estado local; use um
        perfil de teste.
      </p>
      {!online && (
        <output>Sem conexão — exibindo dados da última sincronização.</output>
      )}
      <fieldset disabled={busy}>
        <p aria-live="polite">
          {busy ? 'Sincronizando ou salvando alterações…' : ''}
        </p>
        <legend>Conectar instituição</legend>
        <button
          onClick={() =>
            run(async () => setInstitutions(await provider.listInstitutions()))
          }
        >
          Conectar instituição
        </button>
        {!!institutions.length && (
          <div>
            <label>
              Buscar instituição
              <input value={query} onChange={(e) => setQuery(e.target.value)} />
            </label>
            {institutions
              .filter((i) =>
                i.name.toLocaleLowerCase().includes(query.toLocaleLowerCase()),
              )
              .map((i) => (
                <button
                  key={i.id}
                  onClick={() =>
                    run(async () => {
                      const c = await provider.createConnection(owner, i);
                      await save({
                        ...state,
                        connections: [...state.connections, c],
                      });
                      setInstitutions([]);
                    })
                  }
                >
                  {i.name}
                </button>
              ))}
          </div>
        )}
        <label>
          Período inicial
          <select
            value={days}
            onChange={(e) => setDays(Number(e.target.value) as 30 | 90 | 365)}
          >
            <option value={30}>30 dias</option>
            <option value={90}>90 dias</option>
            <option value={365}>12 meses</option>
          </select>
        </label>
        {own.map((c) => (
          <article key={c.id}>
            <h3>{c.institutionName}</h3>
            <p>
              {labels[c.status]} ·{' '}
              {c.lastSuccessfulSyncAt
                ? `Última sincronização: ${new Date(c.lastSuccessfulSyncAt).toLocaleString('pt-BR')}`
                : 'Nunca sincronizado'}
            </p>
            <p>
              Consentimento:{' '}
              {c.consentStatus === 'authorized'
                ? 'Autorizado'
                : c.consentStatus === 'revoked'
                  ? 'Revogado'
                  : c.consentStatus === 'expired'
                    ? 'Expirado'
                    : 'Pendente'}
              {c.expiresAt
                ? ` · Expira em ${new Date(c.expiresAt).toLocaleDateString('pt-BR')}`
                : ''}
            </p>
            {c.errorCode && <output>{errorMessage[c.errorCode]}</output>}
            {c.status !== 'connected' && c.status !== 'error' && (
              <div>
                <p>
                  Autorizar somente leitura de contas, saldos e transações. Sem
                  pagamentos. Revogue quando quiser.
                </p>
                <button onClick={() => run(() => update(c, 'authorize'))}>
                  {c.status === 'pending_authorization'
                    ? 'Autorizar demonstração'
                    : 'Renovar acesso'}
                </button>
              </div>
            )}
            {['connected', 'error'].includes(c.status) && (
              <button
                onClick={() =>
                  run(async () => {
                    await save(
                      await sync.synchronize(state, c.id, owner, days, online),
                    );
                  })
                }
              >
                Sincronizar agora
              </button>
            )}
            {c.status === 'revoked' && (
              <button
                onClick={() =>
                  run(async () => {
                    if (
                      window.prompt(
                        'Excluir os dados sincronizados e lançamentos criados exclusivamente por esta conexão? Registros conciliados preexistentes e relatórios fechados serão preservados. Digite EXCLUIR.',
                      ) === 'EXCLUIR'
                    )
                      await onSave(
                        deleteConnectionData(data, c.id, owner),
                        data,
                      );
                  })
                }
              >
                Excluir dados importados
              </button>
            )}
            {c.status !== 'revoked' && (
              <button
                onClick={() =>
                  run(async () => {
                    if (
                      window.confirm(
                        'Revogar acesso? Os dados já importados serão preservados.',
                      )
                    )
                      await update(c, 'revoke');
                  })
                }
              >
                Revogar acesso
              </button>
            )}
            {state.accounts
              .filter((a) => a.connectionId === c.id)
              .map((a) => {
                const b = state.balances.find((v) => v.accountId === a.id);
                return (
                  <div key={a.id}>
                    <h4>
                      {a.name} {a.maskedNumber}
                    </h4>
                    <p>
                      Saldo bancário:{' '}
                      {b?.current === null || b?.current === undefined
                        ? 'Indisponível'
                        : a.currency === 'BRL'
                          ? money(b.current / 100)
                          : `${b.current / 100} ${a.currency}`}
                    </p>
                    {b && (
                      <p>
                        Saldo consultado em{' '}
                        {new Date(b.asOf).toLocaleString('pt-BR')}
                        {Date.now() - Date.parse(b.asOf) > 86400000
                          ? ' · Desatualizado'
                          : ''}
                      </p>
                    )}
                    <p>
                      Saldo informado no Rota: não há saldo individual por
                      conta. Diferença indisponível; o saldo bancário não altera
                      seu caixa.
                    </p>
                  </div>
                );
              })}
          </article>
        ))}
        <h3>Revisar transações</h3>
        <p>
          {total} registros · Exibindo até 25 por página. Pendentes não geram
          movimentação.
        </p>
        {rows.map((r) => {
          const p = previewsById.get(r.id);
          const account = state.accounts.find((a) => a.id === r.accountId);
          return (
            <article key={r.id}>
              <strong>{r.transaction.description}</strong>
              <p>
                {r.transaction.date} ·{' '}
                {r.transaction.direction === 'debit' ? 'Saída' : 'Entrada'}{' '}
                {account?.currency === 'BRL'
                  ? money(r.transaction.amountCents / 100)
                  : `${r.transaction.amountCents / 100} ${account?.currency}`}{' '}
                · {r.status === 'pending' ? 'Pendente' : 'Efetivada'} ·{' '}
                {r.kind === 'refund'
                  ? 'Reembolso'
                  : r.kind === 'reversal'
                    ? 'Estorno'
                    : 'Movimentação'}{' '}
                · {r.reviewed ? 'Revisada' : 'Revisão necessária'}
              </p>
              {!r.reviewed && r.status === 'posted' && (
                <div>
                  {r.importLinkId && (
                    <p>
                      A fonte corrigiu um registro conciliado. Confira o
                      lançamento existente antes de encerrar a revisão; ele não
                      será alterado automaticamente.
                    </p>
                  )}
                  {!r.importLinkId && r.transaction.direction === 'debit' && (
                    <label>
                      Categoria
                      <select
                        value={
                          chosenCategories[r.id] ||
                          p?.category.category ||
                          'outras'
                        }
                        onChange={(e) =>
                          setChosenCategories({
                            ...chosenCategories,
                            [r.id]: e.target.value,
                          })
                        }
                      >
                        {categories.map((c) => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                  {!r.importLinkId &&
                    !p?.duplicate &&
                    !p?.candidates.length && (
                      <button onClick={() => review(r.id, 'create')}>
                        Importar lançamento
                      </button>
                    )}
                  {p?.candidates
                    .filter((v) => !['debts', 'recurrences'].includes(v.kind))
                    .slice(0, 5)
                    .map((v) => (
                      <button
                        key={v.kind + v.id}
                        onClick={() =>
                          review(
                            r.id,
                            'match',
                            v.kind as Review['recordKind'],
                            v.id,
                          )
                        }
                      >
                        Conciliar com {v.name}
                      </button>
                    ))}
                  {p?.transferLines.map((line) => {
                    const other = previews.find(
                      (v) => v.line === line,
                    )?.transaction;
                    const target = reviewable[line - 1];
                    return target ? (
                      <button
                        key={line}
                        onClick={() =>
                          run(async () => {
                            await onSave(
                              await reconcileTransfer(data, r.id, target.id),
                              data,
                            );
                          })
                        }
                      >
                        Conciliar transferência com {other?.accountLabel}
                      </button>
                    ) : null;
                  })}
                  {p?.duplicate?.link.recordId && (
                    <button
                      onClick={() =>
                        review(
                          r.id,
                          'match',
                          p.duplicate!.link.recordKind,
                          p.duplicate!.link.recordId,
                        )
                      }
                    >
                      Conciliar com registro importado
                    </button>
                  )}
                  <button onClick={() => review(r.id, 'ignore')}>
                    Ignorar
                  </button>
                </div>
              )}
            </article>
          );
        })}
        <button
          disabled={currentPage === 0}
          onClick={() => setPage(currentPage - 1)}
        >
          Página anterior
        </button>
        <button
          disabled={(currentPage + 1) * 25 >= total}
          onClick={() => setPage(currentPage + 1)}
        >
          Próxima página
        </button>
      </fieldset>
      <output>{busy ? 'Processando…' : message}</output>
    </section>
  );
}
