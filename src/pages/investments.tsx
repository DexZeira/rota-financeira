import { Card, Metrics, Bar, Records } from '../components/common';
import { num, money, dec } from '../model';
import { financial, investmentBalance, sum, progress } from '../calculations';
import { type ViewProps, value, dateCol, amountCol } from './shared';
export function Investments(p: ViewProps) {
  const d = p.data,
    f = financial(d),
    emergency = d.investments
      .filter((r) => r.category === 'reserva de emergência')
      .reduce((s, r) => s + investmentBalance(d, r), 0),
    target = num(d.settings.essential) * num(d.settings.emergencyMonths);
  return (
    <>
      <header className="work-page-header"><div><p className="eyebrow">PATRIMÔNIO</p><h1>Investimentos</h1><p className="page-subtitle">Acompanhe patrimônio, aportes e rendimentos.</p></div></header>
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
