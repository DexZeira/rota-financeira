import { defaultAliases } from './component-matching';
import { validateAttribution } from './expense-allocation';
import { emptyImports, type ImportState } from './services/import/types';
export type Row = { id: string; [key: string]: string | number | null };
export type Field = {
  key: string;
  label: string;
  type?: 'number' | 'date' | 'textarea' | 'select';
  options?: string[];
  required?: boolean;
  signed?: boolean;
  integer?: boolean;
  nullable?: boolean;
};
export const collections = [
  'work',
  'bankReceipts',
  'expenses',
  'debts',
  'payments',
  'maintenance',
  'services',
  'costs',
  'investments',
  'movements',
  'plans',
  'planTransactions',
  'checklists',
  'activities',
  'fund',
  'recurrences',
  'forecastResolutions',
  'budgets',
  'categoryPolicies',
  'planningSettings',
  'reserveAllocations',
  'assets', 'assetValuations', 'assetCostLinks', 'netWorthSnapshots',
] as const;
export type Collection = (typeof collections)[number];
export type Data = { dataVersion: number; intelligenceVersion?: number; planningVersion?: number; assetVersion?: number; importVersion?: number; imports: ImportState; settings: Row; bike: Row } & Record<
  Collection,
  Row[]
>;
const f = (
  key: string,
  label: string,
  type?: Field['type'],
  extra: Partial<Field> = {},
): Field => ({ key, label, type, ...extra });
const name = f('name', 'Nome', undefined, { required: true }),
  date = f('date', 'Data', 'date', { required: true }),
  amount = f('amount', 'Valor (R$)', 'number', { required: true }),
  notes = f('notes', 'Observações', 'textarea');
const opt = (key: string, label: string, options: string[]) =>
  f(key, label, 'select', { options, required: true });
export const categories = [
  'moradia',
  'alimentação',
  'internet',
  'telefone',
  'moto',
  'lazer',
  'saúde',
  'outras',
  'combustível',
  'assinaturas',
];
export const costCategories = [
  'óleo',
  'pneus',
  'relação',
  'freios',
  'manutenção',
  'peças',
  'revisões',
  'seguro',
  'documentação',
  'outros',
];
export const checks = [
  'pneus',
  'freios',
  'óleo',
  'corrente',
  'vazamentos',
  'luzes',
  'setas',
  'buzina',
  'retrovisores',
];
export const attributionFields = (scope: string): Field[] => [
  opt('scope', 'Uso da despesa', [
    scope,
    ...['pessoal', 'trabalho', 'moto', 'compartilhada'].filter(
      (s) => s !== scope,
    ),
  ]),
  opt('allocation', 'Atribuir a', ['geral', 'atividade', 'sessão', 'período']),
  f('workSessionId', 'Sessão de trabalho', 'select'),
  f('workActivity', 'Atividade do trabalho (opcional)'),
  f('periodFrom', 'Período de referência: início', 'date'),
  f('periodTo', 'Período de referência: fim', 'date'),
  f('workAmount', 'Parcela paga atribuída ao trabalho (R$)', 'number'),
];
export const schemas: Record<Collection | 'settings' | 'bike', Field[]> = {
  bankReceipts: [name,date,f('amountCents','Receita em centavos','number',{integer:true,required:true}),f('account','Conta'),notes],
  assets: [name,
    opt('type', 'Tipo de bem', ['motorcycle', 'car', 'property', 'electronics', 'equipment', 'other']),
    f('linkedBike', 'Vínculo com a moto'),
    f('purchaseDate', 'Data de aquisição', 'date'),
    f('purchasePriceCents', 'Preço de compra (R$; opcional)', 'number', { integer: true, nullable: true }),
    opt('liquidity', 'Liquidez do bem', ['illiquid', 'immediate', 'short_term', 'restricted', 'unknown']),
    f('financingDebtId', 'Dívida do financiamento (opcional)', 'select'),
    f('purchaseKm', 'KM na aquisição (opcional)', 'number', { nullable: true }),
    f('currentKm', 'KM atual (opcional)', 'number', { nullable: true }),
    opt('cashPurchase', 'Registrar saída da compra no caixa?', ['não', 'sim']),
    f('cashPurchaseCents', 'Parte da compra paga com caixa (R$)', 'number', { integer: true, nullable: true }),
    opt('active', 'Bem ativo', ['sim', 'não']),
    f('soldAt', 'Data da venda (opcional)', 'date'),
    f('saleValueCents', 'Valor de venda (R$; opcional)', 'number', { integer: true, nullable: true }),
    opt('cashSale', 'Registrar entrada da venda no caixa?', ['não', 'sim']), notes,
  ],
  assetValuations: [
    f('assetId', 'Bem avaliado', 'select', { required: true }), date,
    f('valueCents', 'Valor avaliado (R$)', 'number', { integer: true, required: true }),
    opt('source', 'Fonte da avaliação', ['manual', 'market', 'estimated', 'unknown']),
    f('sequence', 'Ordem do registro', 'number', { integer: true }), notes,
  ],
  assetCostLinks: [
    f('assetId', 'Bem do custo', 'select', { required: true }),
    opt('recordKind', 'Origem do custo', ['expenses', 'services', 'payments']),
    f('recordId', 'Lançamento existente', 'select', { required: true }),
    opt('category', 'Natureza do custo', ['combustível', 'manutenção', 'pneus', 'peças', 'seguro', 'IPVA', 'licenciamento', 'documentação', 'juros', 'outros', 'aquisição']),
    f('interestCents', 'Juros pagos (R$; apenas para pagamento de dívida)', 'number', { integer: true, nullable: true }), notes,
  ],
  netWorthSnapshots: [date,
    ...['cashCents', 'investmentsCents', 'assetsCents', 'liabilitiesCents', 'netCents'].map((key) => f(key, key, 'number', { integer: true, signed: true })),
    f('positions', 'Posições registradas'), f('partial', 'Base parcial', 'number', { integer: true }), notes,
  ],
  budgets: [
    f('category', 'Categoria', undefined, { required: true }),
    opt('period', 'Período', ['mensal']),
    f('limitCents', 'Orçamento mensal (R$)', 'number', { integer: true }),
    opt('enabled', 'Controlar orçamento', ['sim', 'não']),
    f('alertThresholdPercent', 'Atenção a partir de (%)', 'number'),
    f('nearThresholdPercent', 'Próximo do limite a partir de (%)', 'number'),
    f('createdAt', 'Criado em', 'date'), f('updatedAt', 'Atualizado em', 'date'),
  ],
  categoryPolicies: [
    f('category', 'Categoria', undefined, { required: true }),
    opt('level', 'Classificação', ['normal', 'essencial', 'discricionária']),
  ],
  planningSettings: [
    opt('scheduleEnabled', 'Usar meta dinâmica', ['não', 'sim']),
    f('workWeekdays', 'Dias trabalhados (seg, ter, qua, qui, sex, sab, dom)'),
    f('daysOff', 'Folgas e indisponibilidades (AAAA-MM-DD, separadas por vírgula)', 'textarea'),
    f('maxDailyCents', 'Limite diário confortável (R$; opcional)', 'number', { integer: true, nullable: true }),
    opt('historyMonths', 'Histórico do custo de vida (meses)', ['6', '3', '12']),
    f('emergencyMonths', 'Meta de reserva (meses; opcional)', 'number', { nullable: true }),
    f('emergencyContributionCents', 'Contribuição mensal à reserva (R$)', 'number', { integer: true }),
    f('comfortExtraCents', 'Extras do custo confortável (R$/mês)', 'number', { integer: true }),
  ],
  reserveAllocations: [
    f('investmentId', 'Investimento da reserva', 'select', { required: true }),
    opt('enabled', 'Compor reserva', ['sim', 'não']),
    opt('liquidity', 'Disponibilidade', ['não informada', 'imediata', 'não imediata']),
  ],
  recurrences: [
    name,
    opt('kind', 'Tipo de previsão', ['despesa', 'receita', 'aporte', 'plano', 'manutenção', 'dívida']),
    f('amount', 'Valor previsto (R$; vazio = desconhecido)', 'number', { nullable: true }),
    f('category', 'Categoria'),
    opt('frequency', 'Frequência', ['única', 'diário', 'semanal', 'quinzenal', 'mensal', 'bimestral', 'trimestral', 'semestral', 'anual', 'personalizado']),
    f('intervalDays', 'Intervalo personalizado (dias)', 'number', { integer: true }),
    f('startDate', 'Data inicial', 'date', { required: true }),
    f('endDate', 'Data final (opcional)', 'date'),
    f('dueDay', 'Dia do vencimento (mensal/anual; vazio = dia inicial)', 'number', { integer: true, nullable: true }),
    f('account', 'Conta / carteira (identificação)'),
    opt('status', 'Status', ['ativa', 'pausada', 'finalizada']),
    opt('sourceKind', 'Substitui previsão automática de', ['nenhum', 'expenses', 'debts', 'maintenance', 'plans', 'investments']),
    f('sourceId', 'Registro de origem', 'select'),
    f('effectiveFrom', 'Vigência da regra atual', 'date'),
    f('scheduleHistory', 'Histórico de vigências'),
    f('archived', 'Regra arquivada', 'number', { integer: true }),
    notes,
  ],
  forecastResolutions: [
    f('recurrenceId', 'Recorrência', undefined, { required: true }),
    f('occurrenceDate', 'Data da ocorrência', 'date', { required: true }),
    opt('action', 'Conferência', ['vincular', 'ignorar']),
    opt('recordKind', 'Tipo do registro realizado', ['expenses', 'work', 'bankReceipts', 'payments', 'movements', 'planTransactions', 'services']),
    f('recordId', 'Registro realizado'),
  ],
  work: [
    date,
    f('activity', 'Atividade', undefined, { required: true }),
    f('hours', 'Horas', 'number', { required: true }),
    f('km', 'KM rodados', 'number', { required: true }),
    f('revenue', 'Faturamento (R$)', 'number', { required: true }),
    f('cardQuantity', 'Quantidade de cartões', 'number', {
      integer: true,
      nullable: true,
    }),
    f('cardUnitValue', 'Valor por cartão (R$)', 'number', { nullable: true }),
    f('expectedRevenue', 'Valor esperado (R$)', 'number', { nullable: true }),
    notes,
  ],
  expenses: [
    name,
    opt('category', 'Categoria', categories),
    amount,
    date,
    opt('recurrence', 'Recorrência', ['única', 'mensal', 'anual']),
    opt('essentiality', 'Classificação', [
      'não informado',
      'essencial',
      'não essencial',
    ]),
    ...attributionFields('pessoal'),
    notes,
  ],
  debts: [
    name,
    f('type', 'Tipo'),
    f('totalInstallments', 'Total de parcelas', 'number', { integer: true }),
    f('installmentAmount', 'Valor da parcela (R$)', 'number', {
      required: true,
    }),
    f('paidInstallments', 'Parcelas pagas', 'number', {
      integer: true,
      nullable: true,
    }),
    f('balance', 'Saldo na inclusão (R$)', 'number', { required: true }),
    f('interest', 'Juros mensais (%)', 'number'),
    f('due', 'Vencimento', 'date'),
    opt('status', 'Status', ['ativa', 'quitada']),
    notes,
  ],
  payments: [
    f('debtId', 'Dívida', 'select', { required: true }),
    date,
    amount,
    f('installments', 'Parcelas pagas', 'number', { integer: true }),
    opt('kind', 'Tipo de pagamento', ['normal', 'extra']),
    notes,
  ],
  maintenance: [
    name,
    f('category', 'Categoria'),
    f('lastDate', 'Última manutenção', 'date'),
    f('lastKm', 'KM da última manutenção', 'number'),
    f('intervalKm', 'Intervalo (km)', 'number'),
    f('intervalMonths', 'Intervalo (meses)', 'number', { integer: true }),
    f('nextKm', 'Próxima manutenção (km; 0 = calcular)', 'number'),
    f('nextDate', 'Próxima manutenção por data', 'date'),
    f('estimated', 'Custo estimado (R$)', 'number'),
    f('value', 'Valor pago na instalação inicial (R$; histórico)', 'number', {
      nullable: true,
    }),
    f('lifeKm', 'Vida útil / km cobertos', 'number'),
    f('costId', 'Substitui previsão da aba Moto', 'select'),
    f('aliases', 'Nomes equivalentes (um por linha)', 'textarea'),
    opt('status', 'Status', ['pendente', 'concluída']),
    notes,
  ],
  services: [
    f('maintenanceId', 'Item de manutenção', 'select', { required: true }),
    date,
    f('km', 'Quilometragem', 'number', { required: true }),
    amount,
    ...attributionFields('moto'),
    notes,
  ],
  costs: [
    name,
    opt('category', 'Categoria', costCategories),
    f('amount', 'Custo previsto (R$)', 'number', { required: true }),
    f('lifeKm', 'Vida útil / km cobertos', 'number', { required: true }),
    opt('matchMode', 'Vínculo de componente', [
      'automático',
      'manual',
      'ignorar',
    ]),
    f('componentId', 'Componente vinculado', 'select'),
    notes,
  ],
  investments: [
    f('category', 'Tipo de investimento', 'select', {
      options: [
        'CDB', 'LCI', 'LCA', 'Tesouro Selic', 'Tesouro Prefixado',
        'Tesouro IPCA+', 'Poupança', 'Fundo', 'ETF', 'Ação', 'FII',
        'Criptomoeda', 'Conta remunerada', 'reserva de emergência', 'renda fixa', 'Tesouro', 'ações', 'fundos', 'outros',
      ], required: true,
    }),
    name,
    f('ticker', 'Ticker / símbolo'),
    f('coinGeckoId', 'CoinGecko ID'),
    f('anniversaryDay', 'Dia de aniversário (poupança)', 'number', { integer: true }),
    f('institution', 'Instituição'),
    f('balance', 'Saldo inicial (R$)', 'number', { required: true }),
    f('date', 'Data do saldo inicial', 'date', { required: true }),
    f('yield', 'Rentabilidade informativa (% ao ano)', 'number', {
      signed: true,
    }),
    opt('rateType', 'Tipo de rentabilidade', ['Pós-fixado', 'Prefixado', 'IPCA +']),
    opt('indexer', 'Indexador', ['CDI', 'Selic']),
    f('indexerPercent', 'Percentual do indexador', 'number'),
    f('maturity', 'Vencimento', 'date'),
    f('currentValue', 'Valor atual (opcional)', 'number'),
    f('quantity', 'Quantidade', 'number'),
    f('averagePrice', 'Preço médio (R$)', 'number'),
    f('objective', 'Objetivo'),
    f('issuer', 'Emissor (opcional)'),
    opt('liquidity', 'Liquidez informada', ['não informado', 'imediata', 'D+1', 'D+n', 'com carência', 'somente no vencimento', 'negociável com marcação a mercado']),
    opt('fgcStatus', 'Cobertura FGC confirmada no produto', ['não informado', 'sim', 'não']),
    f('riskNotes', 'Risco / rating informado pelo emissor (opcional)'),
    f('currency', 'Moeda de exposição (opcional, ex.: BRL)'),
    f('annualFeePercent', 'Taxas anuais (%; vazio = não informado)', 'number', { nullable: true }),
    notes,
  ],
  movements: [
    f('investmentId', 'Investimento', 'select', { required: true }),
    date,
    opt('kind', 'Movimentação', ['aporte', 'retirada', 'rendimento', 'perda']),
    amount,
    notes,
  ],
  planTransactions: [
    f('planId', 'Plano', 'select', { required: true }),
    opt('kind', 'Tipo', ['deposit', 'withdrawal']),
    amount,
    date,
    notes,
  ],
  plans: [
    name,
    opt('kind', 'Tipo', ['objetivo', 'próxima moto']),
    f('target', 'Valor objetivo / preço da moto (R$)', 'number', {
      required: true,
    }),
    f('current', 'Saldo inicial guardado / entrada inicial (R$)', 'number'),
    f('bikeValue', 'Valor estimado da XRE na troca (R$)', 'number'),
    f('deadline', 'Prazo', 'date', { required: true }),
    opt('priority', 'Prioridade', ['alta', 'média', 'baixa']),
    opt('status', 'Status do plano', ['ativo', 'concluído']),
    opt('inflationMode', 'Corrigir meta pela inflação', ['Sem correção', 'IPCA observado', 'IPCA esperado', 'Taxa personalizada']),
    f('inflationBaseDate', 'Data-base do valor objetivo', 'date'),
    f('inflationRate', 'Inflação personalizada (% a.a.)', 'number', { nullable: true, signed: true }),
    opt('adjustContributions', 'Projetar correção anual dos aportes', ['não', 'sim']),
    notes,
  ],
  checklists: [
    date,
    ...checks.map((x) =>
      opt(x, x[0].toUpperCase() + x.slice(1), ['OK', 'Atenção', 'Problema']),
    ),
    notes,
  ],
  activities: [name],
  fund: [
    date,
    opt('kind', 'Movimento da reserva', ['reserva', 'uso']),
    amount,
    notes,
  ],
  settings: [
    f('openingCash', 'Saldo inicial disponível (R$)', 'number', {
      signed: true,
    }),
    f('essential', 'Base fixa / essencial mensal (R$)', 'number'),
    opt('expenseBaseMode', 'A base essencial é', [
      'total incluindo recorrentes',
      'adicional às recorrentes',
    ]),
    f('emergencyMonths', 'Meses de reserva de emergência', 'number', {
      integer: true,
    }),
    f('workDaysWeek', 'Dias planejados por semana', 'number', {
      integer: true,
    }),
    f('idealTargetPercent', 'Margem da Meta Ideal (%)', 'number'),
    f('acceleratedTargetPercent', 'Margem da Meta Acelerada (%)', 'number'),
    opt('defaultTarget', 'Meta principal', ['ideal', 'minimum', 'accelerated']),
    f('workDays', 'Dias planejados por mês', 'number', { integer: true }),
    f('hoursDay', 'Horas planejadas por dia', 'number'),
    f('kmDay', 'KM planejados por dia', 'number'),
    f('netDay', 'Lucro líquido desejado por dia (R$)', 'number'),
    f(
      'extra',
      'Extra mensal para dívidas (R$; aceleração existente)',
      'number',
    ),
    f('extraPlans', 'Extra mensal para planos (R$)', 'number'),
    f('extraInvestments', 'Extra mensal para investimentos (R$)', 'number'),
    f(
      'reserveMonth',
      'Aporte planejado mensal para investimentos (R$)',
      'number',
    ),
    f('nearKm', 'Avisar manutenção a quantos km', 'number'),
    f('nearDays', 'Avisar manutenção a quantos dias', 'number', {
      integer: true,
    }),
    opt('theme', 'Tema', ['claro', 'escuro', 'sistema']),
  ],
  bike: [
    f('brand', 'Marca', undefined, { required: true }),
    f('model', 'Modelo', undefined, { required: true }),
    f('year', 'Ano', 'number', { required: true, integer: true }),
    f('version', 'Versão'),
    f('km', 'Quilometragem atual', 'number'),
    f('purchaseKm', 'KM na compra', 'number'),
    f('purchaseDate', 'Data da compra', 'date'),
    f('purchaseValue', 'Valor de compra (R$)', 'number'),
    f('currentValue', 'Valor atual (R$)', 'number'),
    f('fuelPrice', 'Preço do combustível (R$/L)', 'number'),
    f('efficiency', 'Consumo (km/L)', 'number'),
    notes,
  ],
};
export const labels: Record<Collection, string> = {
  bankReceipts: 'Receitas bancárias',
  assets: 'Bens', assetValuations: 'Avaliações patrimoniais', assetCostLinks: 'Custos vinculados', netWorthSnapshots: 'Posições patrimoniais',
  budgets: 'Orçamentos', categoryPolicies: 'Classificação de categorias',
  planningSettings: 'Preferências de planejamento', reserveAllocations: 'Composição da reserva',
  recurrences: 'Recorrências',
  forecastResolutions: 'Conferências das previsões',
  work: 'Trabalho',
  expenses: 'Gastos',
  debts: 'Dívidas',
  payments: 'Pagamentos',
  maintenance: 'Manutenções',
  services: 'Serviços realizados',
  costs: 'Previsões por km',
  investments: 'Investimentos',
  movements: 'Movimentações',
  plans: 'Planos',
  planTransactions: 'Histórico dos planos',
  checklists: 'Checklists',
  activities: 'Atividades',
  fund: 'Reserva da moto',
};
export const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
export const id = () => crypto.randomUUID();
export function emptyRow(key: Collection | 'settings' | 'bike'): Row {
  const result = Object.fromEntries([
    ['id', ''],
    ...schemas[key].map((f) => [
      f.key,
      f.nullable
        ? null
        : f.type === 'number'
          ? 0
          : f.type === 'select'
            ? f.options?.[0] || ''
            : f.key === 'date'
              ? today()
              : '',
    ]),
  ]) as Row;
  if (key === 'settings')
    Object.assign(result, {
      idealTargetPercent: 20,
      acceleratedTargetPercent: 40,
      defaultTarget: 'ideal',
    });
  if (key === 'recurrences') Object.assign(result, { startDate: today(), intervalDays: 1 });
  if (key === 'budgets') Object.assign(result, { alertThresholdPercent: 70, nearThresholdPercent: 90, createdAt: today(), updatedAt: today() });
  return result;
}
export function defaults(): Data {
  const d = {
    dataVersion: 4,
    intelligenceVersion: 1,
    planningVersion: 5,
    assetVersion: 1,
    importVersion: 1,
    imports: emptyImports(),
    settings: { ...emptyRow('settings'), id: 'settings', theme: 'claro' },
    bike: {
      ...emptyRow('bike'),
      id: 'bike',
      brand: 'Honda',
      model: 'XRE 190',
      year: 2025,
    },
  } as unknown as Data;
  for (const key of collections) d[key] = [];
  d.activities = ['Uber Moto', 'Entrega de cartões'].map((name, i) => ({
    id: `activity-${i}`,
    name,
  }));
  d.maintenance = [
    'óleo',
    'filtro de ar',
    'vela',
    'corrente',
    'coroa',
    'pinhão',
    'relação',
    'pastilha dianteira',
    'pastilha traseira',
    'fluido de freio',
    'pneu dianteiro',
    'pneu traseiro',
    'suspensão',
    'bateria',
    'revisão geral',
  ].map((name, i) => ({
    ...emptyRow('maintenance'),
    id: `maintenance-${i}`,
    name,
    aliases: defaultAliases(name),
  }));
  return d;
}
export const num = (v: unknown) =>
  typeof v === 'number' && Number.isFinite(v) ? v : 0;
export const money = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(
    v,
  );
export const dec = (v: number, digits = 2) =>
  new Intl.NumberFormat('pt-BR', { maximumFractionDigits: digits }).format(v);
export const brDate = (v: unknown) =>
  typeof v === 'string' && v
    ? v.split('-').reverse().join('/')
    : 'Não definida';
export function validDate(v: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(v + 'T12:00:00Z');
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === v;
}
// Read both the current debt form and older saved records without changing balances.
export function debtTerms(r: Row) {
  const installment = num(r.installmentAmount) || num(r.installment);
  const remaining =
    num(r.totalInstallments) > 0
      ? Math.max(0, num(r.totalInstallments) - num(r.paidInstallments))
      : num(r.remaining);
  const original =
    num(r.original) ||
    Math.max(num(r.balance), num(r.totalInstallments) * installment);
  // Current installment records derive their opening balance from the schedule.
  // Legacy debts keep their recorded balance; debtState respects explicit settlement.
  const balance =
    num(r.totalInstallments) > 0
      ? Math.round(remaining * installment * 100) / 100
      : num(r.balance);
  return { installment, remaining, original, balance };
}
export function validateRow(key: Collection | 'settings' | 'bike', r: Row) {
  for (const [field, value] of Object.entries(r)) {
    if (field.endsWith('Cents') && value !== null && (!Number.isSafeInteger(value) || (key !== 'netWorthSnapshots' && Number(value) < 0))) throw Error('Valor monetário fora do intervalo seguro.');
  }
  if (key === 'assets') {
    if (r.purchaseKm !== null && r.currentKm !== null && num(r.currentKm) < num(r.purchaseKm)) throw Error('KM atual anterior à aquisição.');
    for (const dateKey of ['purchaseDate', 'soldAt']) if (r[dateKey] && String(r[dateKey]) > today()) throw Error('Data patrimonial futura não é realizada.');
    if (r.soldAt && (r.active !== 'não' || (r.purchaseDate && String(r.soldAt) < String(r.purchaseDate)))) throw Error('Venda requer bem inativo e data posterior à compra.');
    if (r.cashPurchase === 'sim' && (!r.purchaseDate || r.cashPurchaseCents === null || (r.purchasePriceCents !== null && num(r.cashPurchaseCents) > num(r.purchasePriceCents)))) throw Error('Informe a parte paga com caixa, sem exceder o preço de compra.');
    if (r.cashSale === 'sim' && (!r.soldAt || r.saleValueCents === null)) throw Error('Entrada de caixa requer data e valor da venda.');
  }
  if (key === 'assetValuations' && String(r.date) > today()) throw Error('Avaliação futura não é realizada.');
  if (key === 'netWorthSnapshots' && (String(r.date) > today() || ![0, 1].includes(num(r.partial)))) throw Error('Posição patrimonial inválida.');
  if (key === 'budgets' && (num(r.alertThresholdPercent) > num(r.nearThresholdPercent) || num(r.nearThresholdPercent) > 100)) throw Error('Limiares devem estar em ordem entre 0% e 100%.');
  if (key === 'planningSettings') {
    const weekdays = String(r.workWeekdays).split(/[,\s]+/).filter(Boolean);
    if (weekdays.some((day) => !['seg','ter','qua','qui','sex','sab','dom'].includes(day))) throw Error('Use seg, ter, qua, qui, sex, sab, dom.');
    if (r.scheduleEnabled === 'sim' && !weekdays.length) throw Error('Escolha pelo menos um dia de trabalho.');
    if (String(r.daysOff).split(/[,\s]+/).filter(Boolean).some((day) => !validDate(day))) throw Error('Informe folgas no formato AAAA-MM-DD.');
    if (num(r.emergencyMonths) > 120) throw Error('Meta de reserva deve ser até 120 meses.');
  }
  for (const f of schemas[key]) {
    const v = r[f.key];
    if (f.nullable && v === null) continue;
    if (
      f.required &&
      (v === undefined || v === null || (typeof v === 'string' && !v.trim()))
    )
      throw Error(`Preencha ${f.label}.`);
    if (
      f.type === 'number' &&
      (typeof v !== 'number' ||
        !Number.isFinite(v) ||
        (!f.signed && v < 0) ||
        (f.integer && !Number.isInteger(v)))
    )
      throw Error(`${f.label}: valor inválido.`);
    if (f.type === 'date' && v && !validDate(String(v)))
      throw Error(`${f.label}: data inválida.`);
    if (f.type === 'select' && f.options && !f.options.includes(String(v)))
      throw Error(`${f.label}: opção inválida.`);
    if (f.type !== 'number' && typeof v !== 'string')
      throw Error(`${f.label}: texto inválido.`);
  }
  if (key === 'recurrences') {
    if (r.archived !== 0 && r.archived !== 1) throw Error('Estado de arquivamento inválido.');
    if (r.archived === 1 && r.status !== 'finalizada') throw Error('Recorrência arquivada não pode gerar novas ocorrências.');
    if (r.amount !== null && num(r.amount) <= 0) throw Error('Informe valor maior que zero ou deixe o valor desconhecido.');
    if (r.endDate && String(r.endDate) < String(r.startDate)) throw Error('Data final anterior à data inicial.');
    if (r.dueDay !== null && (num(r.dueDay) < 1 || num(r.dueDay) > 31)) throw Error('Dia de vencimento deve ficar entre 1 e 31.');
    if (r.frequency === 'personalizado' && (num(r.intervalDays) < 1 || num(r.intervalDays) > 3660)) throw Error('Intervalo deve ficar entre 1 e 3660 dias.');
    if (r.sourceKind === 'nenhum' && r.sourceId) throw Error('Remova o vínculo de origem ou selecione seu tipo.');
  }
  if (key === 'debts' && num(r.paidInstallments) > num(r.totalInstallments))
    throw Error('Parcelas pagas não podem superar o total.');
  if (key === 'plans' && r.inflationMode !== 'Sem correção' && r.inflationMode !== undefined) {
    if (!validDate(String(r.inflationBaseDate)) || String(r.inflationBaseDate) > today() || String(r.inflationBaseDate) > String(r.deadline))
      throw Error('Informe uma data-base válida, até hoje e anterior ao prazo.');
    if (r.inflationMode === 'Taxa personalizada' && (typeof r.inflationRate !== 'number' || r.inflationRate <= -100 || r.inflationRate > 100))
      throw Error('Inflação personalizada deve ser maior que -100% e até 100% a.a.');
  }
  if (key === 'investments' && num(r.annualFeePercent) > 100) throw Error('Taxas anuais devem ficar entre 0% e 100%.');
  if (key === 'expenses' || key === 'services') validateAttribution(r);
  if (key === 'bike' && num(r.km) < num(r.purchaseKm))
    throw Error('KM atual não pode ser menor que KM na compra.');
  if (key === 'costs' && num(r.lifeKm) <= 0)
    throw Error('Vida útil deve ser maior que zero.');
  if (key === 'work' && num(r.hours) <= 0)
    throw Error('Informe horas maiores que zero.');
  if (
    ['payments', 'movements', 'fund', 'planTransactions'].includes(key) &&
    num(r.amount) <= 0
  )
    throw Error('Valor deve ser maior que zero.');
  if (key === 'debts' && num(r.balance) > debtTerms(r).original)
    throw Error(
      'Saldo não pode superar o valor original; inclua os encargos no valor original.',
    );
  if (
    key === 'settings' &&
    (num(r.idealTargetPercent) > 500 || num(r.acceleratedTargetPercent) > 500)
  )
    throw Error('Margens devem ficar entre 0 e 500%.');
  if (key === 'settings' && num(r.workDaysWeek) > 7)
    throw Error('Dias por semana devem ficar entre 0 e 7.');
  if (key === 'settings' && num(r.workDays) > 31)
    throw Error('Dias de trabalho devem ficar entre 0 e 31.');
}
