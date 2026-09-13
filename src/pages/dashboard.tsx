import { SelectedGoal, DayAndMonth, Attention, TrendChart } from '../components/overview';
import { TargetBreakdown } from '../components/target-breakdown';
import { ArrowUpRight, Bike, Target, ShieldCheck, Wallet, Wrench } from 'lucide-react';
import { Card, Metrics, Bar } from '../components/common';
import { num, money, dec, brDate, today } from '../model';
import { costs, financial, targets, prioritized, investmentBalance, plan, maintenanceState, workResult, sum, progress } from '../calculations';
import { type ViewProps, value } from './shared';
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
      <details className="dashboard-secondary"><summary>Ver detalhes da moto</summary><div className="dashboard-grid">
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
      </div></details>
      <details className="dashboard-secondary"><summary>Ver resultado de hoje</summary><Card
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
      </Card></details>
      <details className="dashboard-secondary"><summary>Ver compromissos e reservas</summary><div className="three-grid">
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
      </div></details>
      <details className="dashboard-secondary"><summary>Ver resumo do período</summary><DayAndMonth data={d} /></details>
      <TrendChart data={d} />
      <TargetBreakdown
        target={t}
        onConfigure={() => edit('settings', d.settings)}
      />
    </>
  );
}
