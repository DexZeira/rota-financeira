import { PageSkeleton, PageHeader, Disclosure } from '../src/components/finance-ui';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { GlobalSearch } from '../src/components/global-search';
import { storageFailure } from '../src/services/storage-quota';
import { PageBoundary } from '../src/components/page-boundary';
import { MONEY_SCHEMA_VERSION } from '../src/services/money-codec';
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../src/components/auth-provider';
import { AuthForm, AccountPanel } from '../src/components/account';
import { useCloudSync } from '../src/hooks/use-cloud-sync';
import { OWNER_KEY, recoveryKey } from '../src/services/sync-core';
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
  emptyRow,
  id,
  type Data,
  type Collection,
  type Row,
} from '../src/model';
import { Dashboard } from '../src/pages/dashboard';
import { updateBikeAsset } from '../src/services/assets';
const NetWorth = lazy(() => import('../src/pages/net-worth').then((m) => ({ default: m.NetWorth })));
const Simulations = lazy(() => import('../src/pages/simulations').then((m) => ({ default: m.Simulations })));
const Alerts = lazy(() => import('../src/pages/financial-health').then(m => ({default:m.Alerts})));
const FinancialAudit = lazy(() => import('../src/pages/financial-health').then(m => ({default:m.FinancialAudit})));
const MySituation = lazy(() => import('../src/pages/financial-health').then(m => ({default:m.MySituation})));
const Reports = lazy(() => import('../src/pages/reports').then(m => ({default:m.Reports})));
const Imports = lazy(() => import('../src/pages/imports').then((m) => ({ default: m.Imports })));
const Today = lazy(() => import('../src/pages/today').then((m) => ({ default: m.Today })));
const Planning = lazy(() => import('../src/pages/planning').then((m) => ({ default: m.Planning })));
const Work = lazy(() => import('../src/pages/work').then((m) => ({ default: m.Work })));
const Debts = lazy(() => import('../src/pages/debts').then((m) => ({ default: m.Debts })));
const Expenses = lazy(() => import('../src/pages/expenses').then((m) => ({ default: m.Expenses })));
const Motorcycle = lazy(() => import('../src/pages/motorcycle').then((m) => ({ default: m.Motorcycle })));
const Maintenance = lazy(() => import('../src/pages/maintenance').then((m) => ({ default: m.Maintenance })));
const Investments = lazy(() => import('../src/pages/investments').then((m) => ({ default: m.Investments })));
const Plans = lazy(() => import('../src/pages/plans').then((m) => ({ default: m.Plans })));
const Analysis = lazy(() => import('../src/pages/analysis').then((m) => ({ default: m.Analysis })));
const SettingsView = lazy(() => import('../src/pages/settings').then((m) => ({ default: m.SettingsView })));
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
  ['Hoje', LayoutDashboard],
  ['Planejamento', Wallet],
  ['Patrimônio', Wallet],
  ['Simulações', Wallet],
  ['Importar', Wallet],
  ['Dashboard', LayoutDashboard],
  ['Dívidas', Wallet],
  ['Trabalho', BriefcaseBusiness],
  ['Moto', Bike],
  ['Manutenção', Wrench],
  ['Gastos', Receipt],
  ['Investimentos', TrendingUp],
  ['Planos', Flag],
  ['Minha Situação', ChartNoAxesCombined],
  ['Alertas', ChartNoAxesCombined],
  ['Auditoria', ChartNoAxesCombined],
  ['Relatórios', ChartNoAxesCombined],
  ['Análises', ChartNoAxesCombined],
  ['Configurações', Settings],
] as const;
const navGroups = [
  { title: 'Principal', pages: ['Hoje', 'Dashboard', 'Trabalho', 'Gastos', 'Dívidas', 'Investimentos'] },
  { title: 'Planejamento', pages: ['Planejamento', 'Planos', 'Patrimônio', 'Simulações'] },
  { title: 'Veículo', pages: ['Moto', 'Manutenção'] },
  { title: 'Insights', pages: ['Minha Situação', 'Alertas', 'Auditoria', 'Análises', 'Relatórios'] },
  { title: 'Sistema', pages: ['Importar', 'Configurações'] },
];
function Nav({ page, go }: { page: string; go: (page: string) => void }) {
  const { setOpenMobile, isMobile } = useSidebar();
  return (
    <>
      {navGroups.map((group) => (
        <div className="nav-group" key={group.title}>
          <p>{group.title}</p>
          <SidebarMenu>
            {group.pages.filter((name) => !isMobile || !['Hoje', 'Trabalho', 'Gastos', 'Investimentos'].includes(name)).map((name) => {
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
      {[
        ['Hoje', 'Hoje'],
        ['Trabalho', 'Trabalho'],
        ['Gastos', 'Gastos'],
        ['Investimentos', 'Investimentos'],
      ].map(([name, label]) => {
        const entry = navigation.find(([n]) => n === name)!;
        const Icon = entry[1];
        return (
          <button
            key={name}
            aria-current={page === name ? 'page' : undefined}
            onClick={() => go(name)}
          >
            <Icon size={19} />
            <span>{label}</span>
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
  const auth = useAuth();
  const [showLogin, setShowLogin] = useState(false);
  const [data, setData] = useState<Data>(defaults),
    [page, setPage] = useState('Hoje'),
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
  const applyCloud = useCallback((next: Data) => {
    disk.current = localStorage.getItem(STORAGE_KEY);
    current.current = next;
    setData(next);
    setEditor(null);
    setUndo(null);
    setIncoming(null);
    setDeletion(null);
    setReset(null);
  }, []);
  const cloud = useCloudSync(
    auth.session?.user.id,
    ready && !auth.loading && !blocked,
    data,
    applyCloud,
  );
  useEffect(() => {
    current.current = data;
  }, [data]);
  useEffect(() => {
    queueMicrotask(() => {
      try {
        let d = load(localStorage);
        const storedData = localStorage.getItem(STORAGE_KEY);
        if ((storedData && JSON.parse(storedData).dataVersion !== MONEY_SCHEMA_VERSION) || (!storedData && localStorage.getItem('rota-financeira'))) {
          d = save(localStorage, d);
        }
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
    const stored = (event: StorageEvent) => {
      if (event.key === OWNER_KEY) {
        window.location.reload();
        return;
      }
      if (event.key !== STORAGE_KEY) return;
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
    if (
      auth.session &&
      localStorage.getItem(OWNER_KEY) !== auth.session.user.id
    )
      throw Error('A conta mudou em outra aba. Recarregue antes de salvar.');
    if (blocked) throw Error('Recupere seus dados antes de salvar.');
    if (localStorage.getItem(STORAGE_KEY) !== disk.current)
      throw Error('Os dados mudaram em outra aba. Recarregue antes de salvar.');
    validateRelations(next);
    next = save(localStorage, next);
    disk.current = localStorage.getItem(STORAGE_KEY) || '';
    setData(next);
    current.current = next;
    cloud.changed();
    setError('');
  }
  function safely(action: () => void) {
    try {
      action();
    } catch (e) {
      setError(storageFailure(e));
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
    localStorage.setItem(
      recoveryKey(localStorage.getItem(OWNER_KEY)),
      backup(data),
    );
  }
  function go(p: string) {
    setPage(p);
    window.scrollTo({ top: 0 });
  }
  function cancelAccount() {
    void auth.signOut().then(({ error: signOutError }) => {
      if (signOutError) setError('Não foi possível sair. Tente novamente.');
    }).catch(() => setError('Não foi possível sair. Tente novamente.'));
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
  if (!ready || auth.loading)
    return <output className="loading">Carregando seus dados…</output>;
  const accountUi = (
    <>
      {(showLogin || auth.recovery) && (
        <AuthForm close={() => setShowLogin(false)} />
      )}
      <Dialog open={!!cloud.conflict} onOpenChange={() => {}}>
        <DialogContent className="account-dialog">
          <DialogTitle>
            {cloud.conflict?.remote
              ? 'Dados diferentes encontrados'
              : 'Encontramos dados neste dispositivo'}
          </DialogTitle>
          <DialogDescription>
            {cloud.conflict?.remote
              ? 'Escolha qual conjunto completo deseja manter. Os dados não serão mesclados.'
              : 'Deseja salvar seus dados atuais na sua conta?'}
          </DialogDescription>
          <p>
            Este dispositivo · Última atualização:{' '}
            {cloud.conflict?.localUpdated
              ? new Date(cloud.conflict.localUpdated).toLocaleString('pt-BR')
              : 'Data anterior não registrada'}
          </p>
          <p>
            Nuvem · Última atualização:{' '}
            {cloud.conflict?.remote
              ? new Date(cloud.conflict.remote.updated_at).toLocaleString(
                  'pt-BR',
                )
              : 'Sem dados'}
          </p>
          <div className="form-actions">
            <button
              className="primary"
              onClick={() => {
                void cloud.synchronize('local');
              }}
            >
              {cloud.conflict?.remote
                ? 'Usar dados deste dispositivo'
                : 'Salvar na nuvem'}
            </button>
            <button
              onClick={() => {
                void cloud.synchronize(
                  cloud.conflict?.remote ? 'cloud' : 'empty',
                );
              }}
            >
              {cloud.conflict?.remote ? 'Usar dados da nuvem' : 'Começar vazio'}
            </button>
            <button
              onClick={() => {
                cancelAccount();
              }}
            >
              Cancelar
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
  if ((!blocked && cloud.pending) || auth.recovery)
    return (
      <>
        <div className="loading">
          <p>Preparando os dados da sua conta…</p>
          <output>{cloud.status}</output>
          {error && <p role="alert">{error}</p>}
          {!auth.recovery && <button onClick={cancelAccount}>Continuar sem conta</button>}
        </div>
        {accountUi}
      </>
    );
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
  return (
    <SidebarProvider>
      <Sidebar>
        <SidebarHeader>
          <div className="brand">
            <span>RF</span><div>Rota<b>Financeira</b></div>
          </div>
        </SidebarHeader>
        <SidebarContent>

          <Nav page={page} go={go} />
        </SidebarContent>
        <SidebarFooter>
          <div className="local-status">
            <output>{cloud.status}</output>
          </div>
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
            <span className="topbar-context">{page}</span>
          </div>
          <div>

            <DropdownMenu><DropdownMenuTrigger className="primary quick-add-trigger"><Plus size={16} /> Novo</DropdownMenuTrigger><DropdownMenuContent align="end">
  <DropdownMenuItem onClick={() => edit('work')}>Trabalho</DropdownMenuItem>
  <DropdownMenuItem onClick={() => edit('expenses')}>Gasto</DropdownMenuItem>
  <DropdownMenuItem onClick={() => { if (data.debts.length) edit('payments', { ...emptyRow('payments'), id: id(), debtId: data.debts[0].id, date: today(), amount: 0, installments: 0, kind: 'normal' }); else go('Dívidas'); }}>Pagamento</DropdownMenuItem>
  <DropdownMenuItem onClick={() => edit('movements')}>Aporte</DropdownMenuItem>
  <DropdownMenuItem onClick={() => edit('services')}>Manutenção</DropdownMenuItem>
</DropdownMenuContent></DropdownMenu>
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
            <button
              className="account-status"
              onClick={() =>
                auth.session ? go('Configurações') : setShowLogin(true)
              }
              title={cloud.status}
            >
              {auth.session ? auth.session.user.email : 'Entrar'}
            </button>
          </div>
        </header>
        <main className="workspace">
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
                    const text = localStorage.getItem(
                      recoveryKey(localStorage.getItem(OWNER_KEY)),
                    );
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
              {page === 'Configurações' && (
                <><PageHeader title="Configurações" description="Seu aplicativo, do seu jeito." /><Disclosure title="Conta e sincronização" description={cloud.status}><AccountPanel
                  status={cloud.status}
                  lastSync={cloud.lastSync}
                  login={() => setShowLogin(true)}
                  sync={() => {
                    void cloud.synchronize();
                  }}
                  choose={(choice) => {
                    void cloud.synchronize(choice);
                  }}
                  syncError={cloud.error}
                /></Disclosure></>
              )}
              <PageBoundary key={page}><Suspense fallback={<PageSkeleton />}>
              {page === 'Alertas' && <Alerts data={data} go={go} appError={!!error} />}
              {page === 'Auditoria' && <FinancialAudit data={data} go={go} />}
              {page === 'Minha Situação' && <MySituation data={data} go={go} />}
              {page === 'Hoje' && <Today {...props} />}
              {page === 'Planejamento' && <Planning {...props} />}
              {page === 'Patrimônio' && <NetWorth {...props} />}
              {page === 'Simulações' && <Simulations {...props} />}
              {page === 'Importar' && <Imports {...props} commitImport={(next, expected) => { if (current.current !== expected) throw Error('Dados alterados. Revise novamente.'); commit(next); }} />}
              {page === 'Dashboard' && <Dashboard {...props} />}{' '}
              {page === 'Trabalho' && <Work {...props} />}{' '}
              {page === 'Dívidas' && <Debts {...props} />}{' '}
              {page === 'Moto' && <Motorcycle {...props} />}{' '}
              {page === 'Manutenção' && <Maintenance {...props} />}{' '}
              {page === 'Gastos' && <Expenses {...props} />}{' '}
              {page === 'Investimentos' && <Investments {...props} />}{' '}
              {page === 'Planos' && <Plans {...props} />}{' '}
              {page === 'Relatórios' && <Reports data={data} go={go} commitReport={(next, expected) => { if (current.current !== expected) throw Error('Dados alterados. Revise o fechamento novamente.'); commit(next); }} />}
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
                      const text = localStorage.getItem(
                        recoveryKey(localStorage.getItem(OWNER_KEY)),
                      );
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
              </Suspense></PageBoundary>
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
      {accountUi}
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
                ? kind === 'bike' ? updateBikeAsset(data, row, today()) : { ...data, [kind]: row }
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
                    const restored = save(localStorage, incoming);
                    disk.current = localStorage.getItem(STORAGE_KEY) || '';
                    setData(restored);
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
