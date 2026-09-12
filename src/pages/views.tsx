import {
  SelectedGoal,
  DayAndMonth,
  Attention,
  DebtCards,
  TrendChart,
  MonthlySimulator,
  NextBike,
} from '../components/overview';
import { dateRange, monthComparison } from '../insights';
import { TargetBreakdown } from '../components/target-breakdown';
import { ComponentLinks } from '../components/component-links';
import { MaintenanceCostSummary } from './maintenance-costs';
import { useState, type ReactNode } from 'react';
import {
  ArrowUpRight,
  Bike,
  Target,
  ShieldCheck,
  Wallet,
  Wrench,
} from 'lucide-react';
import {
  Card,
  Metrics,
  Bar,
  NoData,
  Records,
  Choice,
  Fields,
  type Column,
} from '../components/common';
import {
  emptyRow,
  type Data,
  type Collection,
  type Row,
  num,
  money,
  dec,
  brDate,
  today,
  id,
} from '../model';
import {
  costs,
  financial,
  targets,
  prioritized,
  debtState,
  investmentBalance,
  plan,
  maintenanceState,
  maintenanceCosts,
  workResult,
  sum,
  ratio,
  progress,
  forecast,
  daysBetween,
  simulate,
} from '../calculations';
export type ViewProps = {
  data: Data;
  edit: (kind: Collection | 'settings' | 'bike', r?: Row) => void;
  del: (kind: Collection, r: Row) => void;
  go: (page: string) => void;
  update: (kind: Collection, row: Row) => void;
  saveSettings: (settings: Row) => void;
};
const value = (label: string, v: ReactNode) => (
  <div className="detail" key={label}>
    <span>{label}</span>
    <strong>{v}</strong>
  </div>
);
const dateCol: Column = { label: 'Data', render: (r) => brDate(r.date) };
const amountCol: Column = {
  label: 'Valor',
  render: (r) => money(num(r.amount)),
};
export function Dashboard({ data: d, edit, go, saveSettings }: ViewProps) {
  const f = financial(d),
    c = costs(d),
    t = targets(d),
    day = today(),
    month = day.slice(0, 7),
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
  const emergency = d.investments
      .filter((r) => r.category === 'reserva de emergência')
      .reduce((a, r) => a + investmentBalance(d, r), 0),
    emergencyTarget =
      num(d.settings.essential) * num(d.settings.emergencyMonths);
  return (
    <>
      <SelectedGoal
        data={d}
        edit={edit}
        onSelect={(defaultTarget) =>
          saveSettings({ ...d.settings, defaultTarget })
        }
      />
      <Attention data={d} go={go} />
      <Metrics
        items={[
          [
            'Saldo disponível',
            money(f.available),
            'Real · saldo menos reserva da moto',
          ],
          [
            'Faturamento do mês',
            money(
              sum(
                d.work.filter((r) => String(r.date).startsWith(month)),
                'revenue',
              ),
            ),
            'Real · trabalho registrado',
          ],
          [
            'Despesas do mês',
            money(
              sum(
                [...d.expenses, ...d.services].filter((r) =>
                  String(r.date).startsWith(month),
                ),
                'amount',
              ),
            ),
            'Real · inclui serviços da moto',
          ],
          [
            'Patrimônio líquido',
            money(f.netWorth),
            'Saldo + investimentos + moto − dívidas',
          ],
        ]}
      />
      <div className="dashboard-grid">
        <Card
          title={`${d.bike.brand} ${d.bike.model}`}
          action={<Bike size={23} />}
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
            <Wrench size={19} />
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
            <span className="subtle">Reservado: {money(f.fund)}</span>
            <button onClick={() => go('Moto')}>
              Ver moto <ArrowUpRight size={15} />
            </button>
          </div>
        </Card>
      </div>
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
      <div className="three-grid">
        <Card title="Dívida prioritária" action={<Wallet size={20} />}>
          <strong className="card-number">{money(f.debt)}</strong>
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
            Ver dívidas <ArrowUpRight size={15} />
          </button>
        </Card>
        <Card title="Sua reserva" action={<ShieldCheck size={20} />}>
          <strong className="card-number">{money(f.investments)}</strong>
          <p>Total investido</p>
          <Bar
            value={progress(emergency, emergencyTarget)}
            label="Reserva de emergência"
          />
          <p className="inline-note">
            Emergência: {money(emergency)} de {money(emergencyTarget)} ·
            Aportes: {money(f.contributions)}
          </p>
          <button onClick={() => go('Investimentos')}>
            Ver investimentos <ArrowUpRight size={15} />
          </button>
        </Card>
        <Card title="Próximo objetivo" action={<Target size={20} />}>
          <h3>{main ? String(main.name) : 'Qual é o seu próximo plano?'}</h3>
          <strong className="card-number">
            {main ? money(plan(main, today(), d).remaining) : money(0)}
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
            Ver planos <ArrowUpRight size={15} />
          </button>
        </Card>
      </div>
      <DayAndMonth data={d} />
      <TrendChart data={d} />
      <TargetBreakdown
        target={t}
        onConfigure={() => edit('settings', d.settings)}
      />
    </>
  );
}
export { Work } from './work';
export function Debts(p: ViewProps) {
  const { data: d, edit } = p,
    [strategy, setStrategy] = useState('otimizada'),
    ranked = prioritized(d, strategy),
    all = d.debts.map((r) => debtState(d, r));
  return (
    <>
      <Metrics
        items={[
          ['Dívidas restantes', money(financial(d).debt)],
          ['Pagamentos realizados', money(sum(d.payments, 'amount'))],
          ['Parcelas mensais', money(targets(d).installments)],
          ['Dívidas ativas', String(ranked.length)],
        ]}
      />
      <Card
        title="Ordem de pagamento"
        action={
          <Choice
            label="Estratégia de dívida"
            value={strategy}
            onChange={setStrategy}
            options={[
              'otimizada',
              'avalanche',
              'bola de neve',
              'saldo',
              'vencimento',
            ]}
          />
        }
      >
        <p className="inline-note">
          A estratégia otimizada pondera atraso, juros, vencimento, parcela e
          saldo. É uma comparação dos seus dados; nenhum pagamento é automático.
        </p>
        {ranked.length ? (
          ranked.map((r, i) => (
            <div className="rank-row" key={r.id}>
              <span className="rank">{i + 1}</span>
              <div>
                <h3>
                  {String(r.name)}{' '}
                  <span className={'status ' + r.priority}>{r.priority}</span>
                </h3>
                <p>{r.reason}</p>
              </div>
              <strong>{money(r.balance)}</strong>
            </div>
          ))
        ) : (
          <NoData text="Nenhuma dívida ativa." />
        )}
      </Card>
      <DebtCards data={d} edit={edit} />
      <Records
        {...p}
        kind="debts"
        rows={all}
        filterKey="status"
        sortKey="balance"
        columns={[
          { label: 'Dívida', render: (r) => <b>{String(r.name)}</b> },
          { label: 'Saldo restante', render: (r) => money(num(r.balance)) },
          {
            label: 'Juros / vencimento',
            render: (r) => `${dec(num(r.interest))}% · ${brDate(r.due)}`,
          },
          { label: 'Parcelas restantes', render: (r) => String(r.remaining) },
          {
            label: 'Quitação',
            render: (r) => (
              <>
                <Bar value={num(r.progress)} label="Quitação" />
                {dec(num(r.progress))}%
              </>
            ),
          },
        ]}
        extra={(r) => (
          <button
            onClick={() =>
              edit('payments', {
                id: id(),
                debtId: r.id,
                date: today(),
                amount: 0,
                installments: 0,
                kind: 'normal',
                notes: '',
              })
            }
          >
            Pagar
          </button>
        )}
      />
      <Records
        {...p}
        kind="payments"
        rows={d.payments}
        columns={[
          dateCol,
          {
            label: 'Dívida',
            render: (r) =>
              String(d.debts.find((x) => x.id === r.debtId)?.name || ''),
          },
          amountCol,
          {
            label: 'Tipo / parcelas',
            render: (r) => `${r.kind} · ${r.installments}`,
          },
        ]}
        filterKey="kind"
      />
    </>
  );
}
export function Expenses(p: ViewProps) {
  const d = p.data;
  const [from, setFrom] = useState(today().slice(0, 7) + '-01'),
    [to, setTo] = useState(today()),
    [kind, setKind] = useState('todas');
  const rows = d.expenses.filter(
    (r) =>
      String(r.date) >= from &&
      String(r.date) <= to &&
      (kind === 'todas' || r.recurrence === kind),
  );
  const categories = [...new Set(rows.map((r) => String(r.category)))]
    .map((name) => ({
      label: name,
      value: sum(
        rows.filter((r) => r.category === name),
        'amount',
      ),
    }))
    .sort((a, b) => b.value - a.value);
  const total = sum(rows, 'amount'),
    comparison = monthComparison(d);

  return (
    <>
      <Card title="Gastos no período">
        <div className="period-tabs">
          {['Hoje', '7 dias', '30 dias', 'Este mês'].map((period) => (
            <button
              key={period}
              onClick={() => {
                const r = dateRange(period);
                setFrom(r.from);
                setTo(r.to);
              }}
            >
              {period}
            </button>
          ))}
        </div>
        <div className="list-tools">
          <label>
            De
            <input
              aria-label="Gastos de"
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
          </label>
          <label>
            Até
            <input
              aria-label="Gastos até"
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </label>
          <Choice
            label="Recorrência de gastos"
            value={kind}
            onChange={setKind}
            options={[
              { value: 'todas', label: 'Todas' },
              { value: 'única', label: 'Pontual' },
              { value: 'mensal', label: 'Mensal' },
              { value: 'anual', label: 'Anual' },
            ]}
          />
        </div>
        <Metrics
          items={[
            ['Total filtrado', money(total)],
            ['Maior categoria', categories[0]?.label || 'Sem gastos'],
            [
              'Média diária',
              money(ratio(total, Math.max(1, daysBetween(from, to) + 1))),
            ],
            [
              'Variação mensal até hoje',
              comparison.expenseChange === null
                ? 'Sem base'
                : dec(comparison.expenseChange, 1) + '%',
            ],
          ]}
        />
      </Card>
      <Chart title="Categorias no período" items={categories} />
      <Metrics
        items={[
          ['Gastos registrados', money(sum(d.expenses, 'amount'))],
          ['Serviços da moto', money(sum(d.services, 'amount'))],
          ['Total real', money(financial(d).spent)],
          ['Orçamento mensal', money(targets(d).mandatory)],
        ]}
      />
      <p className="notice">
        Recorrências compõem o orçamento, mas não criam despesas
        automaticamente. Cadastre cada pagamento realizado. Serviços registrados
        em Manutenção já entram nos totais.
      </p>
      <Records
        {...p}
        kind="expenses"
        rows={rows}
        filterKey="category"
        columns={[
          dateCol,
          { label: 'Nome', render: (r) => String(r.name) },
          { label: 'Categoria', render: (r) => String(r.category) },
          amountCol,
          { label: 'Recorrência', render: (r) => String(r.recurrence) },
          {
            label: 'Uso / atribuição',
            render: (r) =>
              `${r.scope} · ${r.scope === 'pessoal' ? 'sem atribuição' : r.allocation}`,
          },
        ]}
      />
    </>
  );
}
export function Motorcycle(p: ViewProps) {
  const { data: d, edit } = p,
    c = costs(d),
    f = financial(d),
    [km, setKm] = useState(0);
  const next = d.maintenance
    .map((r) => maintenanceState(d, r))
    .filter((r) => !['não configurada', 'concluída'].includes(r.status))
    .sort(
      (a, b) =>
        a.days - b.days || (a.kmLeft ?? Infinity) - (b.kmLeft ?? Infinity),
    )[0];
  return (
    <>
      <Card
        title={`${d.bike.brand} ${d.bike.model} · ${d.bike.year}`}
        action={
          <button onClick={() => edit('bike', d.bike)}>Editar moto</button>
        }
      >
        <Metrics
          items={[
            ['KM atual', dec(num(d.bike.km)) + ' km'],
            ['Valor atual', money(num(d.bike.currentValue))],
            [
              'Próxima manutenção',
              next
                ? String(next.name)
                : 'Configure km/data da última manutenção',
            ],
          ]}
        />
      </Card>
      <Metrics
        items={[
          [
            'Custo operacional / km',
            money(c.operating),
            'Estimado · combustível + previsões',
          ],
          ['Custo econômico / km', money(c.economic), 'Inclui depreciação'],
          [
            'Reserva prevista / km',
            money(c.reserve),
            'Estimativa, sem movimentar saldo',
          ],
          ['Reserva efetiva', money(f.fund), 'Real · valor separado do saldo'],
        ]}
      />
      <div className="dashboard-grid">
        <Card
          title={`${d.bike.brand} ${d.bike.model} ${d.bike.year}`}
          action={
            <button onClick={() => edit('bike', d.bike)}>
              Editar moto / km
            </button>
          }
        >
          <div className="two-stats">
            {value('Versão', d.bike.version || 'Não informada')}
            {value('KM atual', dec(num(d.bike.km)))}
            {value('KM na compra', dec(num(d.bike.purchaseKm)))}
            {value('Compra', brDate(d.bike.purchaseDate))}
            {value('Valor de compra', money(num(d.bike.purchaseValue)))}
            {value('Valor atual', money(num(d.bike.currentValue)))}
          </div>
          <p className="inline-note">{d.bike.notes}</p>
        </Card>
        <Card title="Combustível">
          <div className="two-stats">
            {value('Preço / litro', money(num(d.bike.fuelPrice)))}
            {value('Consumo', dec(num(d.bike.efficiency)) + ' km/L')}
            {value('Combustível / km', money(c.fuel))}
          </div>
          <label className="standalone-label">
            Simular distância (km)
            <input
              type="number"
              min="0"
              value={km}
              onChange={(e) => setKm(Math.max(0, Number(e.target.value)))}
            />
          </label>
          <p>
            {dec(ratio(km, num(d.bike.efficiency)))} litros ·{' '}
            {money(km * c.fuel)}
          </p>
          {!c.configured && (
            <p className="inline-note">
              Informe preço e consumo em Editar moto para calcular.
            </p>
          )}
        </Card>
      </div>
      <Card
        title="Depreciação"
        action={<span className="badge">ECONÔMICO</span>}
      >
        <div className="six-stats">
          {value('Valor original', money(num(d.bike.purchaseValue)))}
          {value('Valor atual', money(num(d.bike.currentValue)))}
          {value('Perda acumulada', money(c.depreciation))}
          {value('Perda percentual', dec(c.depPercent) + '%')}
          {value('KM percorridos', dec(c.distance))}
          {value('Depreciação / km', money(c.depKm))}
        </div>
        <p className="inline-note">
          Diferença entre os valores informados. Não reduz seu saldo.{' '}
          {c.distance === 0
            ? 'Informe uma distância percorrida maior que zero para calcular por km.'
            : ''}
        </p>
      </Card>
      <Records
        {...p}
        kind="costs"
        rows={d.costs}
        filterKey="category"
        sortKey="category"
        columns={[
          { label: 'Item', render: (r) => String(r.name) },
          { label: 'Categoria', render: (r) => String(r.category) },
          { label: 'Custo previsto', render: (r) => money(num(r.amount)) },
          { label: 'Vida / km cobertos', render: (r) => dec(num(r.lifeKm)) },
          {
            label: 'Reserva / km',
            render: (r) => 'R$ ' + dec(ratio(num(r.amount), num(r.lifeKm)), 4),
          },
        ]}
      />
      <p className="notice">
        Seguro, IPVA e licenciamento: use o custo do período e os km previstos
        nesse período. Evite cadastrar a relação completa junto de corrente,
        coroa e pinhão para o mesmo ciclo.
      </p>
      <Card title="Reserva da moto">
        <div className="four-stats">
          {value(
            'Previsão nos km de trabalho',
            money(sum(d.work, 'km') * c.reserve),
          )}
          {value('Valor separado', money(f.fund))}
          {value(
            'Próximo gasto estimado',
            money(next ? num(next.estimated) : 0),
          )}
          {value(
            'Sobra / déficit',
            money(f.fund - (next ? num(next.estimated) : 0)),
          )}
        </div>
        <p className="inline-note">
          Reservar apenas separa dinheiro dentro do saldo. Usar libera o valor
          reservado; registre o gasto real em Serviços realizados ou Gastos, uma
          única vez.
        </p>
      </Card>
      <Records {...p} kind="fund" rows={d.fund} filterKey="kind" />
    </>
  );
}
export function Maintenance(p: ViewProps) {
  const { data: d, edit } = p,
    rows = d.maintenance.map((r) => maintenanceState(d, r)),
    late = rows.filter((r) => r.status === 'atrasada'),
    near = rows.filter((r) => r.status === 'próxima'),
    configured = rows.some((r) => r.status !== 'não configurada');
  const status = late.length
    ? '🔴 MANUTENÇÃO ATRASADA'
    : near.length
      ? '🟡 MANUTENÇÃO PRÓXIMA'
      : configured
        ? '🟢 EM DIA'
        : 'CONFIGURE OS INTERVALOS';
  return (
    <>
      <div className="three-grid">
        {rows
          .filter((r) => r.status !== 'concluída')
          .slice(0, 6)
          .map((r) => (
            <Card
              key={r.id}
              title={String(r.name)}
              action={
                <button
                  onClick={() =>
                    edit(
                      'maintenance',
                      d.maintenance.find((x) => x.id === r.id),
                    )
                  }
                >
                  Editar
                </button>
              }
            >
              <span className={'status ' + r.status}>
                {r.status === 'não configurada'
                  ? 'Configure último km/data'
                  : String(r.status)}
              </span>
              <div className="target-source-list">
                <div className="detail">
                  <span>Estimativa</span>
                  <strong>{money(num(r.estimated))}</strong>
                </div>
                <div className="detail">
                  <span>Vida útil</span>
                  <strong>{dec(num(r.lifeKm) || num(r.intervalKm))} km</strong>
                </div>
                <div className="detail">
                  <span>Custo por km</span>
                  <strong>
                    {maintenanceCosts(d, r).estimatedCostPerKm === null
                      ? 'Não definido'
                      : money(maintenanceCosts(d, r).estimatedCostPerKm!)}
                  </strong>
                </div>
                <div className="detail">
                  <span>Faltam</span>
                  <strong>
                    {r.kmLeft === null ? 'Sem base' : dec(r.kmLeft) + ' km'}
                  </strong>
                </div>
              </div>
            </Card>
          ))}
      </div>
      <MaintenanceCostSummary data={d} />
      <ComponentLinks data={d} onSave={(r) => p.update('costs', r)} />
      <div className={'notice ' + (late.length ? 'error' : '')}>
        <b>{status}</b> · {late.length} atrasadas · {near.length} próximas
      </div>
      <Metrics
        items={[
          ['Próximos 30 dias', money(forecast(d, 30))],
          ['Próximos 90 dias', money(forecast(d, 90))],
          ['Próximos 6 meses', money(forecast(d, 183))],
          ['Próximos 12 meses', money(forecast(d, 365))],
        ]}
      />
      <p className="inline-note">
        Projeção do próximo evento de cada item, incluindo atrasados. Usa o
        primeiro prazo entre km e data; dias por km usam a média dos últimos 30
        dias. Sem média ou data, não é possível projetar um prazo.
      </p>
      <Records
        {...p}
        kind="maintenance"
        rows={rows}
        filterKey="status"
        sortKey="days"
        columns={[
          {
            label: 'Item',
            render: (r) => (
              <>
                <b>{String(r.name)}</b>
                <p className="inline-note">{String(r.category)}</p>
              </>
            ),
          },
          {
            label: 'Status',
            render: (r) => (
              <span className={'status ' + r.status}>{String(r.status)}</span>
            ),
          },
          {
            label: 'Próxima',
            render: (r) => (
              <>
                {r.nextKm !== null ? dec(num(r.nextKm)) + ' km' : 'Sem km'}
                <p className="inline-note">{brDate(r.nextDate)}</p>
              </>
            ),
          },
          {
            label: 'Faltam',
            render: (r) => (
              <>
                {r.kmLeft !== null ? dec(num(r.kmLeft)) + ' km' : '—'}
                <p className="inline-note">
                  {Number.isFinite(r.days)
                    ? '~ ' + dec(Math.max(0, num(r.days)), 0) + ' dias'
                    : 'Sem previsão em dias'}
                </p>
              </>
            ),
          },
          {
            label: 'Estimado',
            render: (r) => {
              const costs = maintenanceCosts(d, r);
              return (
                <>
                  {money(num(r.estimated))}
                  {costs.estimatedCostPerKm !== null && (
                    <p className="inline-note">
                      R$ {dec(costs.estimatedCostPerKm ?? 0, 4)} por km
                    </p>
                  )}
                </>
              );
            },
          },
        ]}
        extra={(r) => (
          <button
            onClick={() =>
              edit('services', {
                id: id(),
                maintenanceId: r.id,
                date: today(),
                km: num(d.bike.km),
                amount: 0,
                notes: '',
              })
            }
          >
            Realizar
          </button>
        )}
      />
      <Records
        {...p}
        kind="services"
        rows={d.services}
        columns={[
          dateCol,
          {
            label: 'Item',
            render: (r) =>
              String(
                d.maintenance.find((x) => x.id === r.maintenanceId)?.name || '',
              ),
          },
          { label: 'KM', render: (r) => dec(num(r.km)) },
          amountCol,
        ]}
      />
      <Records
        {...p}
        kind="checklists"
        rows={d.checklists}
        columns={[
          dateCol,
          {
            label: 'Condição',
            render: (r) =>
              Object.values(r).includes('Problema')
                ? '🔴 Problema'
                : Object.values(r).includes('Atenção')
                  ? '🟡 Atenção'
                  : '🟢 OK',
          },
          { label: 'Observações', render: (r) => String(r.notes) },
        ]}
      />
    </>
  );
}
export function Investments(p: ViewProps) {
  const d = p.data,
    f = financial(d),
    emergency = d.investments
      .filter((r) => r.category === 'reserva de emergência')
      .reduce((s, r) => s + investmentBalance(d, r), 0),
    target = num(d.settings.essential) * num(d.settings.emergencyMonths);
  return (
    <>
      <Metrics
        items={[
          ['Total investido', money(f.investments)],
          ['Aportes', money(f.contributions)],
          [
            'Rendimentos registrados',
            money(
              sum(
                d.movements.filter((r) => r.kind === 'rendimento'),
                'amount',
              ) -
                sum(
                  d.movements.filter((r) => r.kind === 'perda'),
                  'amount',
                ),
            ),
          ],
          ['Aporte planejado mensal', money(num(d.settings.reserveMonth))],
          ['Retiradas', money(f.withdrawals)],
          ['Disponível após reserva da moto', money(f.available)],
        ]}
      />
      <Card
        title="Reserva de emergência"
        action={
          <button onClick={() => p.edit('settings', d.settings)}>
            Configurar meta
          </button>
        }
      >
        <div className="four-stats">
          {value('Valor atual', money(emergency))}
          {value('Meta', money(target))}
          {value('Restante', money(Math.max(0, target - emergency)))}
          {value('Concluído', dec(progress(emergency, target)) + '%')}
          {value(
            'Meses cobertos',
            num(d.settings.essential) > 0
              ? dec(emergency / num(d.settings.essential), 1)
              : 'Defina o custo essencial',
          )}
        </div>
        <Bar
          value={progress(emergency, target)}
          label="Reserva de emergência"
        />
        <p className="inline-note">
          Meta = custo essencial mensal × meses desejados. A rentabilidade
          cadastrada é informativa; registre os rendimentos efetivos nas
          movimentações.
        </p>
      </Card>
      <Records
        {...p}
        kind="investments"
        rows={d.investments}
        filterKey="category"
        sortKey="name"
        columns={[
          { label: 'Nome', render: (r) => String(r.name) },
          { label: 'Categoria', render: (r) => String(r.category) },
          {
            label: 'Saldo atual',
            render: (r) => money(investmentBalance(d, r)),
          },
          {
            label: 'Rentabilidade informada',
            render: (r) => dec(num(r.yield)) + '% a.a.',
          },
          { label: 'Objetivo', render: (r) => String(r.objective) },
        ]}
      />
      <Records
        {...p}
        kind="movements"
        rows={d.movements}
        filterKey="kind"
        columns={[
          dateCol,
          {
            label: 'Investimento',
            render: (r) =>
              String(
                d.investments.find((x) => x.id === r.investmentId)?.name || '',
              ),
          },
          { label: 'Tipo', render: (r) => String(r.kind) },
          amountCol,
        ]}
      />
    </>
  );
}

export function Plans(p: ViewProps) {
  const { data: d, edit } = p;
  const [history, setHistory] = useState('todos');
  const result = (r: Row) => plan(r, today(), d);
  function transaction(r: Row, kind: string) {
    edit('planTransactions', {
      ...emptyRow('planTransactions'),
      id: id(),
      planId: r.id,
      kind,
    });
  }
  return (
    <>
      <NextBike data={d} />
      <Metrics
        items={[
          ['Objetivos', String(d.plans.length)],
          [
            'Já guardado',
            money(d.plans.reduce((s, r) => s + result(r).current, 0)),
          ],
          [
            'Falta guardar',
            money(
              d.plans
                .filter((r) => r.status !== 'concluído')
                .reduce((s, r) => s + result(r).remaining, 0),
            ),
          ],
          [
            'Aporte mensal necessário',
            money(
              d.plans
                .filter((r) => r.status !== 'concluído')
                .reduce((s, r) => s + result(r).monthly, 0),
            ),
          ],
        ]}
      />
      <p className="notice">
        O saldo inicial mais aportes menos retiradas determina o valor guardado.
        Essas alocações acompanham os objetivos e não são somadas novamente ao
        patrimônio. Registre transferências reais na aba Investimentos e gastos
        efetivos em Gastos.
      </p>
      <Records
        {...p}
        kind="plans"
        rows={d.plans}
        filterKey="status"
        sortKey="deadline"
        columns={[
          {
            label: 'Plano',
            render: (r) => (
              <>
                <b>{String(r.name)}</b>
                <p>
                  {r.kind} · {r.status}
                </p>
              </>
            ),
          },
          {
            label: 'Prazo',
            render: (r) => (
              <>
                {brDate(r.deadline)}
                {result(r).overdue && r.status !== 'concluído' && (
                  <p className="error">Prazo vencido</p>
                )}
              </>
            ),
          },
          {
            label: 'Guardado / restante',
            render: (r) =>
              money(result(r).current) + ' / ' + money(result(r).remaining),
          },
          {
            label: 'Progresso',
            render: (r) => (
              <>
                <Bar value={result(r).percent} label="Progresso do plano" />
                {dec(result(r).percent)}%
              </>
            ),
          },
          {
            label: 'Mensal / semanal / diário',
            render: (r) => {
              const x = result(r);
              return (
                money(x.monthly) +
                ' / ' +
                money(x.weekly) +
                ' / ' +
                money(x.daily)
              );
            },
          },
        ]}
        extra={(r) => (
          <>
            <button onClick={() => transaction(r, 'deposit')}>Aportar</button>
            <button onClick={() => transaction(r, 'withdrawal')}>
              Retirar
            </button>
            <button
              onClick={() => {
                setHistory(r.id);
                document
                  .getElementById('plan-history')
                  ?.scrollIntoView({ behavior: 'smooth' });
              }}
            >
              Histórico
            </button>
          </>
        )}
      />
      <div id="plan-history">
        <div className="section-heading">
          <h2>Movimentações dos objetivos</h2>
          <Choice
            label="Plano do histórico"
            value={history}
            onChange={setHistory}
            options={[
              { value: 'todos', label: 'Todos os planos' },
              ...d.plans.map((r) => ({ value: r.id, label: String(r.name) })),
            ]}
          />
        </div>
        <Records
          {...p}
          kind="planTransactions"
          rows={d.planTransactions.filter(
            (t) => history === 'todos' || t.planId === history,
          )}
          filterKey="kind"
          columns={[
            dateCol,
            {
              label: 'Plano',
              render: (r) =>
                String(d.plans.find((p) => p.id === r.planId)?.name || ''),
            },
            {
              label: 'Tipo',
              render: (r) => (r.kind === 'withdrawal' ? 'Retirada' : 'Aporte'),
            },
            amountCol,
            { label: 'Observações', render: (r) => String(r.notes) },
          ]}
        />
      </div>
    </>
  );
}
function Chart({
  title,
  items,
}: {
  title: string;
  items: { label: string; value: number }[];
}) {
  const max = Math.max(1, ...items.map((r) => Math.abs(r.value)));
  return (
    <Card title={title}>
      <div
        className="chart-bars"
        aria-label={
          title +
          ': ' +
          items.map((r) => `${r.label} ${dec(r.value)}`).join('; ')
        }
      >
        {items.length ? (
          items.map((r, i) => (
            <div className="chart-column" key={i}>
              <span>{dec(r.value)}</span>
              <div
                className={'chart-stick ' + (r.value < 0 ? 'negative' : '')}
                style={{
                  height: Math.max(2, (Math.abs(r.value) / max) * 125) + 'px',
                }}
              />
              <small>{r.label}</small>
            </div>
          ))
        ) : (
          <NoData text="Sem dados no período." />
        )}
      </div>
    </Card>
  );
}
export function Analysis(p: ViewProps) {
  const d = p.data,
    [filter, setFilter] = useState('30 dias'),
    at = today(),
    start =
      filter === 'mês'
        ? at.slice(0, 7) + '-01'
        : filter === 'ano'
          ? at.slice(0, 4) + '-01-01'
          : new Date(
              Date.parse(at + 'T12:00:00Z') -
                (filter === '7 dias' ? 6 : 29) * 86400000,
            )
              .toISOString()
              .slice(0, 10);
  const inPeriod = (r: Row) => String(r.date) >= start && String(r.date) <= at,
    work = d.work.filter(inPeriod),
    c = costs(d),
    f = financial(d),
    [s, setS] = useState<Row>({
      id: 'sim',
      revenue: 0,
      hours: 0,
      km: 0,
      gas: num(d.bike.fuelPrice),
      expenses: 0,
      extra: 0,
      contribution: 0,
    }),
    sim = simulate(d, s);
  const buckets = [
    ...new Set(
      [
        ...work,
        ...d.expenses.filter(inPeriod),
        ...d.services.filter(inPeriod),
      ].map((r) =>
        filter === 'ano' ? String(r.date).slice(0, 7) : String(r.date),
      ),
    ),
  ].sort();
  const series = (metric: string) =>
    buckets.map((b) => {
      const w = work.filter((r) => String(r.date).startsWith(b));
      return {
        label: filter === 'ano' ? b.slice(5) : brDate(b).slice(0, 5),
        value:
          metric === 'Faturamento'
            ? sum(w, 'revenue')
            : metric === 'Lucro'
              ? sum(w, 'revenue') - sum(w, 'km') * c.economic
              : sum(
                  [...d.expenses, ...d.services].filter(
                    (r) => inPeriod(r) && String(r.date).startsWith(b),
                  ),
                  'amount',
                ),
      };
    });
  const activities = [...new Set(work.map((r) => String(r.activity)))];
  return (
    <>
      <TrendChart data={d} />
      <MonthlySimulator data={d} />
      <div className="section-heading">
        <p>
          Período: {brDate(start)} a {brDate(at)}
        </p>
        <Choice
          label="Período das análises"
          value={filter}
          onChange={setFilter}
          options={['7 dias', '30 dias', 'mês', 'ano']}
        />
      </div>
      <div className="three-grid">
        {['Faturamento', 'Lucro', 'Gastos'].map((m) => (
          <Chart
            title={m + (m === 'Lucro' ? ' estimado' : ' (R$)')}
            key={m}
            items={series(m)}
          />
        ))}
      </div>
      <div className="two-grid">
        <Chart
          title="Composição atual do custo / km (R$)"
          items={[
            { label: 'Combustível', value: c.fuel },
            ...c.components.map((r) => ({
              label: String(r.name),
              value: r.perKm,
            })),
            { label: 'Depreciação', value: c.depKm },
          ]}
        />
        <Chart
          title="Dívidas atuais (R$)"
          items={prioritized(d).map((r) => ({
            label: String(r.name),
            value: r.balance,
          }))}
        />
        <Chart
          title="Investimentos atuais (R$)"
          items={d.investments.map((r) => ({
            label: String(r.name),
            value: investmentBalance(d, r),
          }))}
        />
        <Chart
          title="Patrimônio atual (R$)"
          items={[
            { label: 'Dinheiro', value: f.cash },
            { label: 'Investimentos', value: f.investments },
            { label: 'Moto', value: num(d.bike.currentValue) },
            { label: 'Dívidas', value: -f.debt },
            { label: 'Líquido', value: f.netWorth },
          ]}
        />
      </div>
      <p className="inline-note">
        O filtro altera os fluxos e a comparação de atividades. Custo/km,
        dívidas, investimentos e patrimônio mostram a posição atual; não há
        cotações históricas. Lucros estimados usam os custos atuais.
      </p>
      <Card title="Comparação de atividades">
        <div className="comparison">
          {activities.length ? (
            activities.map((a) => {
              const w = work.filter((r) => r.activity === a),
                r = workResult(
                  sum(w, 'revenue'),
                  sum(w, 'km'),
                  sum(w, 'hours'),
                  c.economic,
                );
              return (
                <div className="activity-card" key={a}>
                  <h3>{a}</h3>
                  {value('Faturamento', money(r.revenue))}
                  {value('KM', dec(r.km))}
                  {value('Horas', dec(r.hours))}
                  {value('Custo', money(r.cost))}
                  {value('Lucro', money(r.profit))}
                  {value('Lucro/h', money(r.profitHour))}
                  {value('Lucro/km', money(r.profitKm))}
                </div>
              );
            })
          ) : (
            <NoData />
          )}
        </div>
      </Card>
      <Card
        title="Simulador “E se?”"
        action={<span className="badge">PROJETADO · 1 MÊS</span>}
      >
        <Fields
          data={d}
          value={s}
          setValue={setS}
          fields={[
            {
              key: 'revenue',
              label: 'Faturamento diário (R$)',
              type: 'number',
            },
            { key: 'hours', label: 'Horas por dia', type: 'number' },
            { key: 'km', label: 'KM por dia', type: 'number' },
            { key: 'gas', label: 'Gasolina (R$/L)', type: 'number' },
            { key: 'expenses', label: 'Gastos mensais (R$)', type: 'number' },
            {
              key: 'extra',
              label: 'Pagamento extra mensal (R$)',
              type: 'number',
            },
            {
              key: 'contribution',
              label: 'Aporte mensal para planos (R$)',
              type: 'number',
            },
          ]}
        />
        <p className="inline-note">
          Simulação com {d.settings.workDays} dias de trabalho por mês. Não
          modifica os registros. Dívidas não incluem juros futuros; aportes e
          pagamentos transferem patrimônio, sem gerar lucro.
        </p>
        <div className="six-stats">
          {value('Lucro diário', money(sim.profit))}
          {value('Sobra mensal', money(sim.free))}
          {value('Dívida após extra', money(sim.debt))}
          {value('Meta diária', money(sim.target))}
          {value('Aporte para planos', money(sim.plans))}
          {value('Patrimônio projetado', money(sim.netWorth))}
        </div>
      </Card>
    </>
  );
}

export { SettingsView } from './settings';
