import { AlertSummary } from '../components/financial-health';
import { useMemo } from 'react';
import { DynamicTargetSection, PhaseTwoSummary } from '../components/planning-phase-two';
import { FinancialQueryService } from '../services/financial-query';
import {
  PageHeader,
  HeroMetric,
  FinancialItem,
} from '../components/finance-ui';
import { Bar } from '../components/common';
import { today, money, dec, brDate } from '../model';
import { type ViewProps, value } from './shared';

export function Today(p: ViewProps) {
  const at = today();
  const summary = useMemo(
    () => new FinancialQueryService(p.data, at).getToday(),
    [p.data, at],
  );
  const amount = (n: number | null) => (n === null ? 'Não definido' : money(n));
  return (
    <>
      <PageHeader
        title="Hoje"
        description={brDate(at) + ' · Seu dia financeiro, em poucos minutos.'}
      />
      <HeroMetric
        label="Disponível agora"
        value={money(summary.available)}
        context="Realizado · caixa após reserva da moto"
        action={
          <button className="primary" onClick={() => p.edit('work')}>
            Registrar trabalho
          </button>
        }
      />
      <section className="content-section" aria-label="Próximos 7 dias">
        <h2>
          Próximos 7 dias{summary.nextSevenDays.partial ? ' · parcial' : ''}
        </h2>
        <div className="inline-stats">
          {value('Entradas previstas', money(summary.nextSevenDays.income))}
          {value('Saídas previstas', money(summary.nextSevenDays.outflow))}
          {value('Impacto líquido', money(summary.nextSevenDays.net))}
        </div>
        <p className="inline-note">
          Valores conhecidos, incluindo pendências anteriores ainda não
          conferidas. Não representam pagamentos realizados.
        </p>
      </section>
      <AlertSummary data={p.data} go={p.go}/>
      <DynamicTargetSection {...p}/>
      {p.data.planningSettings[0]?.scheduleEnabled !== 'sim' && <section className="content-section" aria-label="Seu trabalho hoje">
        <div className="section-heading">
          <h2>Seu trabalho hoje</h2>
          <button onClick={() => p.go('Trabalho')}>Ver trabalho</button>
        </div>
        <div className="inline-stats">
          {value('Meta de faturamento · estimada', amount(summary.work.target))}
          {value('Já realizado hoje', money(summary.work.earned))}
          {value('Falta faturar', amount(summary.work.remaining))}
          {value(
            'Horas restantes · ritmo de hoje',
            summary.work.estimatedHours === null
              ? 'Sem histórico suficiente'
              : dec(summary.work.estimatedHours, 1) + ' h',
          )}
        </div>
        {summary.work.target === null && (
          <p>
            Configure seus dias de trabalho para calcular a meta.{' '}
            <button onClick={() => p.go('Configurações')}>Configurar</button>
          </p>
        )}
      </section>
      }
      <PhaseTwoSummary data={p.data} go={p.go}/>
      <section className="content-section" aria-label="Próximo compromisso">
        <h2>Próximo compromisso</h2>
        {summary.next ? (
          <FinancialItem
            title={summary.next.name}
            value={
              summary.next.amount === null
                ? 'Valor desconhecido'
                : money(summary.next.amount)
            }
            description={brDate(summary.next.originalDate)}
            context={
              summary.next.originalDate < at
                ? 'Pendente · revisão necessária'
                : summary.next.status === 'estimado'
                  ? 'Estimado pelo histórico'
                  : 'Previsto'
            }
            action={
              <button onClick={() => p.go('Planejamento')}>
                Revisar previsão
              </button>
            }
          />
        ) : (
          <p>Nenhum compromisso com data identificado nos próximos 7 dias.</p>
        )}
      </section>
      <div className="row-actions">
        <button onClick={() => p.go('Planejamento')}>
          Abrir fluxo e calendário
        </button>
        <button onClick={() => p.edit('expenses')}>Registrar gasto</button>
      </div>
      <details className="disclosure">
        <summary>Objetivos</summary>
        {summary.goals.slice(0, 5).map((g) => (
          <FinancialItem
            key={g.id}
            title={g.name}
            description={'Prazo: ' + brDate(g.deadline)}
            value={dec(g.percent, 0) + '%'}
            context={'Faltam ' + money(g.remaining)}
          >
            <Bar value={g.percent} label={'Progresso de ' + g.name} />
          </FinancialItem>
        ))}
        <button onClick={() => p.go('Planos')}>Ver todos os planos</button>
      </details>
      <details className="disclosure">
        <summary>
          Atenção · {summary.alerts.length}{' '}
          {summary.alerts.length === 1 ? 'aviso' : 'avisos'}
        </summary>
        {summary.alerts.length ? (
          <ul>
            {summary.alerts.slice(0, 10).map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ul>
        ) : (
          <p>Nenhum alerta identificado no horizonte de 7 dias.</p>
        )}
        <p className="inline-note">
          Previsões consideram apenas dados conhecidos. Consulte as fontes e
          hipóteses em Planejamento.
        </p>
      </details>
      <button onClick={() => p.go('Dashboard')}>
        Abrir visão financeira completa
      </button>
    </>
  );
}
