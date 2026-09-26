/* Rich multiline ARIA combobox results cannot be represented by native option text. */
/* oxlint-disable jsx-a11y/prefer-tag-over-role */
import { useEffect, useMemo, useRef, useState, useDeferredValue } from 'react';
import { Search } from 'lucide-react';
import { type Data, today, money, brDate } from '../model';
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
  type SearchResult,
} from '../services/universal-search';
import './universal-search.css';
export function GlobalSearch({
  data,
  go,
}: {
  data: Data;
  go: (page: string) => void;
}) {
  const [open, setOpen] = useState(false),
    [query, setQuery] = useState(''),
    [filter, setFilter] = useState('Todos'),
    [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null),
    at = today();
  const index = useMemo(() => buildSearchIndex(data, at), [data, at]);
  const deferred = useDeferredValue(query);
  const searching = query !== deferred;
  const found = useMemo(
    () => searchIndex(index, deferred, filter),
    [index, deferred, filter],
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
    go(result.route);
  };
  return (
    <>
      <button
        className="universal-search-trigger icon-button"
        aria-label="Abrir busca universal"
        onClick={() => setOpen(true)}
      >
        <Search size={20} />
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="universal-search-dialog" initialFocus={input}>
          <DialogTitle>Busca universal</DialogTitle>
          <DialogDescription>
            Registros locais. Use as setas e Enter para abrir a área
            relacionada.
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
              if (e.key === 'Enter' && !searching && found.results[active]) {
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
            {searching
              ? 'Buscando…'
              : deferred.trim()
                ? `${found.total} resultados · até 30 exibidos. Refine a busca para encontrar outros.`
                : 'Digite para buscar.'}
          </output>
          {/* Rich result options need a custom ARIA listbox, not native select text. */}
          <div
            role="listbox"
            id="universal-search-list"
            aria-label="Resultados da busca"
            aria-busy={searching}
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
                  if (!searching) select(r);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !searching) select(r);
                }}
              >
                <strong>{r.title}</strong>
                <span>
                  {r.type} · {r.subtitle}
                </span>
                <small>
                  {r.date ? brDate(r.date) : ''}
                  {r.amountCents !== undefined
                    ? ` · ${money(r.amountCents / 100)}`
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
