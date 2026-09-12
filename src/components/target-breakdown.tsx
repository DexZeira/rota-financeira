import { Card } from './common';
import { money, dec } from '../model';
import { targetBreakdownRows, type calculateTargets } from '../target-sources';
export function TargetBreakdown({
  target: t,
  onConfigure,
}: {
  target: ReturnType<typeof calculateTargets>;
  onConfigure: () => void;
}) {
  return (
    <Card
      title="Composição das metas"
      action={<button onClick={onConfigure}>Configurar metas</button>}
    >
      <p>
        Referência: {t.month.split('-').reverse().join('/')} · {dec(t.days)}{' '}
        dias planejados de trabalho no mês.
      </p>
      <div className="three-grid">
        {targetBreakdownRows(t).map((section) => (
          <div className="activity-card" key={section.title}>
            <h3>{section.title}</h3>
            <div className="target-source-list">
              {section.rows.map(([label, amount]) => (
                <div className="detail" key={label}>
                  <span>{label}</span>
                  <strong>{money(amount)}/mês</strong>
                </div>
              ))}
            </div>
            <p>
              <b>Total mensal: {money(section.monthly)}</b>
            </p>
            <p>
              <b>
                {t.days
                  ? `${money(section.daily)}/dia`
                  : 'Defina os dias de trabalho'}
              </b>
            </p>
          </div>
        ))}
      </div>
      <p className="inline-note">
        As metas usam os dias planejados do mês inteiro; não há calendário de
        dias restantes. Ideal e Acelerada aplicam suas margens sobre a Mínima. As provisões e aportes abaixo são referências de planejamento, não acréscimos duplicados às margens. Depreciação não entra nas metas de caixa.
      </p>
      <p className="inline-note">
        A base essencial, por padrão, já inclui recorrentes: só seu complemento
        é somado. Use “adicional às recorrentes” se forem custos distintos.
        Recorrências de mesmo nome, categoria e frequência usam o último valor,
        sem somar os meses do histórico; pagamentos do mês são abatidos. A base
        fixa não vinculada a registros precisa ser ajustada por você quando já
        estiver paga.
      </p>
      <details>
        <summary>Ver fontes e configurações utilizadas</summary>
        <p>
          Combustível: {money(t.fuelCosts)} · Outros custos obrigatórios:{' '}
          {money(t.otherRequiredCosts)} · Distância planejada:{' '}
          {dec(t.kmMonthly)} km/mês ({t.projectionSource}).
        </p>
        <p>Manutenção: {money(t.breakdown.maintenanceProvision)}/mês · Outras provisões: {money(t.breakdown.otherMotoProvision)}/mês · Planos: {money(t.plans)}/mês.</p>
        <p>
          Aporte planejado: {money(t.plannedInvestmentGoal)} · Aportes
          realizados no mês: {money(t.investmentsPaid)}.
        </p>
        <p>
          Recorrentes previstas: {money(t.recurringGross)} · Pagas no mês:{' '}
          {money(t.recurringPaid)}.
        </p>
        {t.debtItems.map((r) => (
          <p key={r.id}>
            {r.name}: {money(r.amount)} — {r.reason}.
          </p>
        ))}
        {t.planItems.map((r) => (
          <p key={r.id}>
            Plano {r.name}: {money(r.monthly)}/mês, calculado pelo módulo
            Planos.
          </p>
        ))}
      </details>
      {t.warnings.map((w) => (
        <p className="notice" key={w}>
          {w}
        </p>
      ))}
    </Card>
  );
}
