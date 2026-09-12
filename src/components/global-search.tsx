import { useState } from 'react';
import { type Data } from '../model';
const sources = [
  ['debts', 'Dívidas'],
  ['expenses', 'Gastos'],
  ['maintenance', 'Manutenção'],
  ['plans', 'Planos'],
] as const;
export function GlobalSearch({
  data,
  go,
}: {
  data: Data;
  go: (page: string) => void;
}) {
  const [query, setQuery] = useState('');
  const normalize = (value: string) =>
    value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();
  const rows = query.trim()
    ? sources
        .flatMap(([key, page]) =>
          data[key]
            .filter((r) =>
              normalize(String(r.name)).includes(normalize(query.trim())),
            )
            .map((r) => ({ id: r.id, name: String(r.name), page })),
        )
        .slice(0, 8)
    : [];
  return (
    <div className="global-search">
      <input
        aria-label="Busca global"
        placeholder="Buscar dívida, gasto, item ou plano…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      {query.trim() && (
        <div className="search-results" aria-label="Resultados da busca">
          {rows.length ? (
            rows.map((r) => (
              <button
                key={r.page + r.id}
                onClick={() => {
                  go(r.page);
                  setQuery('');
                }}
              >
                <b>{r.name}</b>
                <span>{r.page}</span>
              </button>
            ))
          ) : (
            <p>Nenhum registro encontrado.</p>
          )}
        </div>
      )}
    </div>
  );
}
