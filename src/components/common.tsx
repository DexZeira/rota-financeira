import { openDatePicker } from './native-input';
import { toCents } from '../services/money-codec';
import { assetRows } from '../services/assets';
import { AttributionFields } from './attribution-fields';
import { useVirtualRecords } from '../hooks/use-virtual-records';
import { attributionKeys } from '../expense-allocation';
import {
  calculateWorkRevenues,
  updateCardWork,
  maintenanceCosts, costs, workResult,
} from '../calculations';
import { useId, useRef, useState, type ReactNode } from 'react';
import { useEffect } from 'react';
import { searchB3, searchCrypto, type AssetSuggestion } from '../services/market-quotes';
import { Plus, Search, Pencil, Trash2, Bike, CreditCard, BriefcaseBusiness } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';
import { activityForWorkType, workTypeForActivity, type WorkType } from '../services/work-type';
import { EmptyState, ActionsMenu } from './finance-ui';

import {
  type Row,
  type Field,
  type Data,
  type Collection,
  emptyRow,
  schemas,
  labels,
  id,
  num,
  brDate,
  money,
} from '../model';
export function Choice({
  value,
  onChange,
  options,
  label,
  inputId,
  name,
}: {
  value: string;
  onChange: (v: string) => void;
  options: (string | { value: string; label: string })[];
  label: string;
  inputId?: string;
  name?: string;
}) {
  const items = options.map((o) =>
    typeof o === 'string'
      ? {
          value: o,
          label:
            o === 'deposit' ? 'Aporte' : o === 'withdrawal' ? 'Retirada' : o,
        }
      : o,
  );
  return (
    <Select
      name={name}
      value={value}
      onValueChange={(v) => v !== null && onChange(String(v))}
      items={items}
    >
      <SelectTrigger id={inputId} aria-label={label} className="choice">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {items.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
export function Card({
  title,
  action,
  children,
  className = '',
}: {
  title?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={'card ' + className}>
      {title && (
        <div className="section-heading">
          <h2>{title}</h2>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}
export function Metrics({ items }: { items: [string, string, string?][] }) {
  return (
    <div className="metrics">
      {items.map(([label, value, note]) => (
        <article className="metric" key={label}>
          <span>{label}</span>
          <strong>{value}</strong>
          {note && <small>{note}</small>}
        </article>
      ))}
    </div>
  );
}
export function Bar({ value, label }: { value: number; label: string }) {
  return (
    <Progress
      value={Math.max(0, Math.min(100, value))}
      aria-label={label}
      className="progress-bar"
    />
  );
}
export function NoData({
  text = 'Nenhum registro ainda.',
  description = 'Use o botão acima para adicionar seus dados.',
}: {
  text?: string;
  description?: string;
}) {
  return (
    <EmptyState title={text} description={description} />
  );
}
export function Fields({
  fields,
  value,
  setValue,
  data,
  kind,
}: {
  fields: Field[];
  value: Row;
  setValue: (r: Row) => void;
  data: Data;
  kind?: Collection | 'settings' | 'bike';
}) {
  const prefix = useId();
  if (kind === 'work') return <div className="work-form-sections">{[
    { title: 'Quando você trabalhou?', keys: ['date', 'hours'] },
    { title: 'Resultado da jornada', keys: ['cardQuantity', 'cardUnitValue', 'revenue', 'km'] },
    { title: 'Detalhes', keys: ['notes'] },
  ].map((group) => <fieldset key={group.title}><legend>{group.title}</legend><Fields fields={fields.filter((f) => group.keys.includes(f.key))} value={value} setValue={setValue} data={data}/></fieldset>)}</div>;
  return (
    <div className="form-grid">
      {fields.map((f) => {
        const assetType = String(value.category || '');
        const isAssetSearch = kind === 'investments' && f.key === 'ticker' && ['Ação', 'ETF', 'FII', 'Criptomoeda'].includes(assetType);
        let options: (string | { value: string; label: string })[] =
          f.options || [];
        const ref =
          f.key === 'debtId' || f.key === 'financingDebtId'
            ? 'debts'
            : f.key === 'investmentId'
              ? 'investments'
              : f.key === 'maintenanceId'
                ? 'maintenance'
                : f.key === 'planId'
                  ? 'plans'
                  : f.key === 'costId'
                    ? 'costs'
                    : f.key === 'workSessionId'
                      ? 'work'
                      : f.key === 'componentId'
                        ? 'maintenance'
                        : null;
        if (ref)
          options = data[ref].map((r) => ({
            value: r.id,
            label:
              ref === 'work'
                ? `${r.activity} · ${brDate(r.date)} · ${r.id.slice(0, 6)}`
                : String(r.name),
          }));
        if (f.key === 'financingDebtId') options = [{ value: '', label: 'Sem financiamento vinculado' }, ...options];
        if (f.key === 'assetId') options = assetRows(data).map((r) => ({ value: r.id, label: String(r.name) }));
        if (kind === 'assetCostLinks' && f.key === 'recordId') options = (data[value.recordKind as 'expenses'|'services'|'payments'] || []).map((r) => ({ value: r.id, label: `${r.name || (r.debtId ? 'Pagamento' : 'Serviço')} · ${brDate(r.date)} · ${money(num(r.amount))}` }));
        const translations: Record<string,string> = { motorcycle:'Moto', car:'Carro', property:'Imóvel', electronics:'Eletrônico', equipment:'Equipamento', other:'Outro', immediate:'Imediata', short_term:'Curto prazo', restricted:'Restrita', illiquid:'Ilíquida', unknown:'Não informada', manual:'Informado pelo usuário', market:'Referência de mercado informada', estimated:'Estimado', expenses:'Gastos', services:'Serviços realizados', payments:'Pagamentos de dívidas' };
        if (['assets','assetValuations','assetCostLinks'].includes(String(kind)) && f.options) options = f.options.map((value) => ({ value, label: translations[value] || value }));
        if (kind === 'recurrences' && f.key === 'sourceKind') {
          const titles: Record<string, string> = { nenhum: 'Nenhuma (nova previsão)', expenses: 'Gasto recorrente', debts: 'Dívida', maintenance: 'Manutenção', plans: 'Plano', investments: 'Investimento' };
          options = options.map((option) => {
            const value = typeof option === 'string' ? option : option.value;
            return { value, label: titles[value] || value };
          });
        }
        if (kind === 'recurrences' && f.key === 'sourceId') {
          const source = ['expenses', 'debts', 'maintenance', 'plans', 'investments'].find((key) => key === value.sourceKind) as 'expenses' | 'debts' | 'maintenance' | 'plans' | 'investments' | undefined;
          options = [{ value: '', label: 'Selecione a origem' }, ...(source ? data[source].map((r) => ({ value: r.id, label: `${r.name} · ${r.date ? brDate(r.date) : r.id.slice(0, 6)}` })) : [])];
        }
        if (['costId', 'workSessionId', 'componentId'].includes(f.key))
          options = [{ value: '', label: 'Nenhuma' }, ...options];
        return (
          <label htmlFor={`${prefix}-${f.key}`} className={f.type === 'textarea' ? 'wide' : ''} key={f.key}>
              <span>
              {isAssetSearch ? (assetType === 'Criptomoeda' ? 'Buscar criptomoeda' : 'Buscar ativo') : f.label}
              {f.required ? ' *' : ''}
            </span>
            {isAssetSearch ? (
              <AssetSearch inputId={`${prefix}-${f.key}`} value={value} setValue={setValue} crypto={assetType === 'Criptomoeda'} />
            ) : f.type === 'select' ? (
              <Choice
                inputId={`${prefix}-${f.key}`}
                name={f.key}
                label={f.label}
                options={options}
                value={String(value[f.key] ?? '')}
                onChange={(v) => setValue({ ...value, [f.key]: v, ...(kind === 'recurrences' && f.key === 'sourceKind' ? { sourceId: '' } : {}), ...(kind === 'assetCostLinks' && f.key === 'recordKind' ? { recordId: '', interestCents: null } : {}) })}
              />
            ) : f.type === 'textarea' ? (
              <textarea
                id={`${prefix}-${f.key}`}
                name={f.key}
                autoComplete="off"
                value={String(value[f.key] ?? '')}
                onChange={(e) =>
                  setValue({ ...value, [f.key]: e.target.value })
                }
              />
            ) : (
              <>
                <input
                  id={`${prefix}-${f.key}`}
                  name={f.key}
                  autoComplete="off"
                  required={f.required}
                  type={f.type || 'text'}
                  onClick={openDatePicker}
                  min={f.type === 'number' && !f.signed ? 0 : undefined}
                  step={
                    f.type === 'number' ? (f.key.endsWith('Cents') ? '0.01' : f.integer ? '1' : 'any') : undefined
                  }
                  value={f.key.endsWith('Cents') && typeof value[f.key] === 'number' ? Number(value[f.key]) / 100 : value[f.key] ?? ''}
                  list={f.key === 'activity' ? 'activity-options' : undefined}
                  onChange={(e) =>
                    setValue({
                      ...value,
                      [f.key]:
                        f.type === 'number'
                          ? e.target.value === ''
                            ? ''
                            : f.key.endsWith('Cents') ? (Math.abs(Number(e.target.value)) <= Number.MAX_SAFE_INTEGER / 100 ? toCents(Number(e.target.value)) : e.target.value) : Number(e.target.value)
                          : e.target.value,
                    })
                  }
                />
                {f.key === 'activity' && (
                  <datalist id="activity-options">
                    {data.activities.map((r) => (
                      <option
                        key={r.id}
                        value={String(r.name)}
                        aria-label={String(r.name)}
                      />
                    ))}
                  </datalist>
                )}
              </>
            )}
          </label>
        );
      })}
    </div>
  );
}

function AssetSearch({ inputId, value, setValue, crypto }: { inputId: string; value: Row; setValue: (r: Row) => void; crypto: boolean }) {
  const [query, setQuery] = useState(String(value.ticker || value.coinGeckoId || ''));
  const [items, setItems] = useState<AssetSuggestion[]>([]), [loading, setLoading] = useState(false), [message, setMessage] = useState('');
  const [active, setActive] = useState(-1); const request = useRef(0);
  useEffect(() => {
    if (!query.trim()) return;
    const current = ++request.current; const timer = setTimeout(async () => {
      const result = crypto ? await searchCrypto(query) : await searchB3(query);
      if (current !== request.current) return;
      setItems(result); setLoading(false); setActive(-1); setMessage(result.length ? '' : 'Nenhum ativo encontrado. Você pode informar o ticker manualmente.');
    }, 350);
    return () => clearTimeout(timer);
  }, [query, crypto]);
  const choose = (item: AssetSuggestion) => { setValue({ ...value, name: item.name, ticker: item.symbol, coinGeckoId: item.id || value.coinGeckoId || '' }); setQuery(item.symbol); setItems([]); };
  return <div className="asset-search"><input id={inputId} role="combobox" aria-expanded={items.length > 0} aria-controls="asset-search-results" aria-autocomplete="list" value={query} onChange={(e) => { setQuery(e.target.value); setValue({ ...value, ticker: e.target.value }); }} onKeyDown={(e) => { if (e.key === 'ArrowDown') { e.preventDefault(); setActive((x) => Math.min(x + 1, items.length - 1)); } else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((x) => Math.max(x - 1, 0)); } else if (e.key === 'Enter' && items[active]) { e.preventDefault(); choose(items[active]); } else if (e.key === 'Escape' && items.length > 0) { e.preventDefault(); e.stopPropagation(); setItems([]); } }} />{loading && <small>Buscando ativos...</small>}{message && <small>{message}</small>}{items.length > 0 && <div id="asset-search-results">{items.map((item, index) => <button type="button" className="asset-option" key={item.id || item.symbol} aria-current={index === active ? 'true' : undefined} onMouseDown={() => choose(item)}><strong>{item.symbol}</strong><span>{item.name}</span></button>)}</div>}</div>;
}
export function Editor({
  kind,
  row,
  data,
  onClose,
  onSave,
}: {
  kind: Collection | 'settings' | 'bike';
  row?: Row;
  data: Data;
  onClose: () => void;
  onSave: (r: Row) => void;
}) {
  const [value, setValue] = useState<Row>(
    row ? { ...emptyRow(kind), ...row } : { ...emptyRow(kind), id: id() },
  );
  const [error, setError] = useState('');
  const [automaticRevenue, setAutomaticRevenue] = useState(
    !row ||
      (calculateWorkRevenues(row).expected !== null &&
        row.revenue === calculateWorkRevenues(row).expected),
  );
  const isCards = kind === 'work' && value.activity === 'Entrega de cartões';
  const workType: WorkType = kind === 'work' ? workTypeForActivity(String(value.activity || '')) : 'other';
  const expected = calculateWorkRevenues(value).expected;
  const preview = kind === 'work' ? workResult(num(value.revenue), num(value.km), num(value.hours), costs(data).economic) : null;
  const title =
    kind === 'settings'
      ? 'Configurações'
      : kind === 'bike'
        ? 'Dados da moto'
        : labels[kind];
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="editor-dialog" showCloseButton={false}>
        <DialogTitle>
          {row ? 'Editar' : 'Adicionar'} · {title}
        </DialogTitle>
        <DialogDescription>
          {kind === 'debts'
            ? num(value.totalInstallments) > 0
              ? 'Os campos abaixo são usados para calcular automaticamente o saldo e o progresso.'
              : 'Saldo e parcelas na inclusão são a base. Os pagamentos registrados são descontados automaticamente.'
            : kind === 'services'
              ? 'Este custo entra no saldo como despesa real. Não cadastre novamente em Gastos.'
              : kind === 'investments'
                ? 'Comece pelo tipo e nome. O saldo inicial é patrimônio já existente; use movimentações para aportes, retiradas e rendimentos.'
                : 'Preencha os dados. As alterações serão salvas neste navegador.'}
        </DialogDescription>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            try {
              const cleaned = { ...value };
              for (const f of schemas[kind])
                if (f.type === 'number' && cleaned[f.key] === '' && !f.required)
                  cleaned[f.key] = f.nullable ? null : 0;
              onSave(cleaned);
            } catch (e) {
              setError((e as Error).message);
            }
          }}
        >
          <div className="editor-body">
          {kind === 'work' && <fieldset className="work-type-choice wide">
            <legend>O que você vai registrar?</legend>
            <div className="segmented-choice" role="radiogroup" aria-label="Tipo de trabalho">
              {([['uber', 'Uber', 'Corridas', Bike], ['cards', 'Cartões', 'Entregas', CreditCard], ['other', 'Outro', 'Atividade personalizada', BriefcaseBusiness]] as const).map(([type, label, description, Icon]) => <label key={type} className={workType === type ? 'selected' : ''}><input type="radio" name="work-type" value={type} checked={workType === type} onChange={() => setValue({ ...value, activity: activityForWorkType(type, String(value.activity || '')) })} /><Icon size={22}/><span>{label}</span><small>{description}</small></label>)}
            </div>
            {workType === 'other' && <label htmlFor="work-activity-name"><span>Nome da atividade *</span><input id="work-activity-name" required value={String(value.activity || '')} onChange={(e) => setValue({ ...value, activity: e.target.value })} placeholder="Ex.: Corrida particular" /></label>}
          </fieldset>}
          <Fields
            kind={kind}
            fields={
              kind === 'work'
                ? schemas.work
                    .filter(
                      (f) =>
                        f.key !== 'activity' &&
                        f.key !== 'expectedRevenue' &&
                        (isCards ||
                          !['cardQuantity', 'cardUnitValue'].includes(f.key)),
                    )
                    .map((f) =>
                      f.key === 'revenue' && isCards
                        ? { ...f, label: 'Valor realmente recebido (R$)' }
                        : f,
                    )
                : schemas[kind].filter(
                    (f) =>
                      !(
                        kind === 'debts' &&
                        f.key === 'balance' &&
                        num(value.totalInstallments) > 0
                      ) &&
                      !(
                        ['expenses', 'services'].includes(kind) &&
                        attributionKeys.includes(f.key)
                      ) &&
                      !(
                        kind === 'costs' &&
                        f.key === 'componentId' &&
                        value.matchMode !== 'manual'
                      ),
                  ).filter((f) => {
                      if (kind === 'assetValuations' && f.key === 'sequence') return false;
                      if (kind === 'assetCostLinks' && f.key === 'interestCents') return value.recordKind === 'payments';
                      if (kind === 'assets') {
                        if (f.key === 'linkedBike') return false;
                        if (value.linkedBike && ['name','type','purchaseDate','purchasePriceCents','purchaseKm','currentKm'].includes(f.key)) return false;
                        if (['purchaseKm','currentKm'].includes(f.key)) return ['motorcycle','car'].includes(String(value.type));
                        if (f.key === 'cashPurchaseCents') return value.cashPurchase === 'sim';
                        if (['soldAt','saleValueCents','cashSale'].includes(f.key)) return value.active === 'não';
                      }
                      if (kind === 'budgets' && ['createdAt', 'updatedAt'].includes(f.key)) return false;
                      if (kind === 'recurrences') {
                        if (['effectiveFrom', 'scheduleHistory', 'archived'].includes(f.key)) return false;
                      if (f.key === 'intervalDays') return value.frequency === 'personalizado';
                      if (f.key === 'dueDay') return ['mensal', 'bimestral', 'trimestral', 'semestral', 'anual'].includes(String(value.frequency));
                      if (f.key === 'sourceId') return value.sourceKind !== 'nenhum';
                    }
                    if (kind !== 'investments') return true;
                    const type = String(value.category || '');
                    if (f.key === 'indexer' || f.key === 'indexerPercent') return ['CDB', 'LCI', 'LCA', 'Conta remunerada'].includes(type) && String(value.rateType || 'Pós-fixado') === 'Pós-fixado';
                    if (f.key === 'rateType') return ['CDB', 'LCI', 'LCA', 'Conta remunerada'].includes(type);
                    if (f.key === 'maturity') return type.startsWith('Tesouro') || ['CDB', 'LCI', 'LCA'].includes(type);
                    if (f.key === 'anniversaryDay') return type === 'Poupança';
                    if (f.key === 'quantity' || f.key === 'averagePrice') return ['Ação', 'ETF', 'FII', 'Criptomoeda'].includes(type);
                    if (f.key === 'currentValue') return true;
                    return true;
                  })
            }
            value={value}
            setValue={(next) => {
              if (kind !== 'work') {
                setValue(next);
                return;
              }
              if (next.revenue !== value.revenue) setAutomaticRevenue(false);
              setValue(
                updateCardWork(
                  value,
                  next,
                  automaticRevenue && next.revenue === value.revenue,
                ),
              );
            }}
            data={data}
          />
          {['expenses', 'services'].includes(kind) && (
            <AttributionFields value={value} setValue={setValue} data={data} />
          )}
          {isCards && (
            <div className="notice">
              <p>
                Valor esperado:{' '}
                <strong>
                  {expected === null
                    ? 'Informe quantidade e valor unitário'
                    : money(expected)}
                </strong>
              </p>
              <p>
                {automaticRevenue
                  ? 'Recebido acompanha o esperado.'
                  : 'Recebido definido manualmente; preservado ao recalcular cartões.'}
              </p>
              <button
                type="button"
                disabled={expected === null}
                onClick={() => {
                  setAutomaticRevenue(true);
                  setValue({
                    ...value,
                    revenue: expected,
                    expectedRevenue: expected,
                  });
                }}
              >
                Usar valor esperado
              </button>
            </div>
          )}
          {kind === 'maintenance' && (
            <p className="notice">
              Custo estimado/km:{' '}
              {maintenanceCosts(data, value).estimatedCostPerKm === null
                ? 'Informe custo e vida útil ou intervalo em km.'
                : 'R$ ' +
                  new Intl.NumberFormat('pt-BR', {
                    maximumFractionDigits: 4,
                  }).format(
                    maintenanceCosts(data, value).estimatedCostPerKm ?? 0,
                  )}
              . O valor pago inicial é histórico; registre novas trocas e
              pagamentos em Realizar. Vincule uma previsão da aba Moto se ela
              representar este mesmo item.
            </p>
          )}
          {preview && <section aria-label="Resumo da jornada"><h3>Resumo antes de salvar</h3><Metrics items={[
            ['Receita', money(preview.revenue)], ['Custo econômico', money(preview.cost), 'Estimado'],
            ['Lucro econômico', money(preview.profit), 'Estimado'], ['Receita por hora', money(preview.revenueHour)],
          ]}/><p className="inline-note">Estimativa por km. Despesas pagas e atribuídas são exibidas separadamente no resultado de caixa.</p></section>}
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          </div>
          <div className="form-actions">
            <button type="button" onClick={onClose}>
              Cancelar
            </button>
            <button className="primary" type="submit">
              Salvar
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
export type Column = { label: string; render: (r: Row) => ReactNode };
export function Records({
  kind,
  rows,
  data,
  edit,
  del,
  columns,
  extra,
  filterKey,
  sortKey = 'date',
}: {
  kind: Collection;
  rows: Row[];
  data: Data;
  edit: (kind: Collection, r?: Row) => void;
  del: (kind: Collection, r: Row) => void;
  columns?: Column[];
  extra?: (r: Row) => ReactNode;
  filterKey?: string;
  sortKey?: string;
}) {
  const [search, setSearch] = useState(''),
    [filter, setFilter] = useState('todos'),
    [order, setOrder] = useState(sortKey === 'days' ? 'asc' : 'desc'),
    [from, setFrom] = useState(''),
    [to, setTo] = useState('');
  const fields = schemas[kind];
  const visible = rows
    .filter(
      (r) =>
        (!from || String(r.date) >= from) &&
        (!to || String(r.date) <= to) &&
        Object.values(r)
          .join(' ')
          .toLowerCase()
          .includes(search.toLowerCase()) &&
        (filter === 'todos' || String(r[filterKey || '']) === filter),
    )
    .sort((a, b) => {
      const x = a[sortKey],
        y = b[sortKey];
      return (
        (typeof x === 'number' && typeof y === 'number'
          ? x - y
          : String(x ?? '').localeCompare(String(y ?? ''), 'pt-BR')) *
        (order === 'asc' ? 1 : -1)
      );
    });
  const recordsRef = useRef<HTMLDivElement>(null);
  const virtual = useVirtualRecords(visible, recordsRef);
  const cols =
    columns ||
    fields.slice(0, 4).map((f) => ({
      label: f.label,
      render: (r: Row) =>
        f.type === 'date'
          ? brDate(r[f.key])
          : f.label.includes('R$')
            ? money(num(r[f.key]))
            : String(r[f.key] ?? ''),
    }));
  return (
    <Card
      title={labels[kind]}
      action={
        <button className={kind === 'activities' ? 'secondary' : 'primary'} onClick={() => edit(kind)}>
          <Plus size={16} /> Adicionar
        </button>
      }
    >
      <div className="list-tools">
        <label className="search">
          <Search size={17} />
          <input
            aria-label={'Pesquisar ' + labels[kind]}
            placeholder="Pesquisar registros…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        {filterKey && (
          <Choice
            label="Filtrar registros"
            value={filter}
            onChange={setFilter}
            options={[
              'todos',
              ...new Set(rows.map((r) => String(r[filterKey]))),
            ]}
          />
        )}
        {fields.some((f) => f.key === 'date') && (
          <>
            <label className="date-filter">
              De
              <input
                aria-label={'Data inicial ' + labels[kind]}
                type="date" onClick={openDatePicker}
                value={from}
                onChange={(e) => setFrom(e.target.value)}
              />
            </label>
            <label className="date-filter">
              Até
              <input
                aria-label={'Data final ' + labels[kind]}
                type="date" onClick={openDatePicker}
                value={to}
                onChange={(e) => setTo(e.target.value)}
              />
            </label>
          </>
        )}
        <Choice
          label="Ordenar registros"
          value={order}
          onChange={setOrder}
          options={[
            { value: 'desc', label: 'Decrescente' },
            { value: 'asc', label: 'Crescente' },
          ]}
        />
      </div>
      {visible.length > 200 && <button onClick={() => virtual.setAll(!virtual.all)}>
        {virtual.all ? 'Ativar lista otimizada' : 'Mostrar lista completa para leitura e busca do navegador'}
      </button>}
      {visible.length ? (
        <div ref={recordsRef} className={virtual.enabled ? 'virtual-records' : undefined}
          onScroll={(event) => virtual.setScroll(event.currentTarget.scrollTop)}
          onFocusCapture={(event) => {
            const row = (event.target as HTMLElement).closest<HTMLElement>('[data-record-index]');
            virtual.setFocused(row ? Number(row.dataset.recordIndex) : undefined);
          }}
          onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) virtual.setFocused(undefined); }}>
        <section className="financial-records" aria-label={labels[kind]}>
          {virtual.enabled && virtual.top > 0 && <div aria-hidden="true" style={{ height: virtual.top }} />}
          {virtual.rows.map((r, index) => <article key={r.id} className="record-item" data-record-id={r.id} data-record-index={virtual.start + index}>
            <div className="record-heading"><h3>{String(r.name || r.activity || labels[kind])}</h3>
              <ActionsMenu label={'Ações de ' + String(r.name || r.activity || brDate(r.date))}>
                {extra?.(r)}
                <button aria-label={'Editar ' + String(r.name || r.activity || brDate(r.date))} onClick={() => edit(kind, data[kind].find((x) => x.id === r.id) || r)}><Pencil size={15}/>Editar</button>
                <button className="danger" aria-label={'Excluir ' + String(r.name || r.activity || brDate(r.date))} onClick={() => del(kind, r)}><Trash2 size={15}/>Excluir</button>
              </ActionsMenu>
            </div>
            <dl className="record-values">{cols.map((c) => <div key={c.label}><dt>{c.label}</dt><dd>{c.render(r)}</dd></div>)}</dl>
          </article>)}
          {virtual.enabled && virtual.bottom > 0 && <div aria-hidden="true" style={{ height: virtual.bottom }} />}
        </section>
        </div>
      ) : (
        <NoData
          text={rows.length ? 'Nenhum resultado para os filtros.' : undefined}
        />
      )}
    </Card>
  );
}
