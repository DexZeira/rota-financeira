import {
  PageHeader,
  FinancialItem,
  EmptyState,
} from '../components/finance-ui';
import { Wrench, CircleCheck, Clock3 } from 'lucide-react';
import { ComponentLinks } from '../components/component-links';
import { MaintenanceCostSummary } from './maintenance-costs';
import { Metrics, Records } from '../components/common';
import { num, money, dec, brDate, today, id } from '../model';
import { maintenanceState, maintenanceCosts, forecast } from '../calculations';
import { type ViewProps, dateCol, amountCol } from './shared';
import { PrivateValue } from '../components/value-privacy';
import './maintenance.css';
export function Maintenance(p: ViewProps) {
  const { data: d, edit } = p,
    rows = d.maintenance.map((r) => maintenanceState(d, r)),
    late = rows.filter((r) => r.status === 'atrasada'),
    near = rows.filter((r) => r.status === 'próxima'),
    configured = rows.some((r) => r.status !== 'não configurada');
  const status = late.length
    ? 'MANUTENÇÃO ATRASADA'
    : near.length
      ? 'MANUTENÇÃO PRÓXIMA'
      : configured
        ? 'EM DIA'
        : 'CONFIGURE OS INTERVALOS';
  return (
    <div className="maintenance-page">
      <PageHeader
        title="Manutenção"
        description="Intervalos, próximos cuidados e histórico da moto."
        action={
          <button className="primary" onClick={() => edit('services')}>
            Registrar manutenção
          </button>
        }
      />
      <section
        className="maintenance-status"
        aria-label="Estado da manutenção"
        data-status={late.length ? 'late' : near.length ? 'near' : 'current'}
      >
        <div>
          <Wrench size={24} aria-hidden="true" />
          <div>
            <h2>{status.toLocaleLowerCase('pt-BR')}</h2>
            <p>{late.length + near.length} itens precisam de atenção</p>
          </div>
        </div>
        <dl>
          <div>
            <dt>Atrasadas</dt>
            <dd>{late.length}</dd>
          </div>
          <div>
            <dt>Próximas</dt>
            <dd>{near.length}</dd>
          </div>
          <div>
            <dt>Cadastradas</dt>
            <dd>{rows.length}</dd>
          </div>
        </dl>
      </section>
      <section className="content-section maintenance-upcoming">
        <div className="section-heading">
          <h2>Agenda de cuidados</h2>
          <span className="supporting-text">Por quilometragem ou data</span>
        </div>
        <ol className="maintenance-timeline">
          {[...late, ...near].map((r) => (
            <li key={r.id} data-status={r.status}>
              <Clock3 size={18} aria-hidden="true" />
              <FinancialItem
                title={String(r.name)}
                description={r.status === 'atrasada' ? 'Atrasada' : 'Próxima'}
                value={
                  r.kmLeft !== null
                    ? (r.kmLeft < 0 ? 'Atrasado ' : 'Faltam ') +
                      dec(Math.abs(r.kmLeft)) +
                      ' km'
                    : brDate(r.nextDate)
                }
                context={money(num(r.estimated)) + ' estimados'}
                action={
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
                    Registrar
                  </button>
                }
              />
            </li>
          ))}
        </ol>
        {!late.length && !near.length && (
          <div className="maintenance-clear">
            <CircleCheck size={24} aria-hidden="true" />
            <EmptyState
              title="Nenhum cuidado pendente"
              description="As próximas manutenções aparecem aqui conforme os intervalos cadastrados."
            />
          </div>
        )}
      </section>
      <details className="history-disclosure">
        <summary>Ver manutenções futuras e configuradas</summary>
        <div className="maintenance-list">
          {rows
            .filter(
              (r) =>
                !['atrasada', 'próxima', 'concluída'].includes(
                  String(r.status),
                ),
            )
            .map((r) => (
              <article className="maintenance-list-item" key={r.id}>
                <div>
                  <h3>{String(r.name)}</h3>
                  <p>{String(r.status)}</p>
                </div>
                <div className="maintenance-list-value">
                  <strong>
                    <PrivateValue>{money(num(r.estimated))}</PrivateValue>
                  </strong>
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
                </div>
              </article>
            ))}
        </div>
      </details>
      <details className="disclosure">
        <summary>Custos e projeções de manutenção</summary>{' '}
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
          primeiro prazo entre km e data; dias por km usam a média dos últimos
          30 dias. Sem média ou data, não é possível projetar um prazo.
        </p>
      </details>
      <details className="disclosure">
        <summary>Gerenciar intervalos e itens</summary>
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
      </details>
      <details className="disclosure">
        <summary>Histórico de serviços realizados</summary>
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
                  d.maintenance.find((x) => x.id === r.maintenanceId)?.name ||
                    '',
                ),
            },
            { label: 'KM', render: (r) => dec(num(r.km)) },
            amountCol,
          ]}
        />
      </details>
      <details className="disclosure">
        <summary>Inspeções e checklists</summary>
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
                  ? 'Problema'
                  : Object.values(r).includes('Atenção')
                    ? 'Atenção'
                    : 'OK',
            },
            { label: 'Observações', render: (r) => String(r.notes) },
          ]}
        />
      </details>
    </div>
  );
}
