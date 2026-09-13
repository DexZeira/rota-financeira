export type TaxableInvestment = string;
export function incomeTaxRate(days: number, type: TaxableInvestment): number {
  if (['LCI', 'LCA', 'Poupança'].includes(type)) return 0;
  if (!['CDB', 'Tesouro Prefixado', 'Tesouro Selic', 'Tesouro IPCA+', 'renda fixa', 'Conta remunerada'].includes(type)) return 0;
  if (days <= 180) return 0.225;
  if (days <= 360) return 0.2;
  if (days <= 720) return 0.175;
  return 0.15;
}
export function estimateIncomeTax(grossProfit: number, days: number, type: TaxableInvestment): number {
  return Math.max(0, grossProfit) * incomeTaxRate(days, type);
}
