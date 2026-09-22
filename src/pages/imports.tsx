import { useEffect, useMemo, useRef, useState } from 'react';
import {
  type Data,
  categories,
  money,
  today,
  emptyRow,
  brDate,
} from '../model';
import { type ViewProps } from './shared';
import { csvCells, detectCsv } from '../services/import/csv-import';
import {
  decodeStatement,
  fileHash,
  normalizeDescription,
} from '../services/import/transaction-normalizer';
import {
  MAX_FILE_BYTES,
  type Source,
  type Review,
  type CsvOptions,
  type RecordKind,
  type Rule,
} from '../services/import/types';
import {
  previewImport,
  prepareImport,
} from '../services/import/import-session';
import { detectSubscriptions } from '../services/import/subscription-detection';
import { validateData } from '../services/storage';
import './imports.css';
type Preview = ReturnType<typeof previewImport>;
const mappingLabels = {
  date: 'Data',
  description: 'Descrição',
  amount: 'Valor',
  credit: 'Crédito',
  debit: 'Débito',
  type: 'Tipo',
  externalId: 'Identificador',
  account: 'Conta',
  document: 'Documento',
};
const statusLabels = {
  new: 'Novo',
  possible_match: 'Correspondência possível',
  duplicate: 'Duplicata',
  invalid: 'Inválido',
};
const initialReview = (category = 'outras'): Review => ({
  action: 'pending',
  category,
  recordKind: '',
  recordId: '',
  override: false,
  remember: false,
});

export function Imports(
  p: ViewProps & { commitImport: (next: Data, expected: Data) => void },
) {
  const [file, setFile] = useState<{
      name: string;
      source: Source;
      bytes: Uint8Array;
      hash: string;
    } | null>(null),
    [options, setOptions] = useState<CsvOptions>(() => detectCsv('')),
    [encoding, setEncoding] = useState<'auto' | 'utf-8' | 'windows-1252'>(
      'auto',
    );
  const [rows, setRows] = useState<Preview>([]),
    [reviews, setReviews] = useState<Record<number, Review>>({}),
    [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [busy, setBusy] = useState(false),
    [confirmed, setConfirmed] = useState(false),
    [profileName, setProfileName] = useState(''),
    [profileId, setProfileId] = useState('');
  const [filter, setFilter] = useState('all'),
    [search, setSearch] = useState(''),
    [selected, setSelected] = useState<number | null>(null),
    [scroll, setScroll] = useState(0);
  const [ruleDraft, setRuleDraft] = useState<Rule>({
    id: '',
    pattern: '',
    mode: 'contains',
    category: 'outras',
    enabled: true,
  });
  const base = useRef(p.data),
    worker = useRef<Worker | null>(null),
    generation = useRef(0),
    list = useRef<HTMLDivElement>(null),
    fileInput = useRef<HTMLInputElement>(null);
  useEffect(
    () => () => {
      worker.current?.terminate();
      generation.current++;
    },
    [],
  );
  const text = useMemo(() => {
    try {
      return file ? decodeStatement(file.bytes, encoding) : '';
    } catch {
      return '';
    }
  }, [file, encoding]);
  const headers = useMemo(
    () =>
      file?.source === 'csv'
        ? (csvCells(
            text.slice(0, 16384).split(/\r?\n/, 1)[0],
            options.delimiter,
          )[0]?.cells.slice(0, 201) ?? [])
        : [],
    [file?.source, text, options.delimiter],
  );
  function invalidate() {
    worker.current?.terminate();
    generation.current++;
    setBusy(false);
    setRows([]);
    setReviews({});
    setSelected(null);
    setConfirmed(false);
  }
  async function chooseFile(f: File | undefined) {
    invalidate();
    setFile(null);
    setError('');
    setNotice('');
    if (!f) return;
    const token = ++generation.current;
    try {
      if (f.size > MAX_FILE_BYTES) throw Error('Arquivo maior que 10 MB.');
      const ext = f.name.split('.').at(-1)?.toLowerCase();
      if (ext !== 'csv' && ext !== 'ofx')
        throw Error('Selecione um arquivo .csv ou .ofx.');
      const bytes = new Uint8Array(await f.arrayBuffer()),
        hash = await fileHash(bytes);
      if (token !== generation.current) return;
      const decoded = decodeStatement(bytes, encoding);
      setFile({ name: f.name.slice(0, 200), source: ext, bytes, hash });
      setOptions(
        ext === 'csv' ? detectCsv(decoded) : { ...detectCsv(''), account: '' },
      );
      setProfileName('');
      setProfileId('');
    } catch (e) {
      if (token === generation.current)
        setError(
          e instanceof Error ? e.message : 'Não foi possível ler o arquivo.',
        );
    }
  }
  function analyze() {
    if (!file) return;
    invalidate();
    setError('');
    if (!text.trim()) {
      setError(
        'Arquivo vazio ou codificação inválida. Confira a codificação selecionada.',
      );
      return;
    }
    setBusy(true);
    base.current = p.data;
    const w = new Worker(
      new URL('../services/import/import-worker.ts', import.meta.url),
      { type: 'module' },
    );
    worker.current = w;
    w.onmessage = ({ data }: { data: { rows?: Preview; error?: string } }) => {
      setBusy(false);
      w.terminate();
      if (data.error) setError(data.error);
      else {
        setRows(data.rows ?? []);
        setScroll(0);
        setFilter('all');
        setSearch('');
      }
    };
    w.onerror = () => {
      setBusy(false);
      setError('Análise interrompida. Nenhum dado foi salvo.');
      w.terminate();
    };
    w.postMessage({ text, source: file.source, options, data: p.data });
  }
  const visible = useMemo(
    () =>
      rows.filter(
        (r) =>
          (!search ||
            r.transaction?.normalizedDescription.includes(
              normalizeDescription(search),
            )) &&
          (filter === 'all' ||
            (filter === 'ignored'
              ? reviews[r.line]?.action === 'ignore'
              : r.status === filter)),
      ),
    [rows, search, filter, reviews],
  );
  const start = Math.max(
      0,
      Math.min(Math.floor(scroll / 112) - 2, visible.length - 1),
    ),
    end = Math.min(visible.length, start + 12);
  const active = rows.find((r) => r.line === selected),
    choice = active
      ? (reviews[active.line] ?? initialReview(active.category.category))
      : initialReview();
  function changeReview(patch: Partial<Review>) {
    if (active) {
      setReviews((r) => ({
        ...r,
        [active.line]: {
          ...(r[active.line] ?? initialReview(active.category.category)),
          ...patch,
        },
      }));
      setConfirmed(false);
    }
  }
  const summary = useMemo(
    () => ({
      credits: rows.filter((r) => r.transaction?.direction === 'credit'),
      debits: rows.filter((r) => r.transaction?.direction === 'debit'),
      new: rows.filter((r) => r.status === 'new').length,
      duplicates: rows.filter((r) => r.status === 'duplicate').length,
      matches: rows.filter((r) => r.status === 'possible_match').length,
      invalid: rows.filter((r) => r.status === 'invalid').length,
    }),
    [rows],
  );
  const selectedCount = Object.values(reviews).filter(
    (r) => r.action !== 'pending',
  ).length;
  const subscriptions = useMemo(
    () =>
      detectSubscriptions(
        p.data.imports.links
          .filter((l) => ['created', 'matched'].includes(l.action))
          .map((l) => l.transaction),
        today(),
      ),
    [p.data.imports.links],
  );
  function apply() {
    if (!file || !confirmed) return;
    try {
      if (base.current !== p.data)
        throw Error(
          'Os dados mudaram. Gere o preview novamente antes de confirmar.',
        );
      const profile =
        profileName.trim() && file.source === 'csv'
          ? {
              id: profileId || crypto.randomUUID(),
              name: profileName.trim(),
              options,
            }
          : undefined;
      const next = prepareImport(
        p.data,
        rows,
        reviews,
        { source: file.source, fileName: file.name, hash: file.hash },
        profile,
      );
      p.commitImport(next, base.current);
      invalidate();
      setFile(null);
      if (fileInput.current) fileInput.current.value = '';
      setNotice(
        'Importação concluída. Somente as linhas revisadas foram processadas.',
      );
      setError('');
    } catch (e) {
      setError(
        (e instanceof Error ? e.message : 'Falha ao salvar.') +
          ' Nenhuma alteração desta confirmação foi aplicada.',
      );
    }
  }
  const act = (fn: () => void) => {
    try {
      fn();
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível salvar.');
    }
  };
  return (
    <div className="imports-page">
      <h1>Importar</h1>
      <p>
        CSV e OFX, processados neste dispositivo. Revise antes de confirmar. O
        arquivo original não é salvo.
      </p>
      {error && <p role="alert">{error}</p>}
      {notice && <output>{notice}</output>}
      <label>
        Arquivo CSV ou OFX
        <input
          ref={fileInput}
          type="file"
          accept=".csv,.ofx"
          onChange={(e) => void chooseFile(e.target.files?.[0])}
        />
      </label>
      <label>
        Codificação
        <select
          value={encoding}
          onChange={(e) => {
            setEncoding(e.target.value as typeof encoding);
            invalidate();
          }}
        >
          <option value="auto">Detectar UTF-8 / Windows-1252</option>
          <option value="utf-8">UTF-8</option>
          <option value="windows-1252">Windows-1252 / Latin-1</option>
        </select>
      </label>
      {file && (
        <section aria-label="Configuração do arquivo">
          <h2>1. Conferir arquivo</h2>
          <p>
            {file.name} · {file.source.toUpperCase()} · limite de 10 MB / 50.000
            linhas
          </p>
          {p.data.imports.sessions.some((s) => s.hash === file.hash) && (
            <output>
              Este arquivo parece já ter sido processado. Consulte Importações
              anteriores abaixo ou revise novamente.
            </output>
          )}
          <label>
            Identificação da conta
            <input
              value={options.account}
              maxLength={200}
              onChange={(e) => {
                invalidate();
                setOptions({ ...options, account: e.target.value });
              }}
              placeholder="Banco / conta — sem senha"
            />
          </label>
          {file.source === 'csv' && (
            <>
              <label>
                Perfil salvo
                <select
                  value={profileId}
                  onChange={(e) => {
                    invalidate();
                    setProfileId(e.target.value);
                    const profile = p.data.imports.profiles.find(
                      (r) => r.id === e.target.value,
                    );
                    if (profile) {
                      setOptions(profile.options);
                      setProfileName(profile.name);
                    }
                  }}
                >
                  <option value="">Novo mapeamento</option>
                  {p.data.imports.profiles.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </select>
              </label>
              <details open>
                <summary>Mapear colunas</summary>
                <div className="import-fields">
                  <label>
                    Separador
                    <select
                      value={options.delimiter}
                      onChange={(e) => {
                        invalidate();
                        setOptions({
                          ...options,
                          delimiter: e.target.value as ';' | ',',
                        });
                      }}
                    >
                      <option value=";">Ponto e vírgula</option>
                      <option value=",">Vírgula</option>
                    </select>
                  </label>
                  <label>
                    Formato dos valores
                    <select
                      value={options.locale}
                      onChange={(e) => {
                        invalidate();
                        setOptions({
                          ...options,
                          locale: e.target.value as CsvOptions['locale'],
                        });
                      }}
                    >
                      <option value="auto">
                        Detectar; perguntar se ambíguo
                      </option>
                      <option value="br">1.234,56</option>
                      <option value="en">1,234.56</option>
                    </select>
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      checked={options.header}
                      onChange={(e) => {
                        invalidate();
                        setOptions({ ...options, header: e.target.checked });
                      }}
                    />
                    Primeira linha é cabeçalho
                  </label>
                  {Object.entries(mappingLabels).map(([key, label]) => (
                    <label key={key}>
                      {label}
                      <select
                        aria-label={'Coluna ' + label}
                        value={
                          options.mapping[key as keyof typeof mappingLabels]
                        }
                        onChange={(e) => {
                          invalidate();
                          setOptions({
                            ...options,
                            mapping: {
                              ...options.mapping,
                              [key]: Number(e.target.value),
                            },
                          });
                        }}
                      >
                        <option value={-1}>Não usar</option>
                        {headers.map((h, i) => (
                          <option key={i} value={i}>
                            {i + 1}: {h.slice(0, 80) || 'Sem título'}
                          </option>
                        ))}
                      </select>
                    </label>
                  ))}
                </div>
              </details>
              <label>
                Salvar perfil ao confirmar (opcional)
                <input
                  value={profileName}
                  maxLength={100}
                  onChange={(e) => setProfileName(e.target.value)}
                />
              </label>
            </>
          )}
          <button onClick={analyze} disabled={busy}>
            Gerar preview
          </button>
          <button
            onClick={() => {
              invalidate();
              setFile(null);
              if (fileInput.current) fileInput.current.value = '';
            }}
          >
            Cancelar importação
          </button>
        </section>
      )}
      {busy && <output>Analisando localmente…</output>}
      {rows.length > 0 && (
        <section aria-label="Preview da importação">
          <h2>2. Revisar {rows.length} linhas</h2>
          <p>
            {summary.credits.length} créditos:{' '}
            {money(
              summary.credits.reduce(
                (s, r) => s + (r.transaction?.amountCents ?? 0),
                0,
              ) / 100,
            )}{' '}
            · {summary.debits.length} débitos:{' '}
            {money(
              summary.debits.reduce(
                (s, r) => s + (r.transaction?.amountCents ?? 0),
                0,
              ) / 100,
            )}
          </p>
          <p>
            Novos: {summary.new} · Duplicatas: {summary.duplicates} ·
            Correspondências: {summary.matches} · Inválidos: {summary.invalid}
          </p>
          <p>
            Créditos novos viram receitas bancárias, separadas do Trabalho.
            Transferências, aportes e resgates devem ser revisados; nunca são
            receita/despesa automaticamente.
          </p>
          <div className="import-actions">
            <button
              onClick={() => {
                setReviews((r) => {
                  const next = { ...r };
                  for (const row of rows)
                    if (
                      row.status === 'new' &&
                      row.transaction &&
                      !row.transferLines.length &&
                      !/\b(pix|transf|transferencia|aplicacao|aporte|resgate|rendimento)\b/.test(
                        row.transaction.normalizedDescription,
                      ) &&
                      !row.category.conflict
                    )
                      next[row.line] = {
                        ...initialReview(row.category.category),
                        action: 'create',
                      };
                  return next;
                });
                setConfirmed(false);
              }}
            >
              Selecionar novos seguros
            </button>
            <button
              onClick={() => {
                setReviews((r) => {
                  const next = { ...r };
                  for (const row of rows)
                    if (row.status === 'duplicate')
                      next[row.line] = { ...initialReview(), action: 'ignore' };
                  return next;
                });
                setConfirmed(false);
              }}
            >
              Ignorar duplicatas
            </button>
          </div>
          <div className="import-fields">
            <label>
              Buscar descrição
              <input
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setScroll(0);
                  if (list.current) list.current.scrollTop = 0;
                }}
              />
            </label>
            <label>
              Filtrar preview
              <select
                value={filter}
                onChange={(e) => {
                  setFilter(e.target.value);
                  setScroll(0);
                  if (list.current) list.current.scrollTop = 0;
                }}
              >
                <option value="all">Todos</option>
                {Object.entries(statusLabels).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
                <option value="ignored">Ignorados</option>
              </select>
            </label>
          </div>
          <p>
            {visible.length} linhas no filtro. Use a rolagem ou os botões para
            percorrer a lista.
          </p>
          <div
            className="import-window"
            ref={list}
            onScroll={(e) => setScroll(e.currentTarget.scrollTop)}
            aria-label="Lista virtual de transações"
          >
            <div style={{ height: start * 112 }} aria-hidden="true" />
            {visible.slice(start, end).map((row) => (
              <article className="import-preview-row" key={row.line}>
                <span>
                  Linha {row.line} ·{' '}
                  {reviews[row.line]?.action === 'ignore'
                    ? 'Ignorado'
                    : reviews[row.line]?.action &&
                        reviews[row.line]?.action !== 'pending'
                      ? 'Pronto'
                      : statusLabels[row.status]}
                </span>
                <strong>
                  {row.transaction?.description ?? row.errors.join(' ')}
                </strong>
                <div>
                  <span>
                    {row.transaction
                      ? `${brDate(row.transaction.date)} · ${row.transaction.direction === 'debit' ? '−' : '+'}${money(row.transaction.amountCents / 100)}`
                      : 'Requer correção'}
                  </span>
                  <button
                    onClick={() => setSelected(row.line)}
                    aria-label={'Revisar linha ' + row.line}
                  >
                    Revisar
                  </button>
                </div>
              </article>
            ))}
            <div
              style={{ height: Math.max(0, (visible.length - end) * 112) }}
              aria-hidden="true"
            />
          </div>
          <div className="import-actions">
            <button
              onClick={() => {
                if (list.current)
                  list.current.scrollTop = Math.max(0, scroll - 448);
              }}
            >
              Anteriores
            </button>
            <button
              onClick={() => {
                if (list.current)
                  list.current.scrollTop = Math.min(
                    (visible.length - 1) * 112,
                    scroll + 448,
                  );
              }}
            >
              Próximas
            </button>
          </div>
          {active && (
            <section
              className="import-review"
              aria-label={'Revisão da linha ' + active.line}
            >
              <h3>Linha {active.line}</h3>
              {!active.transaction ? (
                <p role="alert">{active.errors.join(' ')}</p>
              ) : (
                <>
                  <p>{active.transaction.description}</p>
                  <p>
                    {active.transaction.accountLabel ||
                      'Conta não identificada'}{' '}
                    · {brDate(active.transaction.date)} ·{' '}
                    {money(active.transaction.amountCents / 100)}
                  </p>
                  {active.duplicate && (
                    <p>
                      {active.duplicate.reason}{' '}
                      {active.duplicate.link.recordId &&
                      !p.data[
                        active.duplicate.link.recordKind as RecordKind
                      ]?.some((r) => r.id === active.duplicate?.link.recordId)
                        ? 'Registro anterior removido; histórico preservado.'
                        : ''}
                    </p>
                  )}
                  <label>
                    Ação da linha
                    <select
                      aria-label="Ação da linha"
                      value={choice.action}
                      onChange={(e) =>
                        changeReview({
                          action: e.target.value as Review['action'],
                          recurrenceId: '',
                          recordId: '',
                          recordKind: '',
                          override: false,
                        })
                      }
                    >
                      <option value="pending">Não importar por enquanto</option>
                      <option value="create">Criar lançamento novo</option>
                      <option value="investment">
                        Registrar aporte / retirada de investimento
                      </option>
                      <option value="ignore">Ignorar</option>
                      <option value="match">
                        Relacionar a realizado existente
                      </option>
                      {active.transaction.direction === 'debit' && (
                        <option value="payment">
                          Registrar pagamento de dívida
                        </option>
                      )}
                      {active.transferLines.length > 0 && (
                        <option value="transfer">
                          Transferência entre contas próprias
                        </option>
                      )}
                    </select>
                  </label>
                  {choice.action === 'create' && (
                    <>
                      <label>
                        Categoria
                        <select
                          aria-label="Categoria"
                          value={choice.category}
                          onChange={(e) =>
                            changeReview({ category: e.target.value })
                          }
                        >
                          {categories.map((c) => (
                            <option key={c}>{c}</option>
                          ))}
                        </select>
                      </label>
                      <p>{active.category.reason}</p>
                      <label>
                        <input
                          type="checkbox"
                          checked={choice.remember}
                          onChange={(e) =>
                            changeReview({ remember: e.target.checked })
                          }
                        />
                        Aplicar esta categoria à descrição exata no futuro
                      </label>
                    </>
                  )}
                  {['create', 'payment', 'investment'].includes(
                    choice.action,
                  ) &&
                    active.candidates.some((c) => c.kind === 'recurrences') && (
                      <label>
                        Conferir previsão (opcional)
                        <select
                          aria-label="Conferir previsão"
                          value={choice.recurrenceId ?? ''}
                          onChange={(e) =>
                            changeReview({ recurrenceId: e.target.value })
                          }
                        >
                          <option value="">Não vincular</option>
                          {active.candidates
                            .filter(
                              (c) =>
                                c.kind === 'recurrences' &&
                                p.data.recurrences.find((r) => r.id === c.id)
                                  ?.kind ===
                                  (choice.action === 'payment'
                                    ? 'dívida'
                                    : choice.action === 'investment'
                                      ? 'aporte'
                                      : active.transaction?.direction ===
                                          'credit'
                                        ? 'receita'
                                        : 'despesa'),
                            )
                            .map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.name} · {brDate(c.date)}
                              </option>
                            ))}
                        </select>
                      </label>
                    )}
                  {active.duplicate &&
                    ['create', 'payment', 'investment'].includes(
                      choice.action,
                    ) && (
                      <label>
                        <input
                          type="checkbox"
                          checked={choice.override}
                          onChange={(e) =>
                            changeReview({ override: e.target.checked })
                          }
                        />
                        Importar mesmo assim: reconheço o risco de duplicar
                      </label>
                    )}
                  {choice.action === 'payment' && (
                    <label>
                      Dívida
                      <select
                        value={choice.recordId}
                        onChange={(e) =>
                          changeReview({ recordId: e.target.value })
                        }
                      >
                        <option value="">Selecione</option>
                        {p.data.debts.map((d) => (
                          <option key={d.id} value={d.id}>
                            {String(d.name)}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                  {choice.action === 'investment' && (
                    <label>
                      Investimento de destino/origem
                      <select
                        aria-label="Investimento de destino/origem"
                        value={choice.recordId}
                        onChange={(e) =>
                          changeReview({ recordId: e.target.value })
                        }
                      >
                        <option value="">Selecione</option>
                        {p.data.investments.map((r) => (
                          <option key={r.id} value={r.id}>
                            {String(r.name)}
                          </option>
                        ))}
                      </select>
                      <span>
                        {active.transaction.direction === 'debit'
                          ? 'Débito: aporte.'
                          : 'Crédito: retirada (não rendimento).'}{' '}
                        Confira impostos e liquidez; o valor deve ser o
                        efetivamente transferido.
                      </span>
                    </label>
                  )}
                  {choice.action === 'match' && (
                    <label>
                      Registro realizado
                      <select
                        value={choice.recordKind + ':' + choice.recordId}
                        onChange={(e) => {
                          const [kind, ...id] = e.target.value.split(':');
                          changeReview({
                            recordKind: kind as RecordKind,
                            recordId: id.join(':'),
                          });
                        }}
                      >
                        <option value=":">Selecione</option>
                        {active.candidates
                          .filter(
                            (c) =>
                              c.kind !== 'debts' && c.kind !== 'recurrences',
                          )
                          .map((c) => (
                            <option
                              key={c.kind + ':' + c.id}
                              value={c.kind + ':' + c.id}
                            >
                              {c.name} · {brDate(c.date)} · {c.reason}
                            </option>
                          ))}
                        {active.duplicate?.link.recordId && (
                          <option
                            value={
                              active.duplicate.link.recordKind +
                              ':' +
                              active.duplicate.link.recordId
                            }
                          >
                            Registro anteriormente conciliado
                          </option>
                        )}
                      </select>
                    </label>
                  )}
                  {active.candidates.some((c) => c.kind === 'recurrences') && (
                    <p>
                      Há uma previsão semelhante. Vincule o realizado no
                      Planejamento depois de confirmar; previsão não é
                      pagamento.
                    </p>
                  )}
                  {choice.action === 'transfer' && (
                    <>
                      <label>
                        Outra ponta
                        <select
                          value={choice.transferLine ?? ''}
                          onChange={(e) =>
                            changeReview({
                              transferLine: Number(e.target.value),
                            })
                          }
                        >
                          <option value="">Selecione</option>
                          {active.transferLines.map((line) => (
                            <option value={line} key={line}>
                              Linha {line}
                            </option>
                          ))}
                        </select>
                      </label>
                      <button
                        onClick={() => {
                          const other = choice.transferLine;
                          if (other) {
                            setReviews((r) => ({
                              ...r,
                              [active.line]: choice,
                              [other]: {
                                ...initialReview(),
                                action: 'transfer',
                                transferLine: active.line,
                              },
                            }));
                            setConfirmed(false);
                          }
                        }}
                      >
                        Confirmar as duas pontas
                      </button>
                      <p>
                        Não cria receita nem despesa; apenas registra a
                        conciliação.
                      </p>
                    </>
                  )}
                </>
              )}
            </section>
          )}
          <h2>3. Confirmar</h2>
          <p>
            {selectedCount} linhas revisadas. Linhas pendentes e inválidas não
            serão importadas.
          </p>
          <label>
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
            />
            Revisei as decisões e confirmo a gravação
          </label>
          <button disabled={!confirmed || !selectedCount} onClick={apply}>
            Confirmar importação
          </button>
        </section>
      )}
      <details>
        <summary>
          Importações anteriores ({p.data.imports.sessions.length})
        </summary>
        {p.data.imports.sessions
          .slice()
          .reverse()
          .slice(0, 100)
          .map((s) => (
            <article key={s.id}>
              <strong>{s.fileName}</strong>
              <p>
                {brDate(s.createdAt.slice(0, 10))} · {s.source.toUpperCase()} ·{' '}
                {s.rowCount} linhas · {s.importedCount} criadas ·{' '}
                {s.matchedCount} relacionadas · {s.ignoredCount} ignoradas ·{' '}
                {s.duplicateCount} duplicatas · {s.invalidCount} inválidas
              </p>
            </article>
          ))}
        {p.data.imports.sessions.length > 100 && (
          <p>
            Mostrando as 100 sessões mais recentes. Histórico completo no
            backup.
          </p>
        )}
      </details>
      <details>
        <summary>Receitas bancárias ({p.data.bankReceipts.length})</summary>
        {p.data.bankReceipts
          .slice(-100)
          .reverse()
          .map((r) => (
            <article key={r.id}>
              <strong>{String(r.name)}</strong>
              <p>
                {brDate(r.date)} · {money(Number(r.amountCents) / 100)}
              </p>
              <button onClick={() => p.del('bankReceipts', r)}>
                Excluir receita
              </button>
            </article>
          ))}
      </details>
      <details>
        <summary>Regras de categoria ({p.data.imports.rules.length})</summary>
        <fieldset>
          <legend>Nova regra — não altera lançamentos antigos</legend>
          <label>
            Descrição ou padrão
            <input
              maxLength={100}
              value={ruleDraft.pattern}
              onChange={(e) =>
                setRuleDraft({ ...ruleDraft, pattern: e.target.value })
              }
            />
          </label>
          <label>
            Condição
            <select
              aria-label="Condição da regra"
              value={ruleDraft.mode}
              onChange={(e) =>
                setRuleDraft({
                  ...ruleDraft,
                  mode: e.target.value as Rule['mode'],
                })
              }
            >
              <option value="equals">É igual</option>
              <option value="contains">Contém</option>
              <option value="startsWith">Começa com</option>
              <option value="regex">Regex limitada</option>
            </select>
          </label>
          <label>
            Categoria da regra
            <select
              aria-label="Categoria da regra"
              value={ruleDraft.category}
              onChange={(e) =>
                setRuleDraft({ ...ruleDraft, category: e.target.value })
              }
            >
              {categories.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>
          <p>
            Regex: texto, ponto e âncoras ^/$; sem grupos, alternativas ou
            repetições.
          </p>
          <button
            onClick={() =>
              act(() => {
                p.commitImport(
                  validateData({
                    ...p.data,
                    imports: {
                      ...p.data.imports,
                      rules: [
                        ...p.data.imports.rules,
                        { ...ruleDraft, id: crypto.randomUUID() },
                      ],
                    },
                  }),
                  p.data,
                );
                setRuleDraft({ ...ruleDraft, pattern: '' });
                invalidate();
              })
            }
          >
            Salvar regra
          </button>
        </fieldset>
        {p.data.imports.rules.map((r) => (
          <label key={r.id}>
            <input
              type="checkbox"
              checked={r.enabled}
              onChange={() =>
                act(() =>
                  p.commitImport(
                    validateData({
                      ...p.data,
                      imports: {
                        ...p.data.imports,
                        rules: p.data.imports.rules.map((x) =>
                          x.id === r.id ? { ...x, enabled: !x.enabled } : x,
                        ),
                      },
                    }),
                    p.data,
                  ),
                )
              }
            />
            {r.pattern} → {r.category} ({r.mode})
          </label>
        ))}
      </details>
      <details>
        <summary>
          Assinaturas e gastos recorrentes detectados ({subscriptions.length})
        </summary>
        <p>
          Sugestões com pelo menos três cobranças mensais. Nenhuma recorrência é
          criada automaticamente.
        </p>
        {subscriptions.map((s) => (
          <article key={s.key}>
            <h3>{s.name}</h3>
            <p>
              {s.category} ·{' '}
              {s.inactive ? 'Possivelmente encerrada' : 'Padrão mensal'}
            </p>
            <p>
              Média: {money(s.averageCents / 100)}/mês · projeção:{' '}
              {money(s.annualCents / 100)}/ano
            </p>
            <p>
              Última: {brDate(s.lastDate)} · próxima estimada:{' '}
              {brDate(s.nextDate)}
            </p>
            {s.increaseCents > 0 && (
              <p>
                Valor subiu de {money(s.previousCents / 100)} para{' '}
                {money((s.previousCents + s.increaseCents) / 100)}.
              </p>
            )}
            <button
              onClick={() =>
                p.edit('recurrences', {
                  ...emptyRow('recurrences'),
                  name: s.name,
                  kind: 'despesa',
                  frequency: 'mensal',
                  amount: s.averageCents / 100,
                  startDate: s.nextDate,
                })
              }
            >
              Revisar criação de recorrência
            </button>
          </article>
        ))}
      </details>
    </div>
  );
}
