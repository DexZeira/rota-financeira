import { useEffect, useMemo, useState } from 'react';
import { type Data, money, brDate } from '../model';
import {
  PageHeader,
  Disclosure,
  EmptyState,
  FinancialItem,
} from '../components/finance-ui';
import {
  AlertSummary,
  useFinancialHealth,
} from '../components/financial-health';
import { deriveAlerts, alertArea } from '../services/alerts';
import { isMonthStale } from '../services/month-close';
import './financial-health.css';
type Props = { data: Data; go: (page: string) => void };
const moneyCents = (n: number | null) =>
  n === null ? 'Não disponível' : money(n / 100);
export function Alerts({
  data,
  go,
  appError = false,
}: Props & { appError?: boolean }) {
  const summary = useFinancialHealth(data);
  const [severity, setSeverity] = useState('Todos'),
    [area, setArea] = useState('Todas'),
    [limit, setLimit] = useState(30);
  const [checked, setChecked] = useState<{
    data: Data;
    periods: string[];
  } | null>(null);
  const [usage, setUsage] = useState<{ bytes: number; quota: number }>();
  useEffect(() => {
    let active = true;
    void navigator.storage
      ?.estimate?.()
      .then((result) => {
        if (
          active &&
          typeof result.usage === 'number' &&
          typeof result.quota === 'number' &&
          result.quota > 0
        )
          setUsage({ bytes: result.usage, quota: result.quota });
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    let active = true;
    // Signature checks stay asynchronous and only run when this page is opened.
    void (async () => {
      const periods: string[] = [];
      for (const c of data.reporting.closures) {
        if (!active) return;
        if (c.status === 'closed' && (await isMonthStale(data, c)))
          periods.push(c.period);
      }
      if (active) setChecked({ data, periods });
    })().catch(() => {
      if (active) setChecked(null);
    });
    return () => {
      active = false;
    };
  }, [data]);
  const alerts = useMemo(
    () =>
      deriveAlerts(data, summary.at, {
        ...summary,
        stalePeriods: checked?.data === data ? checked.periods : [],
        storageUsage: usage,
        appError,
      }),
    [data, summary, checked, usage, appError],
  );
  const filtered = alerts.filter(
    (a) =>
      (severity === 'Todos' || a.severity === severity) &&
      (area === 'Todas' || alertArea(a.source) === area),
  );
  const labels = {
    info: 'Informação',
    attention: 'Atenção',
    important: 'Importante',
  };
  return (
    <div className="financial-health">
      <PageHeader
        title="Alertas"
        description="Condições atuais que merecem atenção. Dados locais, sem recomendações automáticas."
      />
      <div className="health-filters">
        <label>
          Severidade
          <select
            value={severity}
            onChange={(e) => {
              setSeverity(e.target.value);
              setLimit(30);
            }}
          >
            <option>Todos</option>
            {Object.entries(labels).map(([key, value]) => (
              <option key={key} value={key}>
                {value}
              </option>
            ))}
          </select>
        </label>
        <label>
          Área
          <select
            value={area}
            onChange={(e) => {
              setArea(e.target.value);
              setLimit(30);
            }}
          >
            {[
              'Todas',
              'Planejamento',
              'Gastos',
              'Dívidas',
              'Investimentos',
              'Patrimônio',
              'Moto',
              'Sistema',
            ].map((a) => (
              <option key={a}>{a}</option>
            ))}
          </select>
        </label>
      </div>
      <output>
        {filtered.length} itens · informações não representam erros.
      </output>
      {data.reporting.closures.length > 0 && checked?.data !== data && (
        <p>Conferência de assinaturas dos relatórios ainda não disponível.</p>
      )}
      {!filtered.length && (
        <EmptyState
          title="Nenhum alerta neste filtro"
          description="Os dados disponíveis não indicam condições para este filtro."
        />
      )}
      {filtered.slice(0, limit).map((a) => (
        <FinancialItem
          key={a.id}
          title={a.title}
          context={labels[a.severity]}
          description={`${alertArea(a.source)}${a.date ? ' · ' + brDate(a.date) : ''}`}
        >
          <p>{a.description}</p>
          <button onClick={() => go(a.action.route)}>{a.action.label}</button>
        </FinancialItem>
      ))}
      {filtered.length > limit && (
        <button onClick={() => setLimit((n) => n + 30)}>
          Mostrar mais alertas
        </button>
      )}
      <button onClick={() => go('Auditoria')}>
        Conferir qualidade dos dados
      </button>
    </div>
  );
}
export function FinancialAudit({ data, go }: Props) {
  const { audit } = useFinancialHealth(data),
    [severity, setSeverity] = useState('Todos'),
    [limit, setLimit] = useState(30);
  const labels = { error: 'Erro', warning: 'Aviso', info: 'Informação' };
  const filtered = audit.filter(
    (i) => severity === 'Todos' || i.severity === severity,
  );
  return (
    <div className="financial-health">
      <PageHeader
        title="Auditoria"
        description="Consistência e qualidade dos registros. Nenhuma correção é feita automaticamente."
      />
      <label>
        Status
        <select
          value={severity}
          onChange={(e) => {
            setSeverity(e.target.value);
            setLimit(30);
          }}
        >
          <option>Todos</option>
          {Object.entries(labels).map(([key, value]) => (
            <option key={key} value={key}>
              {value}
            </option>
          ))}
        </select>
      </label>
      <output>
        {audit.filter((a) => a.severity === 'error').length} erros ·{' '}
        {audit.filter((a) => a.severity === 'warning').length} avisos ·{' '}
        {audit.filter((a) => a.severity === 'info').length} informações
      </output>
      {!filtered.length && (
        <EmptyState
          title="Nenhuma inconsistência detectada neste filtro"
          description="Resultado das verificações disponíveis, não uma certificação de todos os dados."
        />
      )}
      {filtered.slice(0, limit).map((i) => (
        <FinancialItem
          key={i.id}
          title={i.title}
          context={labels[i.severity]}
          description={`Registro: ${i.sourceId || 'geral'}`}
        >
          <p>{i.description}</p>
          <button onClick={() => go(i.suggestedAction.route)}>
            {i.suggestedAction.label}
          </button>
        </FinancialItem>
      ))}
      {filtered.length > limit && (
        <button onClick={() => setLimit((n) => n + 30)}>
          Mostrar mais verificações
        </button>
      )}
    </div>
  );
}
export function MySituation({ data, go }: Props) {
  const s = useFinancialHealth(data),
    p = s.planning;
  const stat = (label: string, value: string, route: string) => (
    <button className="health-stat" onClick={() => go(route)}>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>Ver {route}</small>
    </button>
  );
  return (
    <div className="financial-health">
      <PageHeader
        title="Minha Situação"
        description={`Visão consolidada em ${brDate(s.at)} · valores registrados e projeções identificadas.`}
      />
      <section aria-label="Situação atual">
        <h2>Situação atual</h2>
        <div className="health-stats">
          {stat('Caixa', moneyCents(s.wealth.cashCents), 'Dashboard')}
          {stat(
            'Patrimônio líquido',
            moneyCents(s.wealth.netCents),
            'Patrimônio',
          )}
          {stat(
            'Dívidas registradas',
            moneyCents(
              Object.values(s.wealth.positions.debts).reduce(
                (a, b) => a + b,
                0,
              ),
            ),
            'Dívidas',
          )}
          {stat('Reserva', moneyCents(p.reserve.totalCents), 'Planejamento')}
        </div>
        {s.wealth.partial && <p>Patrimônio parcial: há bens sem avaliação.</p>}
        {p.living.partial && (
          <p>
            Custo de vida e cobertura da reserva estimados com base parcial;
            confira o histórico em Planejamento.
          </p>
        )}
        <p>
          Custo mínimo mensal estimado: {moneyCents(p.living.minimumCents)} ·
          cobertura da reserva:{' '}
          {p.reserve.coverage === null
            ? 'não disponível'
            : p.reserve.coverage.toLocaleString('pt-BR', {
                maximumFractionDigits: 1,
              }) + ' meses'}
          .
        </p>
      </section>
      <Disclosure
        title="Este mês"
        description="Receitas, despesas, orçamento e meta"
      >
        <div className="health-stats">
          {stat('Receitas registradas', moneyCents(s.incomeCents), 'Trabalho')}
          {stat('Gastos e manutenção', moneyCents(s.expenseCents), 'Gastos')}
          {stat(
            'Orçamento restante',
            p.budget.rows.length
              ? moneyCents(p.budget.remainingCents)
              : 'Não configurado',
            'Gastos',
          )}
          {stat(
            'Meta mensal selecionada · estimada',
            moneyCents(s.targetCents),
            'Planejamento',
          )}
        </div>
        <p>
          Despesas deste resumo não incluem transferências, aportes ou principal
          de dívidas. Confira o fluxo completo em Planejamento.
        </p>
      </Disclosure>
      <Disclosure
        title="Próximos 30 dias"
        description={s.forecast.complete ? 'Projetado' : 'Projeção parcial'}
      >
        <p>
          Caixa projetado:{' '}
          {s.forecast.projectedBalance === null
            ? 'Não disponível'
            : money(s.forecast.projectedBalance)}
          .
        </p>
        <p>
          {s.forecast.events.length} compromissos ou eventos na janela de
          previsão.
        </p>
        <button onClick={() => go('Planejamento')}>Abrir Planejamento</button>
      </Disclosure>
      <section aria-label="Atenção">
        <h2>Atenção</h2>
        <AlertSummary data={data} go={go} />
        <button onClick={() => go('Auditoria')}>Abrir Auditoria</button>
      </section>
      <Disclosure
        title="Mudanças recentes"
        description={
          s.last
            ? `Último fechamento: ${s.last.period}`
            : 'Nenhum fechamento disponível'
        }
      >
        {s.last && (
          <p>
            Variação de caixa registrada: {moneyCents(s.last.netCashFlowCents)}{' '}
            · {s.last.dataCompleteness === 'complete' ? 'completo' : 'parcial'}.
          </p>
        )}
        {s.changes ? (
          s.changes.metrics.map((m) => (
            <p key={m.label}>
              {m.label}: {moneyCents(m.absolute)} em relação ao mês anterior.
            </p>
          ))
        ) : (
          <p>Feche dois meses consecutivos para comparar mudanças.</p>
        )}
        <p>
          Comparação de revisões salvas; alterações posteriores são conferidas
          em Alertas e Relatórios.
        </p>
        <button onClick={() => go('Relatórios')}>Abrir Relatórios</button>
      </Disclosure>
    </div>
  );
}
