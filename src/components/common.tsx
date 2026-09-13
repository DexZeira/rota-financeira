import { AttributionFields } from './attribution-fields';
import { useVirtualRecords } from '../hooks/use-virtual-records';
import { attributionKeys } from '../expense-allocation';
import {
  calculateWorkRevenues,
  updateCardWork,
  maintenanceCosts,
} from '../calculations';
import { useId, useRef, useState, type ReactNode } from 'react';
import { useEffect } from 'react';
import { searchB3, searchCrypto, type AssetSuggestion } from '../services/market-quotes';
import { Plus, Search, Pencil, Trash2 } from 'lucide-react';
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
import { Empty, EmptyTitle, EmptyDescription } from '@/components/ui/empty';
import {
  Table,
  TableBody,
  TableRow,
  TableCell,
  TableHead,
  TableHeader,
} from '@/components/ui/table';
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
        <article className="card metric" key={label}>
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
    <Empty>
      <EmptyTitle>{text}</EmptyTitle>
      <EmptyDescription>{description}</EmptyDescription>
    </Empty>
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
  return (
    <div className="form-grid">
      {fields.map((f) => {
        const assetType = String(value.category || '');
        const isAssetSearch = kind === 'investments' && f.key === 'ticker' && ['Ação', 'ETF', 'FII', 'Criptomoeda'].includes(assetType);
        let options: (string | { value: string; label: string })[] =
          f.options || [];
        const ref =
          f.key === 'debtId'
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
        if (['costId', 'workSessionId', 'componentId'].includes(f.key))
          options = [{ value: '', label: 'Nenhuma' }, ...options];
        return (
          <label htmlFor={`${prefix}-${f.key}`} className={f.type === 'textarea' ? 'wide' : ''} key={f.key}>
              <span>
              {isAssetSearch ? (assetType === 'Criptomoeda' ? 'Buscar criptomoeda' : 'Buscar ativo') : f.label}
              {f.required ? ' *' : ''}
            </span>
            {isAssetSearch ? (
              <AssetSearch value={value} setValue={setValue} crypto={assetType === 'Criptomoeda'} />
            ) : f.type === 'select' ? (
              <Choice
                inputId={`${prefix}-${f.key}`}
                name={f.key}
                label={f.label}
                options={options}
                value={String(value[f.key] ?? '')}
                onChange={(v) => setValue({ ...value, [f.key]: v })}
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
                  min={f.type === 'number' && !f.signed ? 0 : undefined}
                  step={
                    f.type === 'number' ? (f.integer ? '1' : 'any') : undefined
                  }
                  value={value[f.key] ?? ''}
                  list={f.key === 'activity' ? 'activity-options' : undefined}
                  onChange={(e) =>
                    setValue({
                      ...value,
                      [f.key]:
                        f.type === 'number'
                          ? e.target.value === ''
                            ? ''
                            : Number(e.target.value)
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

function AssetSearch({ value, setValue, crypto }: { value: Row; setValue: (r: Row) => void; crypto: boolean }) {
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
  return <div className="asset-search"><input id="asset-search-input" role="combobox" aria-expanded={items.length > 0} aria-controls="asset-search-results" aria-autocomplete="list" value={query} onChange={(e) => { setQuery(e.target.value); setValue({ ...value, ticker: e.target.value }); }} onKeyDown={(e) => { if (e.key === 'ArrowDown') { e.preventDefault(); setActive((x) => Math.min(x + 1, items.length - 1)); } else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((x) => Math.max(x - 1, 0)); } else if (e.key === 'Enter' && items[active]) { e.preventDefault(); choose(items[active]); } else if (e.key === 'Escape') setItems([]); }} />{loading && <small>Buscando ativos...</small>}{message && <small>{message}</small>}{items.length > 0 && <div id="asset-search-results">{items.map((item, index) => <button type="button" className="asset-option" key={item.id || item.symbol} aria-current={index === active ? 'true' : undefined} onMouseDown={() => choose(item)}><strong>{item.symbol}</strong><span>{item.name}</span></button>)}</div>}</div>;
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
  const expected = calculateWorkRevenues(value).expected;
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
          <Fields
            kind={kind}
            fields={
              kind === 'work'
                ? schemas.work
                    .filter(
                      (f) =>
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
                    if (kind !== 'investments') return true;
                    const type = String(value.category || '');
                    if (f.key === 'indexer' || f.key === 'indexerPercent') return ['CDB', 'LCI', 'LCA', 'Conta remunerada'].includes(type) && String(value.rateType || 'Pós-fixado') === 'Pós-fixado';
                    if (f.key === 'rateType') return ['CDB', 'LCI', 'LCA', 'Conta remunerada'].includes(type);
                    if (f.key === 'maturity') return type.startsWith('Tesouro') || ['CDB', 'LCI', 'LCA'].includes(type);
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
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
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
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
              />
            </label>
            <label className="date-filter">
              Até
              <input
                aria-label={'Data final ' + labels[kind]}
                type="date"
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
        <Table aria-rowcount={visible.length + 1}>
          <TableHeader>
            <TableRow>
              {cols.map((c) => (
                <TableHead key={c.label}>{c.label}</TableHead>
              ))}
              <TableHead className="actions-column">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {virtual.enabled && virtual.top > 0 && <TableRow aria-hidden="true"><TableCell colSpan={cols.length + 1} style={{ height: virtual.top, padding: 0, border: 0 }} /></TableRow>}
            {virtual.rows.map((r, index) => (
              <TableRow key={r.id} data-record-id={r.id} data-record-index={virtual.start + index} aria-rowindex={virtual.start + index + 2}>
                {cols.map((c) => (
                  <TableCell key={c.label}>{c.render(r)}</TableCell>
                ))}
                <TableCell>
                  <details className="action-menu table-action-menu">
                    <summary aria-label={'Ações de ' + String(r.name || r.activity || brDate(r.date))}>•••</summary>
                    <div className="row-actions">
                      {extra?.(r)}
                      <button aria-label={'Editar ' + String(r.name || r.activity || brDate(r.date))} onClick={() => edit(kind, data[kind].find((x) => x.id === r.id) || r)}><Pencil size={15} /> Editar</button>
                      <button aria-label={'Excluir ' + String(r.name || r.activity || brDate(r.date))} onClick={() => del(kind, r)}><Trash2 size={15} /> Excluir</button>
                    </div>
                  </details>
                </TableCell>
              </TableRow>
            ))}
            {virtual.enabled && virtual.bottom > 0 && <TableRow aria-hidden="true"><TableCell colSpan={cols.length + 1} style={{ height: virtual.bottom, padding: 0, border: 0 }} /></TableRow>}
          </TableBody>
        </Table>
        </div>
      ) : (
        <NoData
          text={rows.length ? 'Nenhum resultado para os filtros.' : undefined}
        />
      )}
    </Card>
  );
}
