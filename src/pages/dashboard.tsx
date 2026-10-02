import { AlertSummary } from '../components/financial-health';
import { PageHeader, QuickAction } from '../components/finance-ui';
import { CashFlowChart } from '../components/cash-flow-chart';
import { BriefcaseBusiness, Receipt, TrendingUp } from 'lucide-react';
import {
  SelectedGoal,
  DayAndMonth,
  Attention,
  TrendChart,
} from '../components/overview';
import { TargetBreakdown } from '../components/target-breakdown';
import {
  ArrowUpRight,
  Bike,
  Target,
  ShieldCheck,
  Wallet,
  Wrench,
} from 'lucide-react';
import { Card, Bar } from '../components/common';
import { num, money, dec, brDate, today } from '../model';
import {
  costs,
  financial,
  targets,
  prioritized,
  plan,
  maintenanceState,
  workResult,
  sum,
  progress,
} from '../calculations';
import { type ViewProps, value } from './shared';
import { monthComparison } from '../insights';
import { MoneyIntelligence } from '../components/money-intelligence';
import { PhaseTwoSummary, usePhaseTwo } from '../components/planning-phase-two';
import { NetWorthSummary } from '../components/net-worth';
import { passiveIncome } from '../services/passive-income';
import { useEffect, useMemo, useState } from 'react';
import { buildMonthlySnapshot } from '../services/month-close';
import { calculateNetWorth } from '../services/net-worth';
import type { MonthlyFinancialSnapshot } from '../services/reporting-state';
import type { Data } from '../model';
import { DashboardAnalytics, WealthSparkline } from '../components/dashboard-analytics';
import { PrivateValue } from '../components/value-privacy';
import './dashboard.css';
export function Dashboard({ data: d, edit, go, saveSettings }: ViewProps) {
  const at = today();
  const wealth = useMemo(() => calculateNetWorth(d, at), [d, at]);
  const [monthly, setMonthly] = useState<{
    source: Data;
    snapshot: MonthlyFinancialSnapshot | null;
    error: boolean;
  } | null>(null);
  useEffect(() => {
    let active = true;
    void buildMonthlySnapshot(d, at.slice(0, 7), {
      at,
      generatedAt: at + 'T00:00:00.000Z',
    })
      .then((snapshot) => {
        if (active) setMonthly({ source: d, snapshot, error: false });
      })
      .catch(() => {
        if (active) setMonthly({ source: d, snapshot: null, error: true });
      });
    return () => {
      active = false;
    };
  }, [d, at]);
  const snapshot = monthly?.source === d ? monthly.snapshot : null;
  const receivedInvestmentIncome = passiveIncome(d, today()).thisMonthCents;
  const lastClosed = [...d.reporting.closures]
    .filter((c) => c.status === 'closed')
    .sort((a, b) => b.period.localeCompare(a.period))[0]
    ?.revisions.at(-1);
  const phase = usePhaseTwo(d);
  const f = financial(d),
    c = costs(d),
    t = targets(d),
    day = today(),
    works = d.work.filter((r) => r.date === day),
    r = workResult(
      sum(works, 'revenue'),
      sum(works, 'km'),
      sum(works, 'hours'),
      c.economic,
    ),
    priority = prioritized(d)[0],
    next = d.maintenance
      .map((r) => maintenanceState(d, r))
      .filter((r) => !['não configurada', 'concluída'].includes(r.status))
      .sort(
        (a, b) =>
          a.days - b.days || (a.kmLeft ?? Infinity) - (b.kmLeft ?? Infinity),
      )[0],
    main = [...d.plans]
      .filter((r) => r.status !== 'concluído')
      .sort(
        (a, b) =>
          ['alta', 'média', 'baixa'].indexOf(String(a.priority)) -
          ['alta', 'média', 'baixa'].indexOf(String(b.priority)),
      )[0];
  const emergency = phase.reserve.totalCents / 100,
    emergencyTarget = (phase.reserve.targetCents ?? 0) / 100;
  const comparison = monthComparison(d),
    smartInsight =
      comparison.expenseChange !== null
        ? `Seus gastos variaram ${dec(Math.abs(comparison.expenseChange), 1)}% ${comparison.expenseChange <= 0 ? 'para baixo' : 'para cima'} em relação ao mês passado.`
        : t.ideal > 0
          ? `Você precisa de ${money(t.ideal)} por dia para atingir sua meta.`
          : 'Registre seus movimentos para receber insights do período.';
  const availableState =
    f.available < 0
      ? 'Saldo negativo'
      : f.available === 0
        ? 'Sem saldo disponível'
        : 'Saldo positivo disponível';
  return (
    <div className="dashboard-page">
      <PageHeader
        title="Visão geral"
        description="Seu dinheiro em perspectiva. Patrimônio, movimentos e próximos passos."
        action={
          <button onClick={() => go('Relatórios')}>
            Ver relatórios <ArrowUpRight size={16} aria-hidden="true" />
          </button>
        }
      />

      <section
        className="dashboard-lead"
        aria-label="Situação financeira atual"
      >
        <div className="dashboard-wealth">
          <div className="section-heading">
            <h2>Patrimônio líquido</h2>
            <button
              className="icon-button"
              aria-label="Ver composição do patrimônio"
              onClick={() => go('Patrimônio')}
            >
              <ArrowUpRight size={18} aria-hidden="true" />
            </button>
          </div>
          <strong className="dashboard-wealth-value">
            <PrivateValue>{money(wealth.netCents / 100)}</PrivateValue>
          </strong>
          <WealthSparkline data={d} through={at} />
          <p>
            {wealth.netCents < 0
              ? 'Passivos superam os ativos'
              : wealth.netCents === 0
                ? 'Patrimônio líquido zero'
                : 'Ativos menos passivos'}{' '}
            ·{' '}
            {wealth.partial
              ? 'Base parcial'
              : wealth.estimated
                ? 'Inclui avaliações estimadas'
                : 'Pelos registros disponíveis'}
          </p>
          <dl className="dashboard-wealth-parts">
            <div>
              <dt>Investimentos</dt>
              <dd>
                <PrivateValue>
                  {money(wealth.investmentsCents / 100)}
                </PrivateValue>
              </dd>
            </div>
            <div>
              <dt>Dívidas</dt>
              <dd>
                <PrivateValue>{money(f.debt)}</PrivateValue>
              </dd>
            </div>
            <div>
              <dt>Disponível agora</dt>
              <dd>
                <PrivateValue>{money(f.available)}</PrivateValue>
              </dd>
            </div>
          </dl>
          <small>{availableState} · disponível após reserva da moto</small>
        </div>
        <div className="dashboard-month-result">
          <div className="section-heading">
            <h2>Seu mês até hoje</h2>
            <span>
              {new Intl.DateTimeFormat('pt-BR', {
                month: 'short',
                year: 'numeric',
              }).format(new Date(at + 'T12:00:00'))}
            </span>
          </div>
          <dl>
            <div>
              <dt>Receitas</dt>
              <dd>
                <PrivateValue>
                  {snapshot
                    ? money(snapshot.incomeCents / 100)
                    : 'Consolidando…'}
                </PrivateValue>
              </dd>
            </div>
            <div>
              <dt>Gastos e serviços</dt>
              <dd>
                <PrivateValue>
                  {snapshot
                    ? money(snapshot.expenseCents / 100)
                    : 'Consolidando…'}
                </PrivateValue>
              </dd>
            </div>
            <div className="dashboard-month-net">
              <dt>Resultado de caixa</dt>
              <dd>
                <PrivateValue>
                  {snapshot
                    ? money(snapshot.netCashFlowCents / 100)
                    : 'Consolidando…'}
                </PrivateValue>
              </dd>
            </div>
          </dl>
          <p>
            Resultado inclui pagamentos, aportes e resgates. Mês em andamento.
          </p>
          {monthly?.error && (
            <p className="negative">
              Não foi possível consolidar. Revise os dados em Auditoria.
            </p>
          )}
        </div>
        {lastClosed && (
          <button
            type="button"
            className="report-last-closed"
            onClick={() => go('Relatórios')}
          >
            Último fechamento · {lastClosed.period} · variação de caixa{' '}
            <PrivateValue>
              {money(lastClosed.netCashFlowCents / 100)}
            </PrivateValue>{' '}
            · ver relatório salvo
          </button>
        )}
      </section>

      <div className="dashboard-utility-row">
        <AlertSummary data={d} go={go} />
        <nav
          className="quick-actions dashboard-actions"
          aria-label="Ações rápidas"
        >
          <QuickAction label="Trabalho" onClick={() => edit('work')}>
            <BriefcaseBusiness aria-hidden="true" />
          </QuickAction>
          <QuickAction label="Gasto" onClick={() => edit('expenses')}>
            <Receipt aria-hidden="true" />
          </QuickAction>
          <QuickAction label="Aporte" onClick={() => edit('movements')}>
            <TrendingUp aria-hidden="true" />
          </QuickAction>
        </nav>
      </div>

      <section
        className="dashboard-analysis-core"
        aria-labelledby="dashboard-month-title"
      >
        <h2 id="dashboard-month-title" className="sr-only">
          Este mês
        </h2>
        {receivedInvestmentIncome > 0 && (
          <p className="dashboard-investment-income">
            Investimentos:{' '}
            <PrivateValue>{money(receivedInvestmentIncome / 100)}</PrivateValue>{' '}
            recebidos em caixa neste mês.{' '}
            <button onClick={() => go('Investimentos')}>
              Ver renda recebida
            </button>
          </p>
        )}
        <p className="dashboard-insight">
          <strong>Leitura do período</strong>
          <PrivateValue>{smartInsight}</PrivateValue>
        </p>

        <CashFlowChart data={d} go={go} />
        <DashboardAnalytics
          data={d}
          snapshot={snapshot}
          budget={phase.budget}
          go={go}
        />

        <details className="dashboard-secondary">
          <summary>Detalhar evolução operacional e composição</summary>
          <div className="dashboard-analysis-grid">
            <div className="dashboard-trend">
              <TrendChart data={d} />
            </div>
            <aside
              className="dashboard-composition"
              aria-label="Composição financeira"
            >
              <MoneyIntelligence data={d} />
              <NetWorthSummary data={d} go={go} />
              <details className="disclosure">
                <summary>Composição da meta</summary>
                <TargetBreakdown
                  target={t}
                  onConfigure={() => edit('settings', d.settings)}
                />
              </details>
            </aside>
          </div>
        </details>
      </section>

      <section
        className="dashboard-context"
        aria-labelledby="dashboard-context-title"
      >
        <div className="dashboard-context-heading">
          <h2 id="dashboard-context-title">Contexto operacional</h2>
          <p>Detalhes para consulta sem competir com a leitura mensal.</p>
        </div>
        <details className="dashboard-secondary">
          <summary>Ver compromissos próximos</summary>
          <Attention data={d} go={go} />
        </details>
        <details className="dashboard-secondary">
          <summary>Ver meta de trabalho de hoje</summary>
          <SelectedGoal
            data={d}
            edit={edit}
            onSelect={(defaultTarget) =>
              saveSettings({ ...d.settings, defaultTarget })
            }
          />
        </details>
        <PhaseTwoSummary data={d} go={go} />
        <details className="dashboard-secondary">
          <summary>Ver detalhes da moto</summary>
          <div className="dashboard-grid">
            <Card
              title={`${d.bike.brand} ${d.bike.model}`}
              action={<Bike size={23} aria-hidden="true" />}
            >
              <p className="inline-note">
                {d.bike.year} · Sua parceira de trabalho
              </p>
              <strong className="odometer">
                {dec(num(d.bike.km), 0)} <small>km</small>
              </strong>
              <div className="double">
                {value('Operacional / km', money(c.operating))}
                {value('Econômico / km', money(c.economic))}
              </div>
              <div className="maintenance-summary">
                <Wrench size={19} aria-hidden="true" />
                <div>
                  <b>
                    {next ? String(next.name) : 'Defina sua próxima manutenção'}
                  </b>
                  <p>
                    {next
                      ? `${next.status} · ${next.kmLeft !== null ? `${dec(next.kmLeft)} km restantes` : brDate(next.nextDate)}`
                      : 'Intervalos e custos configurados por você.'}
                  </p>
                </div>
              </div>
              <div className="section-heading">
                <span className="subtle">
                  Reservado: <PrivateValue>{money(f.fund)}</PrivateValue>
                </span>
                <button onClick={() => go('Moto')}>
                  Ver moto <ArrowUpRight size={15} aria-hidden="true" />
                </button>
              </div>
            </Card>
          </div>
        </details>
        <details className="dashboard-secondary">
          <summary>Ver resultado de hoje</summary>
          <Card
            title="O resultado de hoje"
            action={<span className="badge">ESTIMADO</span>}
          >
            <div className="six-stats">
              {value('Horas trabalhadas', dec(r.hours) + ' h')}
              {value('Distância', dec(r.km) + ' km')}
              {value('Custo econômico', money(r.cost))}
              {value('Lucro estimado', money(r.profit))}
              {value('Ganho por hora', money(r.revenueHour))}
              {value('Diferença para meta/h', money(r.revenueHour - t.hour))}
            </div>
          </Card>
        </details>
        <details className="dashboard-secondary">
          <summary>Ver compromissos e reservas</summary>
          <div className="three-grid">
            <Card title="Dívida prioritária" action={<Wallet size={20} />}>
              <strong className="card-number">
                <PrivateValue>{money(f.debt)}</PrivateValue>
              </strong>
              <p>Total restante</p>
              {priority ? (
                <>
                  <h3>{String(priority.name)}</h3>
                  <span className={'status ' + priority.priority}>
                    Prioridade {priority.priority}
                  </span>
                  <p className="inline-note">{priority.reason}</p>
                </>
              ) : (
                <p className="inline-note">Nenhuma dívida ativa cadastrada.</p>
              )}
              <button onClick={() => go('Dívidas')}>
                Ver dívidas <ArrowUpRight size={15} aria-hidden="true" />
              </button>
            </Card>
            <Card
              title="Sua reserva"
              action={<ShieldCheck size={20} aria-hidden="true" />}
            >
              <strong className="card-number">
                <PrivateValue>{money(f.investments)}</PrivateValue>
              </strong>
              <p>Total investido</p>
              <Bar
                value={progress(emergency, emergencyTarget)}
                label="Reserva de emergência"
              />
              <p className="inline-note">
                Emergência: <PrivateValue>{money(emergency)}</PrivateValue> de{' '}
                <PrivateValue>
                  {phase.reserve.targetCents === null
                    ? 'meta não definida'
                    : money(emergencyTarget)}
                </PrivateValue>{' '}
                · Aportes: <PrivateValue>{money(f.contributions)}</PrivateValue>
              </p>
              <button onClick={() => go('Investimentos')}>
                Ver investimentos <ArrowUpRight size={15} aria-hidden="true" />
              </button>
            </Card>
            <Card
              title="Próximo objetivo"
              action={<Target size={20} aria-hidden="true" />}
            >
              <h3>
                {main ? String(main.name) : 'Qual é o seu próximo plano?'}
              </h3>
              <strong className="card-number">
                <PrivateValue>
                  {main ? money(plan(main, today(), d).remaining) : money(0)}
                </PrivateValue>
              </strong>
              <p>
                {main
                  ? 'para chegar lá'
                  : 'Defina um objetivo e acompanhe cada passo.'}
              </p>
              <Bar
                value={main ? plan(main, today(), d).percent : 0}
                label="Progresso do plano"
              />
              <button onClick={() => go('Planos')}>
                Ver planos <ArrowUpRight size={15} aria-hidden="true" />
              </button>
            </Card>
          </div>
        </details>
        <details className="dashboard-secondary">
          <summary>Ver resumo do período</summary>
          <DayAndMonth data={d} />
        </details>
      </section>
    </div>
  );
}
