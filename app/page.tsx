import { startupHealth, recoveryCopy } from '../src/services/recovery';
import { withWriteLock, observeChanges, publishChange } from '../src/services/tab-coordination';
import { restoredOpenFinance } from '../src/services/open-finance/state';
import { inspectBackup } from '../src/services/emergency-backup';
import { recordDiagnostic } from '../src/services/app-diagnostics';
import { useLocalNotifications } from '../src/hooks/use-local-notifications';
import { PageSkeleton, PageHeader, Feedback } from '../src/components/finance-ui';
import { BrandLogo } from '../src/components/brand-logo';
import { ProfileMenu } from '../src/components/profile';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { GlobalSearch } from '../src/components/global-search';
import { PrivacyToggle, useValuePrivacy } from '../src/components/value-privacy';
import { storageFailure } from '../src/services/storage-quota';
import { PageBoundary } from '../src/components/page-boundary';
import { MONEY_SCHEMA_VERSION } from '../src/services/money-codec';
import { lazy, Suspense, useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { useAuth } from '../src/components/auth-provider';
import { AuthForm, AccountPanel } from '../src/components/account';
import { useCloudSync } from '../src/hooks/use-cloud-sync';
import { OWNER_KEY, recoveryKey } from '../src/services/sync-core';
import { Plus, Sun, Moon, Download, ChevronRight, CircleCheck } from 'lucide-react';
import {
  SidebarProvider,
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarFooter,
  SidebarTrigger,
  SidebarInset,
} from '@/components/ui/sidebar';
import { DesktopNavigation, MobileNavigation, pageNames } from '../src/components/app-navigation';
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
const Dashboard = lazy(() => import('../src/pages/dashboard').then(m => ({ default: m.Dashboard })));
const Transactions = lazy(() => import('../src/pages/transactions').then(m => ({ default: m.Transactions })));
const Accounts = lazy(() => import('../src/pages/accounts').then(m => ({ default: m.Accounts })));
const Budgets = lazy(() => import('../src/pages/budgets').then(m => ({ default: m.Budgets })));
import { updateBikeAsset } from '../src/services/assets';
const Assistant = lazy(() => import('../src/pages/assistant').then(m => ({default:m.Assistant})));
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
  assertSupportedVersion,
  type ResetKind,
} from '../src/services/storage';
import { financial, targets, costs } from '../src/calculations';
import { isOpenFinanceCallbackPath } from '../src/services/open-finance/widget';
export default function Home() {
  const { hidden } = useValuePrivacy();
  const openFinanceCallback = isOpenFinanceCallbackPath(window.location.pathname);
  const auth = useAuth();
  const pendingWrites = useRef(0);
  const [saving, setSaving] = useState(false);
  const protectPendingWrite = useCallback((event: BeforeUnloadEvent) => { if (pendingWrites.current) event.preventDefault(); }, []);
  useEffect(() => () => window.removeEventListener('beforeunload', protectPendingWrite), [protectPendingWrite]);
  const [incomingInfo, setIncomingInfo] = useState<Awaited<ReturnType<typeof inspectBackup>>>();
  const [stale, setStale] = useState(false);
  const [showLogin, setShowLogin] = useState(false);
  const [data, setData] = useState<Data>(defaults),
    [page, setPage] = useState<string>(() => {
      const requested = new URLSearchParams(location.search).get('view');
      return openFinanceCallback ? 'Configurações' : pageNames.find(name => name === requested) || 'Hoje';
    }),
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
  const diskOwner = useRef<string | null>(null);
  const disk = useRef<string | null>(null),
    current = useRef(data);
  const applyCloud = useCallback((next: Data) => {
    setStale(false);
    disk.current = localStorage.getItem(STORAGE_KEY);
    diskOwner.current = localStorage.getItem(OWNER_KEY);
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
    !!editor || stale,
  );
  useEffect(() => {
    current.current = data;
  }, [data]);
  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      void withWriteLock(() => {
      if (!active) return;
      try {
        let d = startupHealth(localStorage);
        const storedData = localStorage.getItem(STORAGE_KEY);
        if ((storedData && JSON.parse(storedData).dataVersion !== MONEY_SCHEMA_VERSION) || (!storedData && localStorage.getItem('rota-financeira'))) {
          d = save(localStorage, d);
          publishChange('migrationdone');
        }
        disk.current = localStorage.getItem(STORAGE_KEY);
        diskOwner.current = localStorage.getItem(OWNER_KEY);
        setData(d);
      } catch (e) {
        setError(
          'Não foi possível carregar os dados. O conteúdo existente foi preservado; abra a recuperação para continuar.',
        );
        recordDiagnostic('storage', e);
        setBlocked(true);
      }
      setReady(true);
      }).catch(e => { if (active) { recordDiagnostic('storage', e); setBlocked(true); setError('Armazenamento indisponível. Abra a recuperação.'); setReady(true); } });
    });
    const notify = () => {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw !== disk.current || localStorage.getItem(OWNER_KEY) !== diskOwner.current) {
          setStale(true);
          if (raw) assertSupportedVersion(JSON.parse(raw));
        }
      }
      catch (e) { recordDiagnostic('storage', e); setStale(true); setError(storageFailure(e)); }
    };
    const stored = (event: StorageEvent) => {
      if (event.key === OWNER_KEY || event.key === STORAGE_KEY) notify();
    };
    const stop = observeChanges(notify);
    window.addEventListener('storage', stored);
    return () => { active = false; window.removeEventListener('storage', stored); stop(); };
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
  async function commit(next: Data, beforeWrite?: () => void) {
    const expected = disk.current;
    const expectedOwner = diskOwner.current;
    pendingWrites.current++; setSaving(true);
    window.addEventListener('beforeunload', protectPendingWrite);
    try { await withWriteLock(() => {
    if (localStorage.getItem(OWNER_KEY) !== expectedOwner) throw Error('A conta mudou em outra aba. Recarregue antes de salvar.');
    if (
      auth.session &&
      localStorage.getItem(OWNER_KEY) !== auth.session.user.id
    )
      throw Error('A conta mudou em outra aba. Recarregue antes de salvar.');
    if (blocked) throw Error('Recupere seus dados antes de salvar.');
    if (localStorage.getItem(STORAGE_KEY) !== expected)
      throw Error('Os dados mudaram em outra aba. Recarregue antes de salvar.');
    validateRelations(next);
    beforeWrite?.();
    next = save(localStorage, next);
    disk.current = localStorage.getItem(STORAGE_KEY) || '';
    setData(next);
    current.current = next;
    cloud.changed();
    publishChange('statechanged');
    setError('');
    }); } finally { pendingWrites.current--; setSaving(pendingWrites.current > 0); if (!pendingWrites.current) window.removeEventListener('beforeunload', protectPendingWrite); }
  }
  async function safely(action: () => void | Promise<void>) {
    try {
      await action();
    } catch (e) {
      recordDiagnostic('storage', e);
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
  const go = useCallback((p: string) => {
    if (!pageNames.some(name => name === p)) return;
    setPage(p);
    const url = new URL(location.href);
    url.searchParams.set('view', p);
    history.pushState(null, '', url.pathname + url.search + url.hash);
    window.scrollTo({ top: 0 });
  }, []);
  useEffect(() => {
    const pop = () => {
      const requested = new URLSearchParams(location.search).get('view');
      setPage(pageNames.find(name => name === requested) || 'Hoje');
      window.scrollTo({ top: 0 });
    };
    window.addEventListener('popstate', pop);
    return () => window.removeEventListener('popstate', pop);
  }, []);
  const notificationOwner = auth.session?.user.id || "guest";
  useEffect(() => {
    document.title = `${page} · Rota Financeira`;
  }, [page]);
  useEffect(() => {
    const quick = (event: KeyboardEvent) => {
      const target = event.target;
      if (event.key.toLowerCase() !== 'n' || event.ctrlKey || event.metaKey || event.altKey || event.repeat || editor || blocked) return;
      if (target instanceof HTMLElement && (target.closest('input, textarea, select, [contenteditable="true"], [role="dialog"]'))) return;
      event.preventDefault();
      setEditor({ kind: 'expenses' });
    };
    window.addEventListener('keydown', quick);
    return () => window.removeEventListener('keydown', quick);
  }, [editor, blocked]);
  const notificationDiagnostic = useLocalNotifications(data, notificationOwner, ready && !auth.loading && !blocked && !cloud.pending, go);
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
    return <PageSkeleton />;
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
              ? 'Seus dados foram alterados em outro dispositivo. Escolha qual conjunto completo deseja manter. Os dados não serão mesclados.'
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
          <PageSkeleton />
          <Feedback tone="sync" title="Preparando os dados da sua conta" announce>
            {cloud.status}
          </Feedback>
          {error && <Feedback tone="error" announce>{error}</Feedback>}
          {!auth.recovery && <button onClick={cancelAccount}>Continuar sem conta</button>}
        </div>
        {accountUi}
      </>
    );
  const props = {
    data,
    saveSettings: (settings: Row) =>
      safely(async () => {
        validateRow('settings', settings);
        await commit({ ...current.current, settings });
        setMessage('Configurações salvas com sucesso.');
      }),
    edit,
    update: (kind: Collection, row: Row) =>
      safely(async () => {
        await commit(upsert(current.current, kind, row));
        setUndo(null);
        setMessage('Associação salva. Os custos foram recalculados.');
      }),
    del: (kind: Collection, row: Row) => setDeletion({ kind, row }),
    go,
  };
  return (
    <SidebarProvider defaultOpen={!window.matchMedia('(max-width: 1023px)').matches && !document.cookie.split('; ').includes('sidebar_state=false')} style={{ '--sidebar-width': '15.5rem', '--sidebar-width-icon': '4.5rem' } as CSSProperties}>
      <a className="skip-link" href="#main-content" onClick={(event) => { event.preventDefault(); document.getElementById('main-content')?.focus(); }}>Pular para o conteúdo</a>
      <Sidebar collapsible="icon">
        <SidebarHeader>
          <div className="sidebar-brand"><BrandLogo/><SidebarTrigger className="sidebar-close" aria-label="Fechar menu" /></div>
        </SidebarHeader>
        <SidebarContent>

          <DesktopNavigation page={page} go={go} />
        </SidebarContent>
        <SidebarFooter>
          <div className="local-status"><CircleCheck size={16} aria-hidden="true"/><output>{cloud.status}</output></div>
          <small className="sidebar-version">Rota Financeira · 2.0</small>
        </SidebarFooter>
      </Sidebar>
      <SidebarInset>
        <header className="topbar">
          <div>
            <SidebarTrigger aria-label="Abrir menu" />
            <div className="topbar-breadcrumb"><span>Meu espaço</span><ChevronRight size={14} aria-hidden="true"/><span className="topbar-context">{page}</span></div>
          </div>
          <div>

            <GlobalSearch data={data} go={go} edit={edit} />
            <PrivacyToggle />
            <DropdownMenu><DropdownMenuTrigger className="primary quick-add-trigger"><Plus size={16} aria-hidden="true" /> Novo</DropdownMenuTrigger><DropdownMenuContent align="end">
  <DropdownMenuItem onClick={() => edit('work')}>Trabalho</DropdownMenuItem>
  <DropdownMenuItem onClick={() => edit('expenses')}>Gasto</DropdownMenuItem>
  <DropdownMenuItem onClick={() => { if (data.debts.length) edit('payments', { ...emptyRow('payments'), id: id(), debtId: data.debts[0].id, date: today(), amount: 0, installments: 0, kind: 'normal' }); else go('Dívidas'); }}>Pagamento</DropdownMenuItem>
  <DropdownMenuItem onClick={() => edit('movements')}>Aporte</DropdownMenuItem>
  <DropdownMenuItem onClick={() => edit('services')}>Manutenção</DropdownMenuItem>
</DropdownMenuContent></DropdownMenu>
            <button
              className="theme-toggle"
              aria-label={data.settings.theme === 'escuro' ? 'Ativar tema claro' : 'Ativar tema escuro'}
              onClick={() =>
                safely(async () =>
                  await commit({
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
                <Sun size={17} aria-hidden="true" />
              ) : (
                <Moon size={17} aria-hidden="true" />
              )}
            </button>
            <div className="account-status" title={cloud.status}><ProfileMenu data={data} syncStatus={cloud.status} onSaveSettings={props.saveSettings} go={go} login={() => setShowLogin(true)} onSignOut={cancelAccount}/></div>
          </div>
        </header>
        <main id="main-content" tabIndex={-1} className="workspace" data-page={page} data-private={hidden} aria-busy={saving}>
          {saving && <Feedback tone="loading" announce>Salvando neste dispositivo…</Feedback>}
          {stale && <Feedback tone="warning" announce>Dados atualizados em outra aba. Sua edição foi preservada. Feche o formulário para atualizar.
            <button disabled={!!editor} onClick={() => safely(() => { if (auth.session && localStorage.getItem(OWNER_KEY) !== auth.session.user.id) { window.location.reload(); return; } applyCloud(load(localStorage)); setStale(false); })}>Atualizar dados</button>
          </Feedback>}
          {error && (
            <Feedback tone="error" title="Não foi possível concluir" announce>
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
            </Feedback>
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
                      if (file) { if (file.size > 20_000_000) throw Error('Arquivo maior que 20 MB.'); const inspected = await inspectBackup(await file.text()); setIncoming(inspected.data); setIncomingInfo(inspected); }
                    } catch (e) {
                      setError((e as Error).message);
                    }
                  }}
                />
              </label>
              <button onClick={() => { window.location.hash = 'recovery'; window.location.reload(); }}>Abrir modo de recuperação</button>
              <button onClick={() => safely(() => { const copy = recoveryCopy(localStorage); if (!copy) throw Error('Nenhuma cópia válida disponível.'); setIncoming(copy); })}>Restaurar cópia anterior</button>
              <button
                onClick={() =>
                  safely(async () => {
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
                <PageHeader title="Configurações" description="Preferências, conexões e dados. Tudo sob seu controle." />
              )}
              <PageBoundary key={page} back={() => go('Configurações')}><div className="page-transition"><Suspense fallback={<PageSkeleton />}>
              {page === 'Alertas' && <Alerts data={data} go={go} appError={!!error} />}
              {page === 'Auditoria' && <FinancialAudit data={data} go={go} />}
              {page === 'Assistente' && <Assistant data={data} />}
              {page === 'Minha Situação' && <MySituation data={data} go={go} />}
              {page === 'Hoje' && <Today {...props} />}
              {page === 'Planejamento' && <Planning {...props} />}
              {page === 'Patrimônio' && <NetWorth {...props} />}
              {page === 'Simulações' && <Simulations {...props} />}
              {page === 'Importar' && <Imports {...props} commitImport={async (next, expected) => { if (current.current !== expected) throw Error('Dados alterados. Revise novamente.'); await commit(next); }} />}
              {page === 'Dashboard' && <Dashboard {...props} />}{' '}
              {page === 'Transações' && <Transactions {...props} />}
              {page === 'Orçamentos' && <Budgets {...props} />}
              {page === 'Contas' && <Accounts data={data} owner={notificationOwner} onSave={async (next, base) => { if (current.current !== base) throw Error('Os dados mudaram. Revise novamente antes de salvar.'); await commit(next); }}/ >}
              {page === 'Trabalho' && <Work {...props} />}{' '}
              {page === 'Dívidas' && <Debts {...props} />}{' '}
              {page === 'Moto' && <Motorcycle {...props} />}{' '}
              {page === 'Manutenção' && <Maintenance {...props} />}{' '}
              {page === 'Gastos' && <Expenses {...props} />}{' '}
              {page === 'Investimentos' && <Investments {...props} />}{' '}
              {page === 'Planos' && <Plans {...props} />}{' '}
              {page === 'Relatórios' && <Reports data={data} go={go} commitReport={async (next, expected) => { if (current.current !== expected) throw Error('Dados alterados. Revise o fechamento novamente.'); await commit(next); }} />}
              {page === 'Análises' && <Analysis {...props} />}{' '}
              {page === 'Configurações' && (
                <SettingsView
                  accountPanel={<AccountPanel status={cloud.status} lastSync={cloud.lastSync} login={() => setShowLogin(true)} sync={() => { void cloud.synchronize(); }} choose={(choice) => { void cloud.synchronize(choice); }} syncError={cloud.error}/>}
                  openFinanceOnLoad={openFinanceCallback}
                  data={data}
                  edit={edit}
                  syncStatus={cloud.status}
                  onSaveOpenFinance={async (next, base) => { if (current.current !== base) throw Error("Os dados mudaram. Revise novamente antes de salvar."); await commit(next); }}
                  notificationOwner={notificationOwner}
                  notificationDiagnostic={notificationDiagnostic}
                  onSaveNotifications={async (notificationPreferences) => { await commit({ ...current.current, notificationPreferences }); setMessage('Preferências de notificações salvas.'); }}
                  onSaveSettings={(settings) =>
                    safely(async () => {
                      validateRow('settings', settings);
                      await commit({ ...current.current, settings });
                      setMessage('Configurações salvas com sucesso.');
                    })
                  }
                  onExport={() => safely(exportBackup)}
                  onImport={async (file) => {
                    try {
                      if (file.size > 20_000_000)
                        throw Error('Arquivo maior que 20 MB.');
                      const inspected = await inspectBackup(await file.text()); setIncoming(inspected.data); setIncomingInfo(inspected);
                    } catch (e) {
                      setError((e as Error).message);
                    }
                  }}
                  onRecovery={() =>
                    safely(async () => {
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
              </Suspense></div></PageBoundary>
            </>
          )}
          <footer className="page-footer">
            Rota Financeira · 2.0{' '}
            <span>
              Real = registrado · Estimado = cálculo · Projetado = cenário
            </span>
          </footer>
        </main>
      </SidebarInset>
      <MobileNavigation page={page} go={go} add={() => edit('expenses')} />
      {accountUi}
      {editor && (
        <Editor
          key={editor.kind + (editor.row?.id || 'new')}
          kind={editor.kind}
          row={editor.row}
          data={data}
          onClose={() => setEditor(null)}
          onSave={async (row) => {
            const kind = editor.kind;
            validateRow(kind, row);
            await commit(
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
                safely(async () => {
                  if (!deletion) return;
                  const before = data;
                  await commit(remove(data, deletion.kind, deletion.row.id));
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
                safely(async () => {
                  if (!reset) return;
                  await commit(resetData(data, reset), () => { recovery(); if (reset === 'total') exportBackup(); });
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
          {incomingInfo?.data === incoming && <p>Versão original: {incomingInfo?.sourceVersion} · Gerado em: {incomingInfo?.generatedAt ? new Date(incomingInfo.generatedAt).toLocaleString('pt-BR') : 'Data não informada'}</p>}
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
                safely(async () => {
                  if (!incoming) return;
                  if (blocked) {
                    if (stale) throw Error('Os dados mudaram em outra aba. Revise a recuperação antes de continuar.');
                    const expected = localStorage.getItem(STORAGE_KEY);
                    const owner = localStorage.getItem(OWNER_KEY);
                    await withWriteLock(() => {
                    if (localStorage.getItem(STORAGE_KEY) !== expected || localStorage.getItem(OWNER_KEY) !== owner) throw Error('Os dados mudaram em outra aba. Revise a recuperação.');
                    const raw =
                      localStorage.getItem(STORAGE_KEY) ||
                      localStorage.getItem('rota-financeira') ||
                      '';
                    localStorage.setItem(`rota-corrupted-recovery:${localStorage.getItem(OWNER_KEY) || 'guest'}`, raw);
                    download(raw, 'rota-dados-preservados.json');
                    const restored = save(localStorage, incoming.openFinance ? {...incoming,openFinance:restoredOpenFinance(incoming.openFinance)} : incoming);
                    disk.current = localStorage.getItem(STORAGE_KEY) || '';
                    setData(restored);
                    setBlocked(false);
                    setError('');
                    });
                  } else {
                    await commit(incoming.openFinance ? {...incoming,openFinance:restoredOpenFinance(incoming.openFinance)} : incoming, () => { recovery(); exportBackup(); });
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
                safely(async () => {
                  await commit(undo);
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
