import { useEffect, useMemo, useState } from 'react';
import { type Data, money, today } from '../model';
import type { ViewProps } from './shared';
import { PageHeader, Disclosure } from '../components/finance-ui';
import {
  buildMonthlySnapshot,
  closeMonth,
  reopenMonth,
  latestSnapshot,
  periodBounds,
  shiftPeriod,
} from '../services/month-close';
import {
  type MonthlyFinancialSnapshot as Snapshot,
  validPeriod,
} from '../services/reporting-state';
import {
  compareMonths,
  difference,
  movingAverage,
} from '../services/financial-change-explainer';
import {
  generateFinancialTimeline,
  filterTimelineEvents,
  groupTimelineEvents,
  timelineFilters,
  timelineWindow,
} from '../services/financial-timeline';
import {
  loadInflationHistory,
  inflationBetweenMonths,
  type InflationMonth,
} from '../services/inflation-indicators';
import { download } from '../services/storage';
import './reports.css';

const cash = (v: number | null) =>
  v === null ? 'Indisponível' : money(v / 100);
const decimal = (v: number | null, suffix = '') =>
  v === null
    ? 'Indisponível'
    : v.toLocaleString('pt-BR', { maximumFractionDigits: 2 }) + suffix;
const checklist = [
  'Receitas',
  'Despesas',
  'Dívidas',
  'Investimentos',
  'Importações pendentes',
  'Orçamento',
  'Patrimônio',
];
const budgetStatus: Record<string, string> = {
  normal: 'Dentro do orçamento',
  attention: 'Atenção',
  near_limit: 'Próximo do limite',
  over_budget: 'Acima do orçamento',
};
function Metric({ label, amount }: { label: string; amount: number | null }) {
  return (
    <div className="report-line">
      <span>{label}</span>
      <strong>{cash(amount)}</strong>
    </div>
  );
}
function Compare({
  now,
  before,
  title,
  rate,
}: {
  now: Snapshot;
  before?: Snapshot;
  title: string;
  rate: number | null;
}) {
  if (!before)
    return (
      <section>
        <h3>{title}</h3>
        <p>Sem fechamento comparável.</p>
      </section>
    );
  const result = compareMonths(now, before);
  const real =
    rate === null
      ? null
      : Math.round(now.netWorthCents / (1 + rate)) - before.netWorthCents;
  return (
    <section>
      <h3>
        {title} · {before.period}
      </h3>
      <p>
        Comparação nominal entre revisões salvas. Bases parciais ou
        reconstruídas mantêm suas limitações.
      </p>
      {result.metrics.map((r) => (
        <div className="report-line" key={r.label}>
          <span>{r.label}</span>
          <span>
            {cash(r.absolute)} ·{' '}
            {r.percent === null
              ? 'Sem base comparável'
              : decimal(r.percent, '%')}
          </span>
        </div>
      ))}
      <Metric label="Variação patrimonial real entre períodos" amount={real} />
      <p>
        Correção real somente com todos os meses de IPCA observado disponíveis.
      </p>
      <h4>Categorias que mais mudaram</h4>
      {result.categories.slice(0, 6).map((r) => (
        <div className="report-line" key={r.category}>
          <span>
            {r.category}{' '}
            {r.status === 'new'
              ? '· Categoria nova'
              : r.status === 'absent'
                ? '· Ausente neste mês'
                : ''}
          </span>
          <span>
            {cash(r.absolute)} ·{' '}
            {r.percent === null
              ? 'Sem base comparável'
              : decimal(r.percent, '%')}
          </span>
        </div>
      ))}
    </section>
  );
}
export function Reports({
  data: d,
  go,
  commitReport,
}: {
  data: Data;
  go: ViewProps['go'];
  commitReport: (next: Data, expected: Data) => void;
}) {
  const [period, setPeriod] = useState(() =>
    shiftPeriod(today().slice(0, 7), -1),
  );
  const [revision, setRevision] = useState(0);
  const [inflation, setInflation] = useState<InflationMonth[]>([]);
  const [inflationStatus, setInflationStatus] = useState(
    'Carregando IPCA observado',
  );
  const [preview, setPreview] = useState<{
    data: Data;
    period: string;
    inflation: InflationMonth[];
    snapshot?: Snapshot;
    error?: string;
  }>();
  const [checked, setChecked] = useState<string[]>([]),
    [allowPartial, setAllowPartial] = useState(false),
    [confirmReopen, setConfirmReopen] = useState(false);
  const [checkedSource, setCheckedSource] = useState('');
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState('');
  const [filter, setFilter] = useState('Todos'),
    [query, setQuery] = useState(''),
    [timelinePage, setTimelinePage] = useState(0),
    [group, setGroup] = useState<'day' | 'month'>('day');
  const closure = d.reporting.closures.find((c) => c.period === period),
    latest = latestSnapshot(closure);
  const ready =
    preview?.data === d &&
    preview.period === period &&
    preview.inflation === inflation;
  const current = ready ? preview.snapshot : undefined;
  const report =
    (revision
      ? closure?.revisions.find((r) => r.revision === revision)
      : latest) ?? current;
  const stale =
    !!latest && !!current && latest.sourceSignature !== current.sourceSignature;
  const reviewKey = current
    ? current.sourceSignature +
      ':' +
      current.inflationRate +
      ':' +
      current.through
    : '';
  const confirmed = checkedSource === reviewKey ? checked : [];
  const closed = closure?.status === 'closed';
  const valid = validPeriod(period),
    inProgress = valid && periodBounds(period).end >= today();
  useEffect(() => {
    let active = true;
    loadInflationHistory()
      .then((result) => {
        if (active) {
          setInflation(result.months);
          setInflationStatus(
            result.latest.status === 'cached'
              ? 'IPCA em cache'
              : result.latest.status === 'actual'
                ? 'IPCA observado atualizado'
                : 'IPCA indisponível',
          );
        }
      })
      .catch(() => {
        if (active) setInflationStatus('IPCA indisponível');
      });
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    let active = true;
    if (!valid) return;
    buildMonthlySnapshot(d, period, {
      at: today(),
      generatedAt: new Date().toISOString(),
      inflation,
    })
      .then((snapshot) => {
        if (active) setPreview({ data: d, period, inflation, snapshot });
      })
      .catch((error) => {
        if (active)
          setPreview({
            data: d,
            period,
            inflation,
            error:
              error instanceof Error
                ? error.message
                : 'Não foi possível consolidar o mês.',
          });
      });
    return () => {
      active = false;
    };
  }, [d, period, inflation, valid]);
  const history = useMemo(
    () =>
      [...d.reporting.closures].sort((a, b) =>
        b.period.localeCompare(a.period),
      ),
    [d.reporting],
  );
  const events = useMemo(() => generateFinancialTimeline(d), [d]);
  const filtered = useMemo(
    () => filterTimelineEvents(events, filter, query),
    [events, filter, query],
  );
  const window = timelineWindow(filtered, timelinePage);
  const groups = groupTimelineEvents(window.rows, group);
  const saved = history
    .filter((c) => c.status === 'closed')
    .map((c) => latestSnapshot(c)!);
  const snapshotFor = (p: string) => saved.find((s) => s.period === p);
  function selectPeriod(value: string) {
    setPeriod(value);
    setRevision(0);
    setChecked([]);
    setAllowPartial(false);
    setConfirmReopen(false);
    setMessage('');
  }
  async function save() {
    if (!current || busy || confirmed.length !== checklist.length) return;
    setBusy(true);
    setMessage('');
    try {
      const next = await closeMonth(d, period, {
        at: today(),
        generatedAt: new Date().toISOString(),
        inflation,
        allowPartial,
        reprocess: closed,
      });
      commitReport(next, d);
      setRevision(0);
      setChecked([]);
      setAllowPartial(false);
      setMessage('Fechamento salvo. A revisão anterior foi preservada.');
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : 'Não foi possível salvar o fechamento.',
      );
    } finally {
      setBusy(false);
    }
  }
  function reopen() {
    try {
      commitReport(reopenMonth(d, period, new Date().toISOString()), d);
      setConfirmReopen(false);
      setMessage('Mês reaberto. O relatório anterior continua disponível.');
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : 'Não foi possível reabrir.',
      );
    }
  }
  const change = report
    ? difference(report.netWorthCents, report.openingNetWorthCents)
    : null;
  return (
    <div className="reports-page">
      <PageHeader
        title="Relatórios"
        description="Confira o mês, preserve seu fechamento e entenda o que mudou."
      />
      <div className="report-controls report-no-print">
        <label>
          Mês do relatório
          <input
            type="month"
            value={period}
            max={today().slice(0, 7)}
            onChange={(e) => selectPeriod(e.target.value)}
          />
        </label>
        {closure && (
          <label>
            Revisão
            <select
              value={revision}
              onChange={(e) => setRevision(Number(e.target.value))}
            >
              <option value={0}>
                Mais recente · revisão {latest?.revision}
              </option>
              {closure.revisions.map((s) => (
                <option key={s.revision} value={s.revision}>
                  Revisão {s.revision}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      {!valid && <p role="alert">Selecione um mês válido.</p>}
      <output>
        {closed
          ? 'Fechado'
          : closure
            ? 'Reaberto'
            : inProgress
              ? 'Em andamento'
              : 'Aberto'}
        {latest ? ` · revisão ${report?.revision ?? latest.revision}` : ''}
        {stale ? ' · Desatualizado — houve alteração nos dados de origem.' : ''}
      </output>
      <p className="report-no-print">
        {inflationStatus}. Relatórios salvos mantêm a inflação registrada no
        fechamento.
      </p>
      {ready && preview.error && (
        <p role="alert">
          Pendência crítica: {preview.error} O fechamento está bloqueado;
          relatórios salvos permanecem disponíveis.
        </p>
      )}
      {message && <output>{message}</output>}
      {report ? (
        <>
          <section className="report-summary" aria-label="Resumo mensal">
            <h2>
              {report.period} · {latest ? 'Relatório salvo' : 'Prévia'}
            </h2>
            <p>
              {report.dataCompleteness === 'complete'
                ? 'Base completa'
                : report.dataCompleteness === 'partial'
                  ? 'Base parcial'
                  : 'Base insuficiente'}{' '}
              · realizado até {report.through}
            </p>
            <Metric label="Receitas" amount={report.incomeCents} />
            <Metric
              label="Despesas e manutenção"
              amount={report.expenseCents}
            />
            <Metric
              label="Resultado do caixa"
              amount={report.netCashFlowCents}
            />
            <Metric label="Patrimônio final" amount={report.netWorthCents} />
            <p>
              Gerado em {new Date(report.generatedAt).toLocaleString('pt-BR')}
            </p>
            <div className="report-no-print report-buttons">
              <button type="button" onClick={() => globalThis.print()}>
                Imprimir relatório
              </button>
              <button
                type="button"
                onClick={() => {
                  try {
                    download(
                      JSON.stringify(report, null, 2),
                      `rota-relatorio-${period}-rev-${report.revision}.json`,
                    );
                  } catch {
                    setMessage(
                      'Não foi possível baixar o relatório neste navegador.',
                    );
                  }
                }}
              >
                Baixar relatório JSON
              </button>
            </div>
          </section>
          <Disclosure title="Movimentos do mês">
            <h3>Receitas e investimentos</h3>
            <Metric label="Trabalho" amount={report.workIncomeCents} />
            <Metric label="Outras receitas" amount={report.otherIncomeCents} />
            <Metric
              label="Aportes (transferência para investimentos)"
              amount={report.investmentContributionsCents}
            />
            <Metric
              label="Resgates (não são renda nova)"
              amount={report.investmentWithdrawalsCents}
            />
            <Metric
              label="Rendimentos e perdas registrados"
              amount={report.investmentReturnCents}
            />
            <p>Alocações internas não geram receita nem despesa patrimonial.</p>
            <h3>Despesas por natureza</h3>
            {Object.entries(report.expenseGroups).map(([label, amount]) => (
              <Metric key={label} label={label} amount={amount} />
            ))}
            <h3>Dívidas</h3>
            <Metric
              label="Pagamentos (separados das despesas)"
              amount={report.debtPaymentsCents}
            />
            <Metric
              label="Principal pago identificado"
              amount={report.debtPrincipalReductionCents}
            />
            <Metric
              label="Juros pagos identificados"
              amount={report.debtInterestCents}
            />
            <h3>Caixa</h3>
            <Metric label="Caixa inicial" amount={report.openingCashCents} />
            <Metric label="Caixa final" amount={report.closingCashCents} />
            <h3>Categorias</h3>
            {Object.entries(report.categories).map(([label, amount]) => (
              <Metric key={label} label={label} amount={amount} />
            ))}
          </Disclosure>
          <Disclosure title="O que mudou no patrimônio?">
            <p>
              Seu patrimônio variou {cash(change!.absolute)} (
              {change!.percent === null
                ? 'sem base percentual comparável'
                : decimal(change!.percent, '%')}
              ).
            </p>
            <Metric
              label="Patrimônio inicial"
              amount={report.openingNetWorthCents}
            />
            {report.bridge.map((r) => (
              <Metric key={r.label} label={r.label} amount={r.amountCents} />
            ))}
            {report.unexplainedCents !== 0 && (
              <p>
                {cash(report.unexplainedCents)} da variação não pôde ser
                atribuída com precisão.
              </p>
            )}
            <Metric label="Ativos brutos" amount={report.grossAssetsCents} />
            <Metric label="Passivos" amount={report.liabilitiesCents} />
            <Metric label="Patrimônio final" amount={report.netWorthCents} />
            <p>
              IPCA observado no mês:{' '}
              {decimal(
                report.inflationRate === null
                  ? null
                  : report.inflationRate * 100,
                '%',
              )}
              . Fonte: IBGE · Banco Central SGS 433.
            </p>
            <Metric
              label="Patrimônio final em poder de compra do início do mês"
              amount={report.realNetWorthCents}
            />
            <Metric
              label="Variação real"
              amount={
                report.realNetWorthCents === null
                  ? null
                  : report.realNetWorthCents - report.openingNetWorthCents
              }
            />
            <p>
              Não substituímos IPCA mensal por expectativas ou IPCA de 12 meses.
              Avaliações patrimoniais e parâmetros reconstruídos podem ser
              estimados.
            </p>
          </Disclosure>
          <Disclosure title="Trabalho, orçamento e reserva">
            <h3>Trabalho · meta reconstruída estimada</h3>
            <Metric
              label="Meta do mês"
              amount={report.workSummary.targetCents}
            />
            <Metric
              label="Realizado"
              amount={report.workSummary.realizedCents}
            />
            <p>
              {report.workSummary.days} dias registrados ·{' '}
              {decimal(report.workSummary.percent, '% da meta')}
            </p>
            <Metric
              label="Média por dia trabalhado"
              amount={report.workSummary.dailyCents}
            />
            <h3>Orçamento · configuração usada no fechamento</h3>
            {report.budgetSummary.length ? (
              report.budgetSummary.map((r) => (
                <div key={r.category}>
                  <p>
                    {r.category} · {budgetStatus[r.status] ?? r.status}
                  </p>
                  <Metric label="Realizado" amount={r.actualCents} />
                  <Metric label="Limite" amount={r.limitCents} />
                  <Metric
                    label="Disponível"
                    amount={r.limitCents - r.actualCents}
                  />
                </div>
              ))
            ) : (
              <p>Sem orçamento configurado.</p>
            )}
            <h3>Reserva · cobertura estimada</h3>
            <p>
              Antes: {decimal(report.reserveSummary.before, ' meses')} · depois:{' '}
              {decimal(report.reserveSummary.after, ' meses')} · diferença:{' '}
              {decimal(
                difference(
                  report.reserveSummary.after,
                  report.reserveSummary.before,
                ).absolute,
                ' meses',
              )}
            </p>
            <Metric
              label="Reserva no início"
              amount={report.reserveSummary.beforeCents}
            />
            <Metric
              label="Reserva no fim"
              amount={report.reserveSummary.afterCents}
            />
            <Metric
              label="Assinaturas/recorrências detectadas · estimativa mensal"
              amount={report.subscriptionCents}
            />
            <Metric
              label="Compromissos recorrentes do período · valores conhecidos"
              amount={report.recurringCommitmentsCents}
            />
            <p>
              {report.importedCount} registros importados ou conciliados. O
              preview de importação não fica pendente após sair da página.
            </p>
          </Disclosure>
          <Disclosure title="Comparações e médias">
            <Compare
              now={report}
              before={snapshotFor(shiftPeriod(period, -1))}
              title="Mês anterior"
              rate={report.inflationRate}
            />
            <Compare
              now={report}
              before={snapshotFor(shiftPeriod(period, -12))}
              title="Mesmo mês do ano anterior"
              rate={inflationBetweenMonths(
                inflation,
                shiftPeriod(period, -11),
                period,
              )}
            />
            <h3>Médias móveis de fechamentos</h3>
            {([3, 6, 12] as const).map((count) => {
              const avg = movingAverage(saved, period, count);
              return (
                <section key={count}>
                  <h4>{count} meses</h4>
                  {avg ? (
                    <>
                      <Metric
                        label="Receitas médias"
                        amount={avg.incomeCents}
                      />
                      <Metric
                        label="Despesas médias"
                        amount={avg.expenseCents}
                      />
                    </>
                  ) : (
                    <p>Histórico contínuo insuficiente.</p>
                  )}
                </section>
              );
            })}
          </Disclosure>
          <Disclosure title="Qualidade dos dados">
            <p>
              O fechamento registra a base disponível; não certifica registros
              que nunca foram lançados.
            </p>
            {report.warnings.length ? (
              <ul>
                {report.warnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            ) : (
              <p>Nenhuma pendência detectada na base disponível.</p>
            )}
          </Disclosure>
        </>
      ) : valid && !preview?.error ? (
        <output>Consolidando mês…</output>
      ) : null}
      <section className="report-no-print" aria-label="Fechamento mensal">
        <h2>{closed ? 'Revisar fechamento' : 'Fechar mês'}</h2>
        {current && (
          <>
            <p>
              Confira os dados atuais antes de salvar uma revisão. Nenhum
              lançamento será bloqueado ou apagado.
            </p>
            <ul>
              {current.warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
            <fieldset disabled={busy || inProgress}>
              <legend>Checklist de conferência</legend>
              {checklist.map((label) => (
                <label className="report-check" key={label}>
                  <input
                    type="checkbox"
                    checked={confirmed.includes(label)}
                    onChange={(e) => {
                      setCheckedSource(reviewKey);
                      setChecked(
                        e.target.checked
                          ? [...confirmed, label]
                          : confirmed.filter((v) => v !== label),
                      );
                    }}
                  />
                  Conferi {label.toLocaleLowerCase('pt-BR')}
                </label>
              ))}
            </fieldset>
            {current.dataCompleteness !== 'complete' && (
              <label className="report-check">
                <input
                  type="checkbox"
                  checked={allowPartial}
                  onChange={(e) => setAllowPartial(e.target.checked)}
                />
                Confirmo o fechamento com dados parciais
              </label>
            )}
            <button
              type="button"
              disabled={
                busy ||
                inProgress ||
                confirmed.length !== checklist.length ||
                (current.dataCompleteness !== 'complete' && !allowPartial)
              }
              onClick={() => void save()}
            >
              {busy ? 'Salvando…' : closed ? 'Reprocessar mês' : 'Fechar mês'}
            </button>
            {inProgress && (
              <p>
                Em andamento. O fechamento estará disponível após o fim do mês.
              </p>
            )}
          </>
        )}
        {closed && (
          <details>
            <summary>Reabrir mês</summary>
            <p>
              Alterações posteriores podem mudar o relatório histórico. A
              revisão salva será preservada.
            </p>
            <label className="report-check">
              <input
                type="checkbox"
                checked={confirmReopen}
                onChange={(e) => setConfirmReopen(e.target.checked)}
              />
              Entendi e quero reabrir
            </label>
            <button
              type="button"
              disabled={!confirmReopen || busy}
              onClick={reopen}
            >
              Confirmar reabertura
            </button>
          </details>
        )}
        {closure && (
          <p>
            Última reabertura:{' '}
            {closure.reopenedAt
              ? new Date(closure.reopenedAt).toLocaleString('pt-BR')
              : 'nenhuma'}{' '}
            · último reprocessamento:{' '}
            {closure.regeneratedAt
              ? new Date(closure.regeneratedAt).toLocaleString('pt-BR')
              : 'nenhum'}
          </p>
        )}
      </section>
      <div className="report-no-print">
        <Disclosure title="Histórico de fechamentos">
          <label>
            Mês fechado
            <select
              value={closure ? period : ''}
              onChange={(e) => {
                if (e.target.value) selectPeriod(e.target.value);
              }}
            >
              <option value="">Selecionar fechamento</option>
              {history.map((c) => (
                <option key={c.period} value={c.period}>
                  {c.period} · {c.status === 'closed' ? 'Fechado' : 'Reaberto'}{' '}
                  · revisão {c.revisions.length}
                </option>
              ))}
            </select>
          </label>
          {!history.length && <p>Seu primeiro fechamento aparecerá aqui.</p>}
        </Disclosure>
      </div>
      <section
        className="report-timeline report-no-print"
        aria-label="Timeline financeira"
      >
        <h2>Timeline financeira</h2>
        <p>
          Histórico dos dados atuais. Relatórios salvos conservam seus valores
          originais.
        </p>
        <div className="report-controls">
          <label>
            Buscar na timeline
            <input
              type="search"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setTimelinePage(0);
              }}
            />
          </label>
          <label>
            Filtrar eventos
            <select
              value={filter}
              onChange={(e) => {
                setFilter(e.target.value);
                setTimelinePage(0);
              }}
            >
              {timelineFilters.map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
          </label>
          <label>
            Agrupar por
            <select
              value={group}
              onChange={(e) => setGroup(e.target.value as 'day' | 'month')}
            >
              <option value="day">Dia</option>
              <option value="month">Mês</option>
            </select>
          </label>
        </div>
        <output>
          {filtered.length} eventos · página {window.page + 1} de {window.pages}
        </output>
        {[...groups].map(([key, rows]) => (
          <section key={key}>
            <h3>{key}</h3>
            {rows.map((e) => (
              <details key={e.id} className="timeline-event">
                <summary>
                  <span>{e.title}</span>
                  <span>
                    {e.amountCents === undefined
                      ? 'Sem movimento de caixa'
                      : cash(e.amountCents)}{' '}
                    ·{' '}
                    {e.direction === 'neutral'
                      ? 'Neutro'
                      : e.direction === 'in'
                        ? 'Entrada'
                        : 'Saída'}
                  </span>
                </summary>
                <p>Origem: {e.origin}</p>
                <p>Referência: {e.reference}</p>
                <p>Data: {e.date}</p>
              </details>
            ))}
          </section>
        ))}
        {!filtered.length && (
          <p>Nenhum evento encontrado. Registre um lançamento para começar.</p>
        )}
        <div className="report-buttons">
          <button
            type="button"
            disabled={window.page === 0}
            onClick={() => setTimelinePage(window.page - 1)}
          >
            Eventos anteriores
          </button>
          <button
            type="button"
            disabled={window.page + 1 === window.pages}
            onClick={() => setTimelinePage(window.page + 1)}
          >
            Próximos eventos
          </button>
          <button type="button" onClick={() => go('Importar')}>
            Abrir importações
          </button>
        </div>
      </section>
    </div>
  );
}
