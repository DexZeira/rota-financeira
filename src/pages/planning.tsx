import { useMemo, useState } from 'react';
import { type Row, emptyRow, id, today, money, brDate, labels } from '../model';
import {
  PageHeader,
  HeroMetric,
  FinancialItem,
  EmptyState,
} from '../components/finance-ui';
import { FinancialQueryService } from '../services/financial-query';
import { type CashEvent } from '../services/cash-flow';
import { addMonths } from '../calculations';
import { realizedCollections, recurrenceAt } from '../services/recurrences';
import { type ViewProps, value } from './shared';
import './planning.css';

const sources: Record<string, string> = {
  recurrences: 'Regra cadastrada',
  expenses: 'Gasto recorrente',
  debts: 'Dívida',
  maintenance: 'Manutenção',
  plans: 'Plano',
  investments: 'Investimento',
  work: 'Trabalho',
  payments: 'Pagamento',
  movements: 'Movimentação',
  services: 'Serviço',
  planTransactions: 'Plano',
};
function EventItem({
  event,
  at,
  children,
}: {
  event: CashEvent;
  at: string;
  children?: React.ReactNode;
}) {
  return (
    <FinancialItem
      title={event.name}
      value={
        event.amount === null
          ? 'Indisponível'
          : `${event.direction === 'entrada' ? '+' : '−'} ${money(event.amount)}`
      }
      description={`${brDate(event.originalDate)} · ${event.status}${event.originalDate < at && event.status !== 'realizado' ? ' · Atrasado' : ''}`}
      context={`Origem: ${sources[event.source] || event.source} · ${event.impact === 'caixa' ? 'impacta caixa' : event.impact === 'alocação' ? 'alocação, sem nova saída' : 'aviso, sem movimento automático'}${event.account ? ` · ${event.account}` : ''}`}
    >
      {children}
    </FinancialItem>
  );
}
function ReconcileOccurrence({
  event,
  ...p
}: ViewProps & { event: CashEvent }) {
  const [selected, setSelected] = useState('');
  const currentRule = p.data.recurrences.find(
    (r) => r.id === event.recurrenceId,
  );
  const rule = currentRule
    ? recurrenceAt(currentRule, event.originalDate)
    : undefined;
  const types: Record<string, string> = {
    despesa: 'expenses',
    receita: 'work',
    aporte: 'movements',
    dívida: 'payments',
    plano: 'planTransactions',
    manutenção: 'services',
  };
  const key = realizedCollections.find((k) => k === types[String(rule?.kind)]);
  const refs: Record<string, string> = {
    debts: 'debtId',
    investments: 'investmentId',
    maintenance: 'maintenanceId',
    plans: 'planId',
  };
  const ref = refs[String(rule?.sourceKind)];
  const records = key
    ? p.data[key].filter(
        (r) =>
          (!ref || r[ref] === rule?.sourceId) &&
          !p.data.forecastResolutions.some(
            (s) =>
              s.action === 'vincular' &&
              s.recordKind === key &&
              s.recordId === r.id,
          ) &&
          (key !== 'movements' || r.kind === 'aporte') &&
          (key !== 'planTransactions' || r.kind === 'deposit'),
      )
    : [];
  function resolve(action: string) {
    p.update('forecastResolutions', {
      ...emptyRow('forecastResolutions'),
      id: id(),
      recurrenceId: event.recurrenceId!,
      occurrenceDate: event.originalDate,
      action,
      recordKind: key || 'expenses',
      recordId: action === 'vincular' ? selected : '',
    });
  }
  return (
    <details className="disclosure">
      <summary>Conferir ocorrência</summary>
      <p className="inline-note">
        Relacionar confirma que um lançamento já registrado atende esta
        ocorrência. O saldo realizado não é alterado. Valores e datas podem
        diferir: revise antes de confirmar.
      </p>
      <label>
        <span>Registro realizado para {event.name}</span>
        <select value={selected} onChange={(e) => setSelected(e.target.value)}>
          <option value="">Selecione um lançamento</option>
          {records.map((r) => (
            <option key={r.id} value={r.id}>
              {brDate(r.date)} · {String(r.name || r.activity || labels[key!])}{' '}
              · {money(Number(r.amount ?? r.revenue))}
            </option>
          ))}
        </select>
      </label>
      <div className="row-actions">
        <button disabled={!selected} onClick={() => resolve('vincular')}>
          Relacionar realizado
        </button>
        <button onClick={() => resolve('ignorar')}>
          Ignorar esta ocorrência
        </button>
      </div>
      <p className="inline-note">
        Ignorar cancela somente esta previsão. Você pode desfazer na lista de
        conferências. Receita prevista pode representar salário, mas seu
        recebimento ainda deve ser tratado no módulo de registro apropriado; não
        crie trabalho fictício.
      </p>
    </details>
  );
}
export function Planning(p: ViewProps) {
  const at = today();
  const [section, setSection] = useState('Fluxo'),
    [horizon, setHorizon] = useState(30),
    [month, setMonth] = useState(at.slice(0, 7)),
    [selectedDate, setSelectedDate] = useState(at),
    [limit, setLimit] = useState(30);
  const query = useMemo(
    () => new FinancialQueryService(p.data, at),
    [p.data, at],
  );
  const forecast = useMemo(
    () => query.getCashFlowForecast(horizon),
    [query, horizon],
  );
  const calendar = useMemo(
    () => (section === 'Calendário' ? query.getCalendar(month) : null),
    [query, month, section],
  );
  const chosenDay = calendar?.days.find((d) => d.date === selectedDate);
  const amount = (n: number | null) => (n === null ? 'Indisponível' : money(n));
  function editRule(row?: Row) {
    p.edit('recurrences', row);
  }
  return (
    <>
      <PageHeader
        title="Planejamento"
        description="Compromissos e caixa futuro, com hipóteses à vista."
        action={
          <button className="primary" onClick={() => editRule()}>
            Nova recorrência
          </button>
        }
      />
      <nav className="planning-tabs" aria-label="Seções do planejamento">
        {['Fluxo', 'Calendário', 'Recorrências'].map((s) => (
          <button
            key={s}
            aria-pressed={section === s}
            onClick={() => setSection(s)}
          >
            {s}
          </button>
        ))}
      </nav>
      {section === 'Fluxo' && (
        <>
          <div className="planning-tabs" aria-label="Horizonte da projeção">
            {[0, 7, 15, 30, 60, 90].map((days) => (
              <button
                key={days}
                aria-pressed={horizon === days}
                onClick={() => {
                  setHorizon(days);
                  setLimit(30);
                }}
              >
                {days === 0 ? 'Hoje' : `${days} dias`}
              </button>
            ))}
          </div>
          <HeroMetric
            label={`Saldo de caixa projetado · ${brDate(forecast.end)}`}
            value={amount(forecast.projectedBalance)}
            context={
              forecast.complete
                ? 'Previsão condicionada às ocorrências abaixo; não é renda garantida.'
                : 'Existem valores desconhecidos ou projeção incompleta.'
            }
          />
          <div className="inline-stats">
            {value('Caixa realizado atual', money(forecast.initialBalance))}
            {value('Menor saldo projetado', amount(forecast.minimumBalance))}
            {value(
              'Data do menor saldo',
              forecast.minimumDate
                ? brDate(forecast.minimumDate)
                : 'Indisponível',
            )}
            {value(
              'Entradas previstas · valores conhecidos',
              money(forecast.income),
            )}
            {value(
              'Saídas previstas · valores conhecidos',
              money(forecast.outflow),
            )}
          </div>
          <details className="disclosure">
            <summary>Composição e limites da previsão</summary>
            <p>
              O ponto inicial é o caixa realizado, antes de separar a reserva da
              moto. Parcelas atrasadas entram hoje como hipótese de quitação,
              com a data original preservada. Compromissos sem valor tornam o
              saldo final indisponível; a soma parcial conhecida é{' '}
              {money(forecast.knownBalance)}.
            </p>
            <ul>
              {forecast.warnings.map((warning, i) => (
                <li key={i}>{warning}</li>
              ))}
            </ul>
            <p>
              Vincule uma regra à origem para substituir sua previsão
              automática. Contas são identificações textuais nesta fase, sem
              saldos independentes.
            </p>
          </details>
          <h2>Ocorrências do horizonte</h2>
          <p className="inline-note">
            {forecast.complete
              ? 'Projeção com valores conhecidos'
              : 'Projeção parcial'}
            {` · ${forecast.forecastCompleteness.knownCount}/${forecast.forecastCompleteness.totalCount} compromissos de caixa com data e valor conhecidos.`}
            {forecast.forecastCompleteness.unknownAmountCount > 0 &&
              ` ${forecast.forecastCompleteness.unknownAmountCount} sem valor definido.`}
            {forecast.forecastCompleteness.missingDateCount > 0 &&
              ` ${forecast.forecastCompleteness.missingDateCount} sem data ou parcela definida.`}
          </p>
          {!forecast.events.length && (
            <EmptyState
              title="Nenhuma ocorrência identificada"
              description="Cadastre receita prevista, conta, assinatura ou outro compromisso com data."
              action={
                <button onClick={() => editRule()}>Planejar compromisso</button>
              }
            />
          )}
          {forecast.events.slice(0, limit).map((event) => (
            <EventItem key={event.id} event={event} at={at}>
              {event.recurrenceId && (
                <ReconcileOccurrence {...p} event={event} />
              )}
            </EventItem>
          ))}
          {forecast.events.length > limit && (
            <button onClick={() => setLimit((n) => n + 30)}>
              Mostrar mais ocorrências
            </button>
          )}
        </>
      )}
      {section === 'Calendário' && calendar && (
        <>
          <div className="planning-month">
            <button
              aria-label="Mês anterior"
              onClick={() => {
                const m = addMonths(month + '-01', -1).slice(0, 7);
                setMonth(m);
                setSelectedDate(m + '-01');
              }}
            >
              Anterior
            </button>
            <h2>
              {new Date(month + '-01T12:00:00').toLocaleDateString('pt-BR', {
                month: 'long',
                year: 'numeric',
              })}
            </h2>
            <button
              aria-label="Próximo mês"
              onClick={() => {
                const m = addMonths(month + '-01', 1).slice(0, 7);
                setMonth(m);
                setSelectedDate(m + '-01');
              }}
            >
              Próximo
            </button>
          </div>
          <div className="planning-calendar" aria-label="Dias do calendário">
            {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map((d) => (
              <span key={d}>{d}</span>
            ))}
            {Array.from(
              { length: new Date(month + '-01T12:00:00Z').getUTCDay() },
              (_, i) => (
                <span key={'blank-' + i} aria-hidden="true" />
              ),
            )}
            {calendar.days.map((d) => {
              const events = calendar.events.filter((e) => e.date === d.date);
              const count = events.length;
              const statuses = [
                ...new Set(
                  events.map((e) => (e.overdue ? 'atrasado' : e.status)),
                ),
              ].join(', ');
              return (
                <button
                  key={d.date}
                  aria-pressed={selectedDate === d.date}
                  aria-label={`${brDate(d.date)}, ${count} ocorrências${statuses ? `: ${statuses}` : ''}`}
                  onClick={() => setSelectedDate(d.date)}
                >
                  <span>{Number(d.date.slice(-2))}</span>
                  {count > 0 && <small>{count}</small>}
                </button>
              );
            })}
          </div>
          <section aria-label="Detalhes do dia">
            <h3>{brDate(selectedDate)}</h3>
            <p>
              {chosenDay?.status === 'realizado'
                ? 'Caixa realizado no fim do dia'
                : 'Caixa projetado no fim do dia'}
              : <strong>{amount(chosenDay?.balance ?? null)}</strong>
            </p>
            {chosenDay?.outsideHorizon && (
              <p>
                Previsões disponíveis somente até 90 dias; esta data está fora
                do horizonte.
              </p>
            )}
            {calendar.events
              .filter((e) => e.date === selectedDate)
              .map((e) => (
                <EventItem key={e.id} event={e} at={at} />
              ))}
            {!calendar.events.some((e) => e.date === selectedDate) && (
              <p>Nenhuma ocorrência identificada para este dia.</p>
            )}
          </section>
        </>
      )}
      {section === 'Recorrências' && (
        <>
          <p className="inline-note">
            Regras geram previsões, sem cadastrar pagamentos automaticamente.
            Quinzenal significa a cada 14 dias; personalizado permite escolher o
            intervalo em dias. Edite ou pause uma regra a qualquer momento.
            Alterações valem a partir de hoje. O passado é preservado. Pausar
            suspende novas ocorrências; retomar não recupera o período pausado.
            Pendências anteriores à pausa continuam visíveis.
          </p>
          {!p.data.recurrences.some((r) => !r.archived) && (
            <EmptyState
              title="Seu planejamento começa com uma regra"
              description="Cadastre aluguel, receita prevista, seguro, aporte ou conta anual."
              action={
                <button onClick={() => editRule()}>
                  Criar primeira recorrência
                </button>
              }
            />
          )}
          {p.data.recurrences.filter((r) => !r.archived).map((r) => (
            <FinancialItem
              key={r.id}
              title={String(r.name)}
              value={
                typeof r.amount === 'number'
                  ? money(r.amount)
                  : 'Valor desconhecido'
              }
              description={`${r.frequency} · ${r.status} · ${brDate(r.startDate)}`}
              context={`${r.kind}${r.account ? ` · ${r.account}` : ''}`}
              action={
                <button
                  aria-label={'Editar recorrência ' + r.name}
                  onClick={() => editRule(r)}
                >
                  Editar
                </button>
              }
            >
              <div className="row-actions">
                <button
                  onClick={() =>
                    p.update('recurrences', {
                      ...r,
                      status: r.status === 'ativa' ? 'pausada' : 'ativa',
                    })
                  }
                >
                  {r.status === 'ativa' ? 'Pausar' : 'Ativar'}
                </button>
                <button onClick={() => p.del('recurrences', r)}>
                  Excluir regra
                </button>
              </div>
            </FinancialItem>
          ))}
          <details className="disclosure">
            <summary>
              Ocorrências conferidas · {p.data.forecastResolutions.length}
            </summary>
            {p.data.forecastResolutions.map((r) => (
              <FinancialItem
                key={r.id}
                title={String(
                  (() => {
                    const rule = p.data.recurrences.find(
                      (rule) => rule.id === r.recurrenceId,
                    );
                    return rule
                      ? recurrenceAt(rule, String(r.occurrenceDate)).name
                      : 'Regra';
                  })(),
                )}
                description={brDate(r.occurrenceDate)}
                context={
                  r.action === 'ignorar'
                    ? 'Ignorada'
                    : 'Relacionada a um registro realizado'
                }
                action={
                  <button onClick={() => p.del('forecastResolutions', r)}>
                    Desfazer conferência
                  </button>
                }
              />
            ))}
            <p className="inline-note">
              Desfazer remove somente a conferência; mantém o lançamento
              realizado.
            </p>
          </details>
        </>
      )}
    </>
  );
}
