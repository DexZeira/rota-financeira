'use client';
import { GlobalSearch } from '../src/components/global-search';
import { useEffect, useRef, useState } from 'react';
import {
  LayoutDashboard,
  Wallet,
  BriefcaseBusiness,
  Bike,
  Wrench,
  Receipt,
  TrendingUp,
  Flag,
  ChartNoAxesCombined,
  Settings,
  Plus,
  Sun,
  Moon,
  Download,
} from 'lucide-react';
import {
  SidebarProvider,
  Sidebar,
  SidebarContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarHeader,
  SidebarFooter,
  SidebarTrigger,
  SidebarInset,
  useSidebar,
} from '@/components/ui/sidebar';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogTitle,
  AlertDialogDescription,
} from '@/components/ui/alert-dialog';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Editor } from '../src/components/common';
import {
  defaults,
  collections,
  labels,
  validateRow,
  today,
  brDate,
  type Data,
  type Collection,
  type Row,
} from '../src/model';
import {
  Dashboard,
  Work,
  Debts,
  Expenses,
  Motorcycle,
  Maintenance,
  Investments,
  Plans,
  Analysis,
  SettingsView,
} from '../src/pages/views';
import {
  STORAGE_KEY,
  load,
  save,
  upsert,
  remove,
  backup,
  download,
  parseBackup,
  resetData,
  validateRelations,
  type ResetKind,
} from '../src/services/storage';
import { financial, targets, costs } from '../src/calculations';
const navigation = [
  ['Dashboard', LayoutDashboard],
  ['Dívidas', Wallet],
  ['Trabalho', BriefcaseBusiness],
  ['Moto', Bike],
  ['Manutenção', Wrench],
  ['Gastos', Receipt],
  ['Investimentos', TrendingUp],
  ['Planos', Flag],
  ['Análises', ChartNoAxesCombined],
  ['Configurações', Settings],
] as const;
const navGroups = [
  { title: 'VISÃO GERAL', pages: ['Dashboard'] },
  {
    title: 'FINANÇAS',
    pages: ['Dívidas', 'Gastos', 'Investimentos', 'Planos'],
  },
  { title: 'TRABALHO', pages: ['Trabalho'] },
  { title: 'MOTO', pages: ['Moto', 'Manutenção'] },
  { title: 'ANÁLISES', pages: ['Análises'] },
  { title: 'SISTEMA', pages: ['Configurações'] },
];
function Nav({ page, go }: { page: string; go: (page: string) => void }) {
  const { setOpenMobile } = useSidebar();
  return (
    <>
      {navGroups.map((group) => (
        <div className="nav-group" key={group.title}>
          <p>{group.title}</p>
          <SidebarMenu>
            {group.pages.map((name) => {
              const entry = navigation.find(([n]) => n === name)!;
              const Icon = entry[1];
              return (
                <SidebarMenuItem key={name}>
                  <SidebarMenuButton
                    isActive={page === name}
                    onClick={() => {
                      go(name);
                      setOpenMobile(false);
                    }}
                  >
                    <Icon />
                    <span>{name}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              );
            })}
          </SidebarMenu>
        </div>
      ))}
    </>
  );
}
function MobileNav({ page, go }: { page: string; go: (page: string) => void }) {
  const { setOpenMobile } = useSidebar();
  return (
    <nav className="mobile-nav" aria-label="Navegação móvel">
      {['Dashboard', 'Trabalho', 'Dívidas', 'Moto'].map((name) => {
        const entry = navigation.find(([n]) => n === name)!;
        const Icon = entry[1];
        return (
          <button
            key={name}
            aria-current={page === name ? 'page' : undefined}
            onClick={() => go(name)}
          >
            <Icon size={19} />
            <span>{name}</span>
          </button>
        );
      })}
      <button onClick={() => setOpenMobile(true)}>
        <span aria-hidden="true">•••</span>
        <span>Mais</span>
      </button>
    </nav>
  );
}
export default function Home() {
  const [data, setData] = useState<Data>(defaults),
    [page, setPage] = useState('Dashboard'),
    [ready, setReady] = useState(false),
    [error, setError] = useState(''),
    [blocked, setBlocked] = useState(false),
    [message, setMessage] = useState(''),
    [undo, setUndo] = useState<Data | null>(null);
  const [editor, setEditor] = useState<{
      kind: Collection | 'settings' | 'bike';
      row?: Row;
    } | null>(null),
    [deletion, setDeletion] = useState<{ kind: Collection; row: Row } | null>(
      null,
    ),
    [reset, setReset] = useState<ResetKind | null>(null),
    [resetText, setResetText] = useState(''),
    [incoming, setIncoming] = useState<Data | null>(null);
  const disk = useRef<string | null>(null),
    current = useRef(data);
  useEffect(() => {
    current.current = data;
  }, [data]);
  useEffect(() => {
    queueMicrotask(() => {
      try {
        const d = load(localStorage);
        disk.current = localStorage.getItem(STORAGE_KEY);
        setData(d);
      } catch (e) {
        setError(
          'Não foi possível carregar os dados. O conteúdo existente foi preservado. ' +
            (e as Error).message,
        );
        setBlocked(true);
      }
      setReady(true);
    });
    const stored = () => {
      try {
        const d = load(localStorage);
        disk.current = localStorage.getItem(STORAGE_KEY);
        setData(d);
        setEditor(null);
        setUndo(null);
        setMessage('Dados atualizados por outra aba.');
      } catch (e) {
        setError((e as Error).message);
      }
    };
    window.addEventListener('storage', stored);
    return () => window.removeEventListener('storage', stored);
  }, []);
  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () =>
      document.documentElement.classList.toggle(
        'dark',
        data.settings.theme === 'escuro' ||
          (data.settings.theme === 'sistema' && media.matches),
      );
    apply();
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, [data.settings.theme]);
  function commit(next: Data) {
    if (blocked) throw Error('Recupere seus dados antes de salvar.');
    if (localStorage.getItem(STORAGE_KEY) !== disk.current)
      throw Error('Os dados mudaram em outra aba. Recarregue antes de salvar.');
    validateRelations(next);
    save(localStorage, next);
    disk.current = JSON.stringify(next);
    setData(next);
    current.current = next;
    setError('');
  }
  function safely(action: () => void) {
    try {
      action();
    } catch (e) {
      setError((e as Error).message);
    }
  }
  function edit(kind: Collection | 'settings' | 'bike', row?: Row) {
    setEditor({ kind, row });
  }
  function exportBackup() {
    download(backup(data), 'rota-backup-' + today() + '.json');
    setMessage(
      'Download do backup solicitado. Se não iniciar, use Copiar backup.',
    );
  }
  function recovery() {
    localStorage.setItem('rota-recovery', backup(data));
  }
  function go(p: string) {
    setPage(p);
    window.scrollTo({ top: 0 });
  }
  useEffect(() => {
    type Context = {
      registerTool: (tool: unknown, options: unknown) => void | Promise<void>;
    };
    const context = (document as Document & { modelContext?: Context })
      .modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    for (const tool of [
      {
        name: 'read_financial_summary',
        description:
          'Ler saldo, metas e custos calculados dos registros deste navegador.',
        inputSchema: {
          type: 'object',
          properties: {},
          additionalProperties: false,
        },
        annotations: { readOnlyHint: true },
        execute: () => ({
          financial: financial(current.current),
          targets: targets(current.current),
          costs: costs(current.current),
        }),
      },
      {
        name: 'start_work_entry',
        description:
          'Abrir o formulário de trabalho para preenchimento e revisão pelo usuário. Não salva um registro.',
        inputSchema: {
          type: 'object',
          properties: {},
          additionalProperties: false,
        },
        annotations: { readOnlyHint: false },
        execute: (input: unknown) => {
          if (!input || typeof input !== 'object' || Object.keys(input).length)
            throw Error('Informe um objeto vazio.');
          setEditor({ kind: 'work' });
          return { opened: true };
        },
      },
    ]) {
      try {
        void Promise.resolve(
          context.registerTool(tool, { signal: lifecycle.signal }),
        ).catch(() => {});
      } catch {}
    }
    return () => lifecycle.abort();
  }, []);
  if (!ready)
    return <output className="loading">Carregando seus dados…</output>;
  const props = {
    data,
    saveSettings: (settings: Row) =>
      safely(() => {
        validateRow('settings', settings);
        commit({ ...current.current, settings });
        setMessage('Configurações salvas com sucesso.');
      }),
    edit,
    update: (kind: Collection, row: Row) =>
      safely(() => {
        commit(upsert(current.current, kind, row));
        setUndo(null);
        setMessage('Associação salva. Os custos foram recalculados.');
      }),
    del: (kind: Collection, row: Row) => setDeletion({ kind, row }),
    go,
  };
  const titles: Record<string, string> = {
    Dashboard: 'Visão geral',
    Moto: 'Sua Honda XRE 190',
    Manutenção: 'Manutenção da XRE 190 2025',
  };
  const primary: Partial<Record<string, Collection>> = {
    Dashboard: 'work',
    Trabalho: 'work',
    Dívidas: 'debts',
    Manutenção: 'services',
    Gastos: 'expenses',
    Investimentos: 'movements',
    Planos: 'plans',
  };
  return (
    <SidebarProvider>
      <Sidebar>
        <SidebarHeader>
          <div className="brand">
            <span>R</span> Rota <b>financeira</b>
          </div>
        </SidebarHeader>
        <SidebarContent>
          <p className="nav-label">SEU CENTRO DE CONTROLE</p>
          <Nav page={page} go={go} />
        </SidebarContent>
        <SidebarFooter>
          <div className="local-status">● Dados neste navegador</div>
          <small>
            {data.bike.brand} {data.bike.model} · {data.bike.year}
          </small>
        </SidebarFooter>
      </Sidebar>
      <SidebarInset>
        <header className="topbar">
          <div>
            <SidebarTrigger aria-label="Abrir menu" />
            <GlobalSearch data={data} go={go} />
            <span>Pessoal / {page}</span>
          </div>
          <div>
            <span className="header-date">{brDate(today())}</span>
            <button
              aria-label="Alternar tema"
              onClick={() =>
                safely(() =>
                  commit({
                    ...data,
                    settings: {
                      ...data.settings,
                      theme:
                        data.settings.theme === 'escuro' ? 'claro' : 'escuro',
                    },
                  }),
                )
              }
            >
              {data.settings.theme === 'escuro' ? (
                <Sun size={17} />
              ) : (
                <Moon size={17} />
              )}
            </button>
            <span className="badge">LOCAL</span>
          </div>
        </header>
        <main className="workspace">
          <div className="page-heading">
            <div>
              <p className="eyebrow">SUAS FINANÇAS, NA DIREÇÃO CERTA</p>
              <h1>{titles[page] || page}</h1>
              <p>
                {page === 'Dashboard'
                  ? 'Seu dinheiro e sua XRE, no mesmo lugar.'
                  : 'Organize, acompanhe e ajuste seus registros.'}
              </p>
            </div>
            {primary[page] && (
              <button className="primary" onClick={() => edit(primary[page]!)}>
                <Plus size={18} />
                {page === 'Dashboard' || page === 'Trabalho'
                  ? 'Registrar trabalho'
                  : 'Adicionar registro'}
              </button>
            )}
          </div>
          {error && (
            <div className="notice error" role="alert">
              {error}
              {blocked && (
                <button
                  onClick={() =>
                    safely(() =>
                      download(
                        localStorage.getItem(STORAGE_KEY) ||
                          localStorage.getItem('rota-financeira') ||
                          '',
                        'rota-dados-recuperacao.json',
                      ),
                    )
                  }
                >
                  <Download size={16} /> Baixar dados preservados
                </button>
              )}
              <button onClick={() => setError('')}>Fechar aviso</button>
            </div>
          )}
          {blocked ? (
            <div className="card">
              <p>
                Importe um backup válido para recuperar o acesso. A cópia atual
                será preservada antes da substituição.
              </p>
              <label className="file-button">
                Selecionar backup de recuperação
                <input
                  aria-label="Backup de recuperação"
                  type="file"
                  accept=".json"
                  onChange={async (e) => {
                    try {
                      const file = e.target.files?.[0];
                      if (file) setIncoming(parseBackup(await file.text()));
                    } catch (e) {
                      setError((e as Error).message);
                    }
                  }}
                />
              </label>
              <button
                onClick={() =>
                  safely(() => {
                    const text = localStorage.getItem('rota-recovery');
                    if (!text)
                      throw Error('Nenhum backup automático disponível.');
                    setIncoming(parseBackup(text));
                  })
                }
              >
                Recuperar último backup automático
              </button>
            </div>
          ) : (
            <>
              {page === 'Dashboard' && <Dashboard {...props} />}{' '}
              {page === 'Trabalho' && <Work {...props} />}{' '}
              {page === 'Dívidas' && <Debts {...props} />}{' '}
              {page === 'Moto' && <Motorcycle {...props} />}{' '}
              {page === 'Manutenção' && <Maintenance {...props} />}{' '}
              {page === 'Gastos' && <Expenses {...props} />}{' '}
              {page === 'Investimentos' && <Investments {...props} />}{' '}
              {page === 'Planos' && <Plans {...props} />}{' '}
              {page === 'Análises' && <Analysis {...props} />}{' '}
              {page === 'Configurações' && (
                <SettingsView
                  data={data}
                  edit={edit}
                  onSaveSettings={(settings) =>
                    safely(() => {
                      validateRow('settings', settings);
                      commit({ ...current.current, settings });
                      setMessage('Configurações salvas com sucesso.');
                    })
                  }
                  onExport={() => safely(exportBackup)}
                  onImport={async (file) => {
                    try {
                      if (file.size > 20_000_000)
                        throw Error('Arquivo maior que 20 MB.');
                      setIncoming(parseBackup(await file.text()));
                    } catch (e) {
                      setError((e as Error).message);
                    }
                  }}
                  onRecovery={() =>
                    safely(() => {
                      const text = localStorage.getItem('rota-recovery');
                      if (!text)
                        throw Error('Nenhum backup automático disponível.');
                      setIncoming(parseBackup(text));
                    })
                  }
                  onReset={(kind) => {
                    setReset(kind as ResetKind);
                    setResetText('');
                  }}
                />
              )}
            </>
          )}
          <footer className="page-footer">
            Rota financeira{' '}
            <span>
              Real = registrado · Estimado = cálculo · Projetado = cenário
            </span>
          </footer>
        </main>
      </SidebarInset>
      <MobileNav page={page} go={go} />
      {editor && (
        <Editor
          key={editor.kind + (editor.row?.id || 'new')}
          kind={editor.kind}
          row={editor.row}
          data={data}
          onClose={() => setEditor(null)}
          onSave={(row) => {
            const kind = editor.kind;
            validateRow(kind, row);
            commit(
              kind === 'settings' || kind === 'bike'
                ? { ...data, [kind]: row }
                : upsert(data, kind, row),
            );
            setEditor(null);
            setUndo(null);
            setMessage('Registro salvo. Os totais foram atualizados.');
          }}
        />
      )}
      <AlertDialog
        open={!!deletion}
        onOpenChange={(o) => !o && setDeletion(null)}
      >
        <AlertDialogContent>
          <AlertDialogTitle>Excluir registro?</AlertDialogTitle>
          <AlertDialogDescription>
            {deletion &&
            ['debts', 'investments', 'maintenance', 'plans'].includes(
              deletion.kind,
            )
              ? 'Os movimentos vinculados também serão excluídos e os totais recalculados.'
              : 'O registro será removido e os totais recalculados.'}{' '}
            Você poderá desfazer até a próxima alteração.
          </AlertDialogDescription>
          <div className="form-actions">
            <button onClick={() => setDeletion(null)}>Cancelar</button>
            <button
              className="danger"
              onClick={() =>
                safely(() => {
                  if (!deletion) return;
                  const before = data;
                  commit(remove(data, deletion.kind, deletion.row.id));
                  setUndo(before);
                  setDeletion(null);
                  setMessage('Registro excluído.');
                })
              }
            >
              Confirmar exclusão
            </button>
          </div>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog open={!!reset} onOpenChange={(o) => !o && setReset(null)}>
        <AlertDialogContent>
          <AlertDialogTitle>
            {reset === 'total' ? 'RESET TOTAL' : 'Confirmar limpeza'}
          </AlertDialogTitle>
          <AlertDialogDescription>
            Esta ação remove os dados selecionados. Uma cópia de recuperação
            será salva antes de continuar.
            {reset === 'total'
              ? ' Um backup JSON também será baixado. Digite RESET para confirmar.'
              : ''}
          </AlertDialogDescription>
          {reset === 'total' && (
            <input
              aria-label="Digite RESET"
              value={resetText}
              onChange={(e) => setResetText(e.target.value)}
              autoComplete="off"
            />
          )}
          <div className="form-actions">
            <button onClick={() => setReset(null)}>Cancelar</button>
            <button
              className="danger"
              disabled={reset === 'total' && resetText !== 'RESET'}
              onClick={() =>
                safely(() => {
                  if (!reset) return;
                  recovery();
                  if (reset === 'total') exportBackup();
                  commit(resetData(data, reset));
                  setReset(null);
                  setUndo(null);
                  setMessage('Dados limpos. Backup de recuperação preservado.');
                })
              }
            >
              Confirmar reset
            </button>
          </div>
        </AlertDialogContent>
      </AlertDialog>
      <Dialog open={!!incoming} onOpenChange={(o) => !o && setIncoming(null)}>
        <DialogContent className="editor-dialog">
          <DialogTitle>Importar backup</DialogTitle>
          <DialogDescription>
            Os dados abaixo substituirão os atuais. Uma cópia dos dados atuais
            será salva e baixada antes da importação.
          </DialogDescription>
          {incoming && (
            <div className="import-summary">
              {collections.map((k) => (
                <div key={k}>
                  <span>{labels[k]}</span>
                  <b>{incoming[k].length}</b>
                </div>
              ))}
            </div>
          )}
          <div className="form-actions">
            <button onClick={() => setIncoming(null)}>Cancelar</button>
            <button
              className="primary"
              onClick={() =>
                safely(() => {
                  if (!incoming) return;
                  if (blocked) {
                    const raw =
                      localStorage.getItem(STORAGE_KEY) ||
                      localStorage.getItem('rota-financeira') ||
                      '';
                    localStorage.setItem('rota-corrupted-recovery', raw);
                    download(raw, 'rota-dados-preservados.json');
                    save(localStorage, incoming);
                    disk.current = JSON.stringify(incoming);
                    setData(incoming);
                    setBlocked(false);
                    setError('');
                  } else {
                    recovery();
                    exportBackup();
                    commit(incoming);
                  }
                  setIncoming(null);
                  setUndo(null);
                  setMessage('Backup importado com sucesso.');
                })
              }
            >
              Confirmar importação
            </button>
          </div>
        </DialogContent>
      </Dialog>
      {message && (
        <output className="toast">
          <span>{message}</span>
          {undo && (
            <button
              onClick={() =>
                safely(() => {
                  commit(undo);
                  setUndo(null);
                  setMessage('Exclusão desfeita.');
                })
              }
            >
              Desfazer
            </button>
          )}
          <button
            aria-label="Fechar notificação"
            onClick={() => setMessage('')}
          >
            ×
          </button>
        </output>
      )}
    </SidebarProvider>
  );
}
