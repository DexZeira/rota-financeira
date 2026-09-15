import { type Data, num, money, dec } from '../model';
import { financial, investmentBalance } from '../calculations';
import { useEconomicIndicators } from '../hooks/use-economic-indicators';
import { EconomicIndicatorsPanel } from './economic-indicators';
import { concentration, correctedPlan } from '../services/financial-intelligence';
import { realReturn } from '../services/purchasing-power';
import { value } from '../pages/shared';

export function MoneyIntelligence({ data }: { data: Data }) {
  const economic = useEconomicIndicators();
  const total = financial(data).investments;
  const emergency = data.investments.filter((r) => r.category === 'reserva de emergência').reduce((s, r) => s + investmentBalance(data, r), 0);
  const essential = num(data.settings.essential);
  const reserveTarget = essential * num(data.settings.emergencyMonths);
  const issuer = concentration(data, 'issuer').find((r) => r.name !== 'Não informado');
  const corrected = data.plans.filter((r) => r.status !== 'concluído').map((r) => {
    try { return correctedPlan(r, economic.rates, economic.focus).adjusted; } catch { return null; }
  });
  const realReference = economic.rates.selic && economic.rates.ipca ? realReturn(economic.rates.selic.value / 100, economic.rates.ipca.value / 100) : null;
  return <details className="disclosure"><summary>Seu dinheiro · poder de compra e atenção</summary>
    <div className="inline-stats">{value('Patrimônio financeiro registrado', money(total))}{value('Metas-base ativas', money(data.plans.filter((r) => r.status !== 'concluído').reduce((s, r) => s + num(r.target), 0)))}{value('Metas corrigidas projetadas', corrected.some((v) => v === null) ? 'Indisponível parcialmente' : money(corrected.reduce<number>((s, v) => s + v!, 0)))}{value('Reserva de emergência registrada', money(emergency))}{value('Meses de despesas cobertos', essential > 0 ? dec(emergency / essential, 1) : 'Informe a base essencial')}{value('Falta para a reserva desejada', money(Math.max(0, reserveTarget - emergency)))}</div>
    <p className="inline-note">A reserva considera apenas investimentos classificados como reserva de emergência. Cobertura depende da base essencial configurada, não implica liquidez confirmada. Metas corrigidas são projeções, não saídas adicionais de caixa.</p>
    {issuer?.percent != null && <p>{dec(issuer.percent)}% da carteira registrada está no emissor {issuer.name}. Informação de concentração, sem classificação automática de risco.</p>}
    <p className="inline-note">Patrimônio real total indisponível sem datas-base e fluxos comparáveis. Consulte os lotes em Investimentos. {realReference !== null && `Referência composta Selic atual / IPCA passado: ${dec(realReference * 100)}%. Combina a taxa anual atual com os últimos 12 meses, não é retorno realizado ou esperado da carteira.`}</p>
    <EconomicIndicatorsPanel economic={economic}/>
  </details>;
}
