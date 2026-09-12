import { AttributionFields } from './attribution-fields';
import { attributionKeys } from '../expense-allocation';
import {
  calculateWorkRevenues,
  updateCardWork,
  maintenanceCosts,
} from '../calculations';
import { useState, type ReactNode } from 'react';
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
}: {
  value: string;
  onChange: (v: string) => void;
  options: (string | { value: string; label: string })[];
  label: string;
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
      value={value}
      onValueChange={(v) => v !== null && onChange(String(v))}
      items={items}
    >
      <SelectTrigger aria-label={label} className="choice">
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
}: {
  fields: Field[];
  value: Row;
  setValue: (r: Row) => void;
  data: Data;
}) {
  return (
    <div className="form-grid">
      {fields.map((f) => {
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
          <label className={f.type === 'textarea' ? 'wide' : ''} key={f.key}>
            <span>
              {f.label}
              {f.required ? ' *' : ''}
            </span>
            {f.type === 'select' ? (
              <Choice
                label={f.label}
                options={options}
                value={String(value[f.key] ?? '')}
                onChange={(v) => setValue({ ...value, [f.key]: v })}
              />
            ) : f.type === 'textarea' ? (
              <textarea
                value={String(value[f.key] ?? '')}
                onChange={(e) =>
                  setValue({ ...value, [f.key]: e.target.value })
                }
              />
            ) : (
              <>
                <input
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
                ? 'O saldo inicial é patrimônio já existente. Use movimentações para novos aportes, retiradas e rendimentos.'
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
                  )
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
        <button className="primary" onClick={() => edit(kind)}>
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
      {visible.length ? (
        <Table>
          <TableHeader>
            <TableRow>
              {cols.map((c) => (
                <TableHead key={c.label}>{c.label}</TableHead>
              ))}
              <TableHead className="actions-column">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.map((r) => (
              <TableRow key={r.id}>
                {cols.map((c) => (
                  <TableCell key={c.label}>{c.render(r)}</TableCell>
                ))}
                <TableCell>
                  <div className="row-actions">
                    {extra?.(r)}
                    <button
                      aria-label={
                        'Editar ' +
                        String(r.name || r.activity || brDate(r.date))
                      }
                      onClick={() =>
                        edit(kind, data[kind].find((x) => x.id === r.id) || r)
                      }
                    >
                      <Pencil size={15} />
                    </button>
                    <button
                      aria-label={
                        'Excluir ' +
                        String(r.name || r.activity || brDate(r.date))
                      }
                      onClick={() => del(kind, r)}
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : (
        <NoData
          text={rows.length ? 'Nenhum resultado para os filtros.' : undefined}
        />
      )}
    </Card>
  );
}
