import { useState } from 'react';
import { type Data, type Row, num, money, dec, brDate, today } from '../model';
import {
  costs,
  debtState,
  plan,
  progress,
  ratio,
  sum,
  targets,
} from '../calculations';
import {
  financialHealth,
  monthComparison,
  monthlyTrend,
  payoffEstimate,
  upcoming,
  monthlyScenario,
} from '../insights';
import { workCashResult } from '../work-results';
import { Card, Metrics, Bar, Choice, Fields } from './common';
import type { ViewProps } from '../pages/views';

export function SelectedGoal({
  data: d,
  onSelect,
  edit,
}: {
  data: Data;
  onSelect: (key: string) => void;
  edit: ViewProps['edit'];
}) {
  const t = targets(d),
    key = String(d.settings.defaultTarget || 'ideal'),
    selected =
      key === 'minimum'
        ? t.minimum
        : key === 'accelerated'
          ? t.accelerated
          : t.ideal;
  const labels: Record<string, string> = {
    minimum: 'Mínima',
    ideal: 'Ideal',
    accelerated: 'Acelerada',
  };
  const work = d.work.filter((r) => r.date === today()),
    earned = sum(work, 'revenue'),
    hours = sum(work, 'hours'),
    rate = ratio(earned, hours),
    left = Math.max(0, selected - earned);
  return (
    <Card
      title="Sua meta de hoje"
      className="goal-focus"
      action={<span className="badge">ESTIMADO</span>}
    >
      <div className="goal-focus-grid">
        <div>
          <p>Quanto preciso faturar hoje?</p>
          <strong className="hero-number">{money(selected)}</strong>
          <p>Base: Meta {labels[key] || 'Ideal'}</p>
        </div>
        <div>
          <p>
            {money(earned)} de {money(selected)} ·{' '}
            {dec(progress(earned, selected), 0)}%
          </p>
          <Bar value={progress(earned, selected)} label="Meta do dia" />
          <h3>
            {left > 0
              ? `Faltam ${money(left)}`
              : `Meta atingida · + ${money(Math.max(0, earned - selected))}`}
          </h3>
          <p>R$/hora atual: {hours ? money(rate) : 'Sem horas registradas'}</p>
          <p>
            Horas necessárias estimadas:{' '}
            {left === 0
              ? '0'
              : rate > 0
                ? dec(left / rate, 1) + ' h'
                : 'Registre receita e horas para estimar'}
          </p>
        </div>
      </div>
      <div className="goal-options">
        {(['minimum', 'ideal', 'accelerated'] as const).map((k) => (
          <button key={k} aria-pressed={key === k} onClick={() => onSelect(k)}>
            <span>
              {labels[k]}{' '}
              {k === 'ideal'
                ? `+${t.idealPercent}%`
                : k === 'accelerated'
                  ? `+${t.acceleratedPercent}%`
                  : ''}
            </span>
            <strong>{money(t[k])}</strong>
          </button>
        ))}
      </div>
      {!t.configured && (
        <output>Configure os dias de trabalho para obter a meta diária.</output>
      )}
      <details className="disclosure"><summary>Ajustar a meta</summary><button onClick={() => edit('settings', d.settings)}>Configurar planejamento</button></details>
    </Card>
  );
}
export function DayAndMonth({ data: d }: { data: Data }) {
  const at = today(),
    work = d.work.filter((r) => r.date === at),
    r = workCashResult(d, work, 'todos', at, at),
    m = monthComparison(d),
    c = costs(d);
  return (
    <>
      <Card title="Seu dia, em números">
        <Metrics
          items={[
            ['Faturamento', money(r.revenue)],
            ['Horas / distância', `${dec(r.hours)} h · ${dec(r.km)} km`],
            ['Cartões entregues', dec(sum(work, 'cardQuantity'))],
            ['Operação estimada', money(r.km * c.operating)],
            ['Provisão da moto', money(r.provisions)],
            ['Resultado após provisões', money(r.afterProvisions)],
            ['Receita / hora', money(ratio(r.revenue, r.hours))],
            ['Receita / km', money(ratio(r.revenue, r.km))],
          ]}
        />
        <p className="inline-note">
          Operação é estimativa por km. O resultado desconta despesas atribuídas
          e provisões uma única vez. Combustível efetivamente pago deve ser
          registrado.
        </p>
      </Card>
      <Card title="Seu mês até hoje">
        <Metrics
          items={[
            ['Receitas', money(m.current.revenue)],
            ['Gastos e serviços', money(m.current.expenses)],
            ['Dívidas pagas', money(m.current.debtPayments)],
            ['Aportes em investimentos', money(m.current.investments)],
            ['Aportes nos planos', money(m.current.plans)],
            ['Resultado de caixa', money(m.current.result)],
          ]}
        />
        <p className="inline-note">
          Planos representam dinheiro separado, não uma nova despesa. Comparação
          até o mesmo dia do mês anterior: receita{' '}
          {m.revenueChange === null
            ? 'sem base'
            : `${dec(m.revenueChange, 1)}%`}{' '}
          · gastos{' '}
          {m.expenseChange === null
            ? 'sem base'
            : `${dec(m.expenseChange, 1)}%`}
          .
        </p>
      </Card>
    </>
  );
}
export function Attention({
  data: d,
  go,
}: {
  data: Data;
  go: ViewProps['go'];
}) {
  const [horizon, setHorizon] = useState('7'),
    health = financialHealth(d),
    events = upcoming(d).filter((e) => e.days <= Number(horizon));
  return (
    <div className="attention-section">
      <Card
        title="Precisa da sua atenção"
        action={
          <Choice
            label="Próximos eventos"
            value={horizon}
            onChange={setHorizon}
            options={[
              { value: '0', label: 'Hoje' },
              { value: '7', label: 'Próximos 7 dias' },
              { value: '30', label: 'Próximos 30 dias' },
            ]}
          />
        }
      >
        {events.length ? (
          events.slice(0, 12).map((e) => (
            <button className="event-row" key={e.id} onClick={() => go(e.page)}>
              <span>
                <b>{e.name}</b>
                <small>{e.detail}</small>
              </span>
              <span className={e.days < 0 ? 'negative' : ''}>
                {e.days < 0
                  ? `${Math.abs(e.days)} dias em atraso`
                  : e.days === 0
                    ? 'Hoje'
                    : `Em ${e.days} dias`}
                <small>
                  {e.amount === null ? 'Sem valor' : money(e.amount)}
                </small>
              </span>
            </button>
          ))
        ) : (
          <p>Nenhum evento previsto neste intervalo.</p>
        )}
        <p className="inline-note">
          Impostos aparecem quando cadastrados como gastos recorrentes.
          Previsões não geram lançamentos.
        </p>
      </Card>
      <details className="disclosure"><summary>Saúde financeira · {health.level}</summary>      <Card title="Saúde financeira">
        <span
          className={
            'health health-' +
            (health.level === 'Crítica'
              ? 'bad'
              : health.level === 'Atenção'
                ? 'warn'
                : 'good')
          }
        >
          {health.level}
        </span>
        <ul className="reason-list">
          {health.reasons.map((reason) => (
            <li key={reason}>{reason}</li>
          ))}
        </ul>
        <p className="inline-note">
          Avaliação dos registros deste mês, vencimentos e reserva. Sem
          pontuação oculta.
        </p>
      </Card></details>
    </div>
  );
}
export function DebtCards({
  data: d,
  edit,
}: {
  data: Data;
  edit: ViewProps['edit'];
}) {
  const [extra, setExtra] = useState(0),
    estimate = payoffEstimate(d, extra);
  return (
    <>
      <div className="three-grid debt-cards">
        {d.debts.map((raw) => {
          const r = debtState(d, raw),
            total = num(raw.totalInstallments) || num(raw.remaining),
            paid = Math.max(0, total - r.remaining);
          return (
            <Card
              key={r.id}
              title={String(r.name)}
              action={
                <button onClick={() => edit('debts', raw)}>Editar</button>
              }
            >
              <strong className="figure">
                {money(num(r.installment))}
                <small>/parcela</small>
              </strong>
              <p>
                {paid} de {total} pagas · {r.remaining} restantes
              </p>
              <Bar
                value={progress(paid, total)}
                label={'Parcelas de ' + r.name}
              />
              <div className="target-source-list">
                <div className="detail">
                  <span>Saldo restante</span>
                  <strong>{money(r.balance)}</strong>
                </div>
                <div className="detail">
                  <span>Próxima</span>
                  <strong>
                    {r.status === 'quitada' ? 'Quitada' : brDate(r.due)}
                  </strong>
                </div>
              </div>
              <p className="inline-note">{r.reason}</p>
            </Card>
          );
        })}
      </div>
      <Card title="E se eu pagar mais?">
        <label>
          Pagamento extra mensal (R$)
          <input
            aria-label="Pagamento extra mensal"
            type="number"
            min="0"
            value={extra}
            onChange={(e) => setExtra(Math.max(0, Number(e.target.value)))}
          />
        </label>
        <Metrics
          items={[
            [
              'Prazo sem extra',
              estimate.base === null ? 'Indefinido' : `${estimate.base} meses`,
            ],
            [
              'Prazo com extra',
              estimate.withExtra === null
                ? 'Indefinido'
                : `${estimate.withExtra} meses`,
            ],
            [
              'Antecipação estimada',
              estimate.monthsSaved === null
                ? 'Indefinida'
                : `${estimate.monthsSaved} meses`,
            ],
            ['Redução extra em 12 meses', money(estimate.reduction)],
          ]}
        />
        <p className="inline-note">
          Estimativa linear sobre o saldo atual, com a soma das parcelas mantida
          até quitar. Não inclui juros futuros, descontos ou condições
          contratuais. Nenhum pagamento é registrado.
        </p>
      </Card>
    </>
  );
}
export function TrendChart({ data: d }: { data: Data }) {
  const [metric, setMetric] = useState('revenue'),
    rows = monthlyTrend(d),
    labels: Record<string, string> = {
      revenue: 'Receitas',
      expenses: 'Gastos',
      result: 'Resultado de caixa',
      km: 'Quilometragem',
    };
  const values = rows.map(
      (r) => r[metric as 'revenue' | 'expenses' | 'result' | 'km'],
    ),
    max = Math.max(1, ...values.map(Math.abs));
  return (
    <Card
      title="Evolução mensal"
      action={
        <Choice
          label="Métrica do gráfico"
          value={metric}
          onChange={setMetric}
          options={Object.entries(labels).map(([value, label]) => ({
            value,
            label,
          }))}
        />
      }
    >
      <div
        className="trend-bars"
        aria-label={
          labels[metric] +
          ': ' +
          rows.map((r, i) => `${r.month} ${dec(values[i])}`).join(', ')
        }
      >
        {rows.map((r, i) => (
          <div className="trend-column" key={r.month}>
            <strong>
              {metric === 'km' ? dec(values[i]) + ' km' : money(values[i])}
            </strong>
            <div className="trend-track">
              <i
                className={values[i] < 0 ? 'negative-bar' : ''}
                style={{
                  height: Math.max(2, (Math.abs(values[i]) / max) * 100) + '%',
                }}
              />
            </div>
            <span>
              {r.month.slice(5)}/{r.month.slice(2, 4)}
            </span>
          </div>
        ))}
      </div>
      <p className="inline-note">
        Mês atual parcial. Resultado = receitas − gastos − dívidas pagas −
        aportes em investimentos + retiradas. Não desconta novamente aportes dos
        planos.
      </p>
    </Card>
  );
}
export function MonthlySimulator({ data: d }: { data: Data }) {
  const [s, setS] = useState<Row>({
      id: 'projection',
      days: num(d.settings.workDays),
      km: num(d.settings.kmDay),
      gas: num(d.bike.fuelPrice),
      revenue: 0,
      extra: 0,
      investment: num(d.settings.reserveMonth),
    }),
    r = monthlyScenario(d, s);
  return (
    <Card title="E se? · Planejamento mensal">
      <Fields
        data={d}
        value={s}
        setValue={setS}
        fields={[
          { key: 'revenue', label: 'Faturamento por dia (R$)', type: 'number' },
          { key: 'days', label: 'Dias trabalhados', type: 'number' },
          { key: 'km', label: 'KM por dia', type: 'number' },
          { key: 'gas', label: 'Gasolina (R$/L)', type: 'number' },
          {
            key: 'extra',
            label: 'Pagamento extra mensal (R$)',
            type: 'number',
          },
          {
            key: 'investment',
            label: 'Investimento mensal (R$)',
            type: 'number',
          },
        ]}
      />
      <Metrics
        items={[
          ['Receita projetada', money(r.revenue)],
          ['Combustível estimado', money(r.fuel)],
          ['Provisões', money(r.provision)],
          ['Obrigações', money(r.obligations)],
          ['Disponível projetado', money(r.remaining)],
        ]}
      />
      <p className="inline-note">
        Cenário isolado. Não altera metas, saldos nem registros. Combustível e
        provisões são estimativas.
      </p>
    </Card>
  );
}
export function NextBike({ data: d }: { data: Data }) {
  const r = d.plans.find(
    (p) => p.kind === 'próxima moto' && p.status !== 'concluído',
  );
  if (!r) return null;
  const t = plan(r, today(), d);
  return (
    <Card title="Sua próxima moto">
      <h3>{String(r.name)}</h3>
      <Metrics
        items={[
          ['Preço estimado', money(num(r.target))],
          ['XRE na troca', money(num(r.bikeValue))],
          ['Guardado', money(t.current)],
          ['Falta', money(t.remaining)],
          ['Prazo', brDate(r.deadline)],
          ['Aporte mensal', money(t.monthly)],
        ]}
      />
      <Bar value={t.percent} label="Plano da próxima moto" />
    </Card>
  );
}
