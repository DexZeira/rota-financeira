import { useMemo, useState } from 'react';
import { ArrowDownLeft, ArrowUpRight, ArrowLeftRight, Plus, Search, X } from 'lucide-react';
import { PageHeader, EmptyState, ActionsMenu } from '../components/finance-ui';
import { PrivateValue } from '../components/value-privacy';
import { brDate, money, today } from '../model';
import { toCents } from '../services/money-codec';
import { normalizeSearch } from '../services/universal-search';
import { transactionView } from '../services/transaction-view';
import { Sheet } from '../components/sheet';
import type { ViewProps } from './shared';
import './transactions.css';

export function Transactions({ data, edit, del, go }: ViewProps) {
  const [query, setQuery] = useState(''), [direction, setDirection] = useState('Todas'), [category, setCategory] = useState(() => new URLSearchParams(location.search).get('category') || 'Todas'), [origin, setOrigin] = useState('Todas'), [from, setFrom] = useState(''), [to, setTo] = useState(''), [order, setOrder] = useState('recent'), [limit, setLimit] = useState(50);
  const all = useMemo(() => transactionView(data), [data]);
  const [selected, setSelected] = useState<(typeof all)[number]>();
  const [account, setAccount] = useState('Todas'), [status, setStatus] = useState('Todos'), [minimum, setMinimum] = useState(''), [maximum, setMaximum] = useState('');
  const amountFilter = (value: string) => { if (!value) return null; try { const cents = toCents(Number(value)); return cents >= 0 ? cents : null; } catch { return null; } };
  const minCents = amountFilter(minimum), maxCents = amountFilter(maximum);
  const invalidMinimum = !!minimum && minCents === null, invalidMaximum = !!maximum && maxCents === null;
  const reversedRange = minCents !== null && maxCents !== null && minCents > maxCents;
  const invalidRange = invalidMinimum || invalidMaximum || reversedRange;
  const filtered = invalidRange ? [] : all.filter(row => (!from || row.date >= from) && (!to || row.date <= to) && (minCents === null || row.amountCents >= minCents) && (maxCents === null || row.amountCents <= maxCents) && (account === 'Todas' || row.account === account) && (status === 'Todos' || row.status === status) && (direction === 'Todas' || row.direction === direction) && (category === 'Todas' || row.category === category) && (origin === 'Todas' || row.origin === origin) && normalizeSearch(`${row.description} ${row.category} ${row.account}`).includes(normalizeSearch(query))).sort((a, b) => order === 'amount' ? b.amountCents - a.amountCents || b.date.localeCompare(a.date) : order === 'old' ? a.date.localeCompare(b.date) || a.id.localeCompare(b.id) : b.date.localeCompare(a.date) || a.id.localeCompare(b.id));
  const at = today(), yesterday = new Date(Date.parse(at + 'T00:00:00Z') - 86400000).toISOString().slice(0, 10);
  const dateLabel = (date: string) => date === 'Por valor' ? date : `${date === at ? 'Hoje · ' : date === yesterday ? 'Ontem · ' : ''}${brDate(date)}`;
  const groups = new Map<string, typeof filtered>();
  for (const row of filtered.slice(0, limit)) {
    const key = order === 'amount' ? 'Por valor' : row.date;
    const group = groups.get(key);
    if (group) group.push(row); else groups.set(key, [row]);
  }
  const reset = () => { setQuery(''); setDirection('Todas'); setCategory('Todas'); setOrigin('Todas'); setFrom(''); setTo(''); setOrder('recent'); setLimit(50); setAccount('Todas'); setStatus('Todos'); setMinimum(''); setMaximum(''); const url = new URL(location.href); url.searchParams.delete('category'); history.replaceState(null, '', url.pathname + url.search + url.hash); };
  const activeFilters = [
    query && { label: `Busca: ${query}`, clear: () => setQuery('') },
    direction !== 'Todas' && { label: `Direção: ${direction}`, clear: () => setDirection('Todas') },
    category !== 'Todas' && { label: `Categoria: ${category}`, clear: () => { setCategory('Todas'); const url = new URL(location.href); url.searchParams.delete('category'); history.replaceState(null, '', url.pathname + url.search + url.hash); } },
    origin !== 'Todas' && { label: `Origem: ${origin}`, clear: () => setOrigin('Todas') },
    account !== 'Todas' && { label: `Conta: ${account}`, clear: () => setAccount('Todas') },
    status !== 'Todos' && { label: `Status: ${status}`, clear: () => setStatus('Todos') },
    from && { label: `De ${brDate(from)}`, clear: () => setFrom('') },
    to && { label: `Até ${brDate(to)}`, clear: () => setTo('') },
    minimum && { label: `Mínimo: R$ ${minimum}`, clear: () => setMinimum('') },
    maximum && { label: `Máximo: R$ ${maximum}`, clear: () => setMaximum('') },
  ].filter(Boolean);
  return <div className="transactions-page">
    <PageHeader title="Transações" description="Entradas, saídas e transferências em uma única leitura." action={<button className="primary" onClick={() => edit('expenses')}><Plus size={17} aria-hidden="true"/>Novo gasto</button>}/>
    <section className="transaction-overview" aria-label="Movimentos no filtro atual">{(['Entrada', 'Saída', 'Transferência'] as const).map((value) => <div key={value}><span className="transaction-overview-icon" aria-hidden="true">{value === 'Entrada' ? <ArrowDownLeft size={19}/> : value === 'Saída' ? <ArrowUpRight size={19}/> : <ArrowLeftRight size={19}/>}</span><div><span>{value === 'Entrada' ? 'Entradas' : value === 'Saída' ? 'Saídas' : 'Transferências'}</span><strong><PrivateValue>{money(filtered.filter(row => row.direction === value).reduce((total, row) => total + row.amountCents, 0) / 100)}</PrivateValue></strong></div></div>)}</section>
    <div className="transaction-toolbar">
      <label className="transaction-search"><Search size={18} aria-hidden="true"/><input type="search" aria-label="Buscar transações" placeholder="Descrição, categoria ou conta" value={query} onChange={event => { setQuery(event.target.value); setLimit(50); }}/></label>
      <label>Direção<select value={direction} onChange={event => { setDirection(event.target.value); setLimit(50); }}>{['Todas', 'Entrada', 'Saída', 'Transferência', 'Ajuste patrimonial'].map(value => <option key={value}>{value}</option>)}</select></label>
      <label>Categoria<select value={category} onChange={event => { setCategory(event.target.value); setLimit(50); }}>{['Todas', ...new Set(all.map(row => row.category))].map(value => <option key={value}>{value}</option>)}</select></label>
      <label>Origem<select value={origin} onChange={event => { setOrigin(event.target.value); setLimit(50); }}>{['Todas', ...new Set(all.map(row => row.origin))].map(value => <option key={value}>{value}</option>)}</select></label>
      <details className="transaction-extra-filters"><summary>Período e ordem</summary><div><label>De<input type="date" value={from} onChange={event => setFrom(event.target.value)}/></label><label>Até<input type="date" value={to} onChange={event => setTo(event.target.value)}/></label><label>Ordem<select value={order} onChange={event => { setOrder(event.target.value); setLimit(50); }}><option value="recent">Mais recentes</option><option value="old">Mais antigas</option><option value="amount">Maior valor</option></select></label><label>Conta<select value={account} onChange={event => { setAccount(event.target.value); setLimit(50); }}>{['Todas', ...new Set(all.map(row => row.account))].map(value => <option key={value}>{value}</option>)}</select></label><label>Status<select value={status} onChange={event => { setStatus(event.target.value); setLimit(50); }}>{['Todos', ...new Set(all.map(row => row.status))].map(value => <option key={value}>{value}</option>)}</select></label><label>Valor mínimo (R$)<input type="number" min="0" step="0.01" value={minimum} aria-invalid={invalidMinimum || reversedRange || undefined} aria-describedby={invalidRange ? 'transaction-range-error' : undefined} onChange={event => { setMinimum(event.target.value); setLimit(50); }}/></label><label>Valor máximo (R$)<input type="number" min="0" step="0.01" value={maximum} aria-invalid={invalidMaximum || reversedRange || undefined} aria-describedby={invalidRange ? 'transaction-range-error' : undefined} onChange={event => { setMaximum(event.target.value); setLimit(50); }}/></label></div></details>
    </div>
    {invalidRange && <p id="transaction-range-error" role="alert" className="negative">Use valores positivos dentro do intervalo permitido. O mínimo não pode superar o máximo.</p>}
    {!!activeFilters.length && <div className="transaction-filter-chips" aria-label="Filtros aplicados">{activeFilters.map(filter => filter && <button key={filter.label} onClick={() => { filter.clear(); setLimit(50); }} aria-label={`Remover filtro ${filter.label}`}>{filter.label}<X size={13} aria-hidden="true"/></button>)}</div>}
    <div className="transaction-summary"><span>{filtered.length} de {all.length} registros</span><button onClick={reset}>Limpar filtros</button><button onClick={() => go('Importar')}>Importar extrato</button><button onClick={() => go('Contas')}>Revisar movimentos bancários</button></div>
    <p className="inline-note">Transferências e aportes não são novas receitas. Dados bancários sem revisão permanecem em Contas; não são contabilizados aqui.</p>
    {filtered.length === 0 ? <EmptyState title="Nenhuma transação neste filtro" description={all.length ? 'Ajuste a busca ou o período para reencontrar seus registros.' : 'Registre um gasto, trabalho ou importe um extrato para começar.'} action={<button onClick={all.length ? reset : () => edit('expenses')}>{all.length ? 'Limpar filtros' : 'Registrar primeiro gasto'}</button>}/> : [...groups].map(([date, rows]) => <section key={date} className="transaction-group" aria-label={dateLabel(date)}><h2>{dateLabel(date)}<span>{rows.length} registros</span></h2><div className="transaction-columns" aria-hidden="true"><span>Descrição / categoria</span><span>Conta / origem</span><span>Valor / direção</span><span>Status</span></div>{rows.map(row => <article key={row.id} className="transaction-row" data-direction={row.direction}>
      <div className="transaction-description"><span className="transaction-direction-icon" aria-hidden="true">{row.direction === 'Entrada' ? <ArrowDownLeft size={19}/> : row.direction === 'Saída' ? <ArrowUpRight size={19}/> : <ArrowLeftRight size={19}/>}</span><div><h3><button onClick={() => setSelected(row)} aria-label={`Ver detalhes de ${row.description}`}>{row.description}</button></h3><small>{row.category}{order === 'amount' && ` · ${brDate(row.date)}`}</small></div></div>
      <div className="transaction-account"><span>{row.account}</span><small>{row.origin}</small></div>
      <div className="transaction-amount"><strong><PrivateValue>{`${row.direction === 'Entrada' ? '+' : row.direction === 'Saída' ? '−' : '↔'} ${money(row.amountCents / 100)}`}</PrivateValue></strong><small>{row.direction}</small></div>
      <div className="transaction-status"><span>{row.status}</span><ActionsMenu label={`Ações de ${row.description}`}><button onClick={() => edit(row.kind, row.row)}>Editar registro</button><button className="danger" onClick={() => del(row.kind, row.row)}>Excluir registro</button></ActionsMenu></div>
    </article>)}</section>)}
    {filtered.length > limit && <button className="transaction-load-more" onClick={() => setLimit(value => value + 50)}>Mostrar mais 50 · {filtered.length - limit} restantes</button>}
    <Sheet open={!!selected} onClose={() => setSelected(undefined)} title="Detalhes da transação">{selected && <div className="transaction-detail"><h2>{selected.description}</h2><strong className="transaction-detail-amount"><PrivateValue>{money(selected.amountCents / 100)}</PrivateValue></strong><dl>{[['Data', brDate(selected.date)], ['Direção', selected.direction], ['Categoria', selected.category], ['Conta', selected.account], ['Origem', selected.origin], ['Status', selected.status]].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl><div className="row-actions"><button className="primary" onClick={() => { setSelected(undefined); edit(selected.kind, selected.row); }}>Editar registro</button><button className="danger" onClick={() => { setSelected(undefined); del(selected.kind, selected.row); }}>Excluir registro</button></div></div>}</Sheet>
  </div>;
}
