import { AlertSummary } from '../components/financial-health';
import { useMemo, useState } from 'react';
import { useAuth } from '../components/auth-provider';
import { profileName } from '../services/profile-identity';
import {
  DynamicTargetSection,
  PhaseTwoSummary,
} from '../components/planning-phase-two';
import { FinancialQueryService } from '../services/financial-query';
import { PageHeader, FinancialItem } from '../components/finance-ui';
import { Bar } from '../components/common';
import { PrivateValue } from '../components/value-privacy';
import {
  ArrowUpRight,
  Wallet,
  Check,
  UserRound,
  Target,
  Receipt,
} from 'lucide-react';
import { today, money, dec, brDate } from '../model';
import { type ViewProps, value } from './shared';
import './today.css';

export function Today(p: ViewProps) {
  const at = today();
  const { user } = useAuth();
  const name = profileName(p.data.settings, user);
  const hour = new Date().getHours();
  const greeting =
    hour < 12 ? 'Bom dia' : hour < 18 ? 'Boa tarde' : 'Boa noite';
  const [skipSetup, setSkipSetup] = useState(() => {
    try {
      return localStorage.getItem('rota-ui-first-steps-hidden') === 'true';
    } catch {
      return false;
    }
  });
  const hasMovement = Boolean(
    p.data.work.length ||
    p.data.expenses.length ||
    p.data.bankReceipts.length ||
    p.data.movements.length ||
    p.data.payments.length ||
    p.data.services.length,
  );
  const setupSteps = [
    {
      label: 'Dê seu nome à rota',
      done: Boolean(p.data.settings.profileName),
      icon: UserRound,
      action: () => p.go('Configurações'),
    },
    {
      label: 'Escolha um objetivo',
      done: Boolean(p.data.plans.length),
      icon: Target,
      action: () => p.go('Planos'),
    },
    {
      label: 'Registre seu primeiro gasto',
      done: hasMovement,
      icon: Receipt,
      action: () => p.edit('expenses'),
    },
  ];
  const summary = useMemo(
    () => new FinancialQueryService(p.data, at).getToday(),
    [p.data, at],
  );
  const amount = (n: number | null) => (n === null ? 'Não definido' : money(n));
  return (
    <div className="today-page">
      <PageHeader
        title="Hoje"
        description={
          (name === 'Seu perfil'
            ? 'Seu dia financeiro, em poucos minutos.'
            : `${greeting}, ${name.split(' ')[0]}.`) +
          ' · ' +
          brDate(at)
        }
      />
      {!skipSetup && !hasMovement && (
        <section
          className="today-first-steps"
          aria-labelledby="first-steps-title"
        >
          <div className="section-heading">
            <div>
              <h2 id="first-steps-title">Sua rota começa aqui</h2>
              <p>
                Escolha por onde começar.{' '}
                {setupSteps.filter((step) => step.done).length} de 3 passos
                concluídos.
              </p>
            </div>
            <button
              onClick={() => {
                setSkipSetup(true);
                try {
                  localStorage.setItem('rota-ui-first-steps-hidden', 'true');
                } catch {
                  /* Optional UI preference. */
                }
              }}
            >
              Explorar por conta própria
            </button>
          </div>
          <ol>
            {setupSteps.map(({ label, done, icon: Icon, action }) => (
              <li key={label}>
                <button onClick={action}>
                  <span className="first-step-icon">
                    {done ? (
                      <Check size={18} aria-hidden="true" />
                    ) : (
                      <Icon size={18} aria-hidden="true" />
                    )}
                  </span>
                  <span>
                    {label}
                    {done && <small>Concluído</small>}
                  </span>
                  <ArrowUpRight size={16} aria-hidden="true" />
                </button>
              </li>
            ))}
          </ol>
        </section>
      )}
      <section className="today-focus" aria-label="Seu foco de hoje">
        <div className="today-balance">
          <h2>
            <Wallet size={18} aria-hidden="true" /> Disponível agora
          </h2>
          <strong className="today-balance-value">
            <PrivateValue>{money(summary.available)}</PrivateValue>
          </strong>
          <p>
            <PrivateValue>
              {summary.available < 0
                ? 'Saldo negativo'
                : summary.available === 0
                  ? 'Sem saldo disponível'
                  : 'Saldo positivo disponível'}
            </PrivateValue>
            {' · '}Realizado após reserva da moto
          </p>
        </div>
        <div className="today-focus-action">
          <h2>Comece pelo registro do dia</h2>
          <p>
            Uma jornada registrada mantém seu caixa e suas metas atualizados.
          </p>
          <button className="primary" onClick={() => p.edit('work')}>
            Registrar trabalho <ArrowUpRight size={16} aria-hidden="true" />
          </button>
        </div>
      </section>
      <div className="today-priority">
        <div className="today-horizon">
          <section
            className="content-section"
            aria-labelledby="today-seven-days"
          >
            <h2 id="today-seven-days">
              Próximos 7 dias
              {summary.nextSevenDays.partial && <small>Base parcial</small>}
            </h2>
            <div className="inline-stats">
              {value('Entradas previstas', money(summary.nextSevenDays.income))}
              {value('Saídas previstas', money(summary.nextSevenDays.outflow))}
              {value('Impacto líquido', money(summary.nextSevenDays.net))}
            </div>
            <p className="today-horizon-state">
              <strong>
                {summary.nextSevenDays.net < 0
                  ? 'Saída líquida prevista'
                  : summary.nextSevenDays.net > 0
                    ? 'Entrada líquida prevista'
                    : 'Sem impacto líquido previsto'}
              </strong>{' '}
              · Valores conhecidos e pendências ainda não conferidas; não são
              pagamentos realizados.
            </p>
          </section>
          <section
            className="content-section"
            aria-labelledby="today-next-commitment"
          >
            <h2 id="today-next-commitment">Próximo compromisso</h2>
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
                  <button onClick={() => p.go('Planejamento')}>Revisar</button>
                }
              />
            ) : (
              <p>Nenhum compromisso com data nos próximos 7 dias.</p>
            )}
          </section>
        </div>

        <section className="today-alerts" aria-labelledby="today-alerts-title">
          <div className="section-heading">
            <div>
              <h2 id="today-alerts-title">Atenção agora</h2>
              <p>
                {summary.alerts.length
                  ? `${summary.alerts.length} ${summary.alerts.length === 1 ? 'aviso identificado' : 'avisos identificados'}`
                  : 'Nenhum alerta identificado no horizonte de 7 dias'}
              </p>
            </div>
            <AlertSummary data={p.data} go={p.go} />
          </div>
          {summary.alerts.length > 0 && (
            <ul>
              {summary.alerts.slice(0, 10).map((alert) => (
                <li key={alert}>{alert}</li>
              ))}
            </ul>
          )}
          <p className="inline-note">
            Previsões usam apenas dados conhecidos. Fontes e hipóteses ficam em
            Planejamento.
          </p>
        </section>

        <nav className="today-actions" aria-label="Ações para agora">
          <button onClick={() => p.go('Planejamento')}>
            Abrir fluxo e calendário
          </button>
          <button onClick={() => p.edit('expenses')}>Registrar gasto</button>
        </nav>
      </div>

      <div className="today-secondary">
        <DynamicTargetSection {...p} />
        {p.data.planningSettings[0]?.scheduleEnabled !== 'sim' && (
          <section className="content-section" aria-label="Seu trabalho hoje">
            <div className="section-heading">
              <h2>Seu trabalho hoje</h2>
              <button onClick={() => p.go('Trabalho')}>Ver trabalho</button>
            </div>
            <div className="inline-stats">
              {value(
                'Meta de faturamento · estimada',
                amount(summary.work.target),
              )}
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
                Meta indisponível: configure seus dias de trabalho.{' '}
                <button onClick={() => p.go('Configurações')}>
                  Configurar
                </button>
              </p>
            )}
          </section>
        )}
        <details className="disclosure">
          <summary>Objetivos · {summary.goals.length}</summary>
          {summary.goals.length ? (
            summary.goals.slice(0, 5).map((goal) => (
              <FinancialItem
                key={goal.id}
                title={goal.name}
                description={'Prazo: ' + brDate(goal.deadline)}
                value={dec(goal.percent, 0) + '%'}
                context={'Faltam ' + money(goal.remaining)}
              >
                <Bar value={goal.percent} label={'Progresso de ' + goal.name} />
              </FinancialItem>
            ))
          ) : (
            <p>Nenhum objetivo ativo cadastrado.</p>
          )}
          <button onClick={() => p.go('Planos')}>Ver todos os planos</button>
        </details>
        <PhaseTwoSummary data={p.data} go={p.go} />
        <button onClick={() => p.go('Dashboard')}>
          Abrir visão financeira completa
        </button>
      </div>
    </div>
  );
}
