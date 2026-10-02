/* Rich multiline ARIA combobox results cannot be represented by native option text. */
/* oxlint-disable jsx-a11y/prefer-tag-over-role */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Search } from 'lucide-react';
import { type Data, type Collection, today, money, brDate } from '../model';
import { pageNames } from './app-navigation';
import { PrivateValue } from './value-privacy';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '../../components/ui/dialog';
import {
  buildSearchIndex,
  searchIndex,
  searchFilters,
  normalizeSearch,
  type SearchResult,
} from '../services/universal-search';
import './universal-search.css';
export function GlobalSearch({
  data,
  go,
  edit,
}: {
  data: Data;
  go: (page: string) => void;
  edit: (kind: Collection) => void;
}) {
  const [open, setOpen] = useState(false),
    [query, setQuery] = useState(''),
    [filter, setFilter] = useState('Todos'),
    [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null),
    at = today();
  const index = useMemo(() => buildSearchIndex(data, at), [data, at]);
  const found = useMemo(
    () => {
      const actions = [
        ['Novo gasto', 'expenses'], ['Registrar trabalho', 'work'], ['Novo aporte', 'movements'], ['Registrar manutenção', 'services'],
      ] as const;
      const commands: SearchResult[] = [
        ...pageNames.map((name) => ({ id: 'page:' + name, type: 'Página', title: name, route: name, sourceId: '', searchableText: name })),
        ...actions.map(([name, kind]) => ({ id: 'action:' + kind, type: 'Ação', title: name, route: '', sourceId: kind, searchableText: name })),
      ].filter((entry) => filter === 'Todos' && normalizeSearch(entry.title).includes(normalizeSearch(query)));
      const records = searchIndex(index, query, filter);
      return { results: [...commands, ...records.results].slice(0, 30), total: commands.length + records.total };
    },
    [index, query, filter],
  );
  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setOpen((value) => !value);
      }
    };
    window.addEventListener('keydown', listener);
    return () => window.removeEventListener('keydown', listener);
  }, []);
  const select = (result: SearchResult) => {
    setOpen(false);
    setQuery('');
    setActive(0);
    if (result.id.startsWith('action:')) edit(result.sourceId as Collection);
    else go(result.route);
  };
  return (
    <>
      <button
        className="universal-search-trigger icon-button"
        aria-label="Abrir busca universal"
        onClick={() => setOpen(true)}
      >
        <Search size={20} />
        <span>Buscar ou ir para…</span><kbd>{/Mac|iPhone|iPad/.test(navigator.platform) ? '⌘ K' : 'Ctrl K'}</kbd>
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="universal-search-dialog" initialFocus={input}>
          <DialogTitle>Busca universal</DialogTitle>
          <DialogDescription>
            Páginas, ações e registros locais. Use as setas e Enter para abrir.
          </DialogDescription>
          <input
            ref={input}
            aria-label="Busca global"
            role="combobox"
            aria-expanded={true}
            aria-controls="universal-search-list"
            aria-autocomplete="list"
            aria-activedescendant={
              found.results[active] ? `search-result-${active}` : undefined
            }
            placeholder="Nome, valor ou data…"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                e.preventDefault();
                const next = Math.max(
                  0,
                  Math.min(
                    found.results.length - 1,
                    active + (e.key === 'ArrowDown' ? 1 : -1),
                  ),
                );
                setActive(next);
                document
                  .getElementById(`search-result-${next}`)
                  ?.scrollIntoView({ block: 'nearest' });
              }
              if (e.key === 'Enter' && found.results[active]) {
                e.preventDefault();
                select(found.results[active]);
              }
            }}
          />
          <label>
            Tipo de registro
            <select
              value={filter}
              onChange={(e) => {
                setFilter(e.target.value);
                setActive(0);
              }}
            >
              {searchFilters.map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
          </label>
          <output>
            {query.trim()
                ? `${found.total} resultados · até 30 exibidos. Refine a busca para encontrar outros.`
                : 'Escolha uma página ou ação, ou digite para buscar registros.'}
          </output>
          {/* Rich result options need a custom ARIA listbox, not native select text. */}
          <div
            role="listbox"
            id="universal-search-list"
            aria-label="Resultados da busca"
            className="universal-search-list"
          >
            {found.results.map((r, i) => (
              <div
                role="option"
                tabIndex={-1}
                aria-selected={active === i}
                id={`search-result-${i}`}
                key={r.id}
                onClick={() => {
                  select(r);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') select(r);
                }}
              >
                <strong>{r.title}</strong>
                <span>
                  {r.type} · {r.subtitle}
                </span>
                <small>
                  {r.date ? brDate(r.date) : ''}
                  {r.amountCents !== undefined
                    ? <PrivateValue>{` · ${money(r.amountCents / 100)}`}</PrivateValue>
                    : ''}
                </small>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
