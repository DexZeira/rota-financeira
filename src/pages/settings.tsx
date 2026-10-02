import { ConnectedAccounts } from '../components/connected-accounts';
import { ManioConfiguration } from '../components/manio-configuration';
import { NotificationSettings } from '../components/notification-settings';
import { DataSecurity } from '../components/data-security';
import type { NotificationPreferences } from '../services/notification-preferences';
import { Disclosure } from '../components/finance-ui';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Field, FieldLabel } from '@/components/ui/field';
import { useIsMobile } from '@/hooks/use-mobile';
import { ProfileSettings } from '../components/profile';
import { StorageManager } from '../components/storage-manager';
import { MONEY_SCHEMA_VERSION } from '../services/money-codec';
import { backup } from '../services/storage';
import { downloadBackup } from '../services/backup-download';
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Bell,
  Check,
  ChevronDown,
  ChevronRight,
  Database,
  Landmark,
  Link2,
  Monitor,
  Moon,
  ShieldCheck,
  Sun,
  UserRound,
} from 'lucide-react';
import { Card, Choice, Fields } from '../components/common';
import { value as detail } from './shared';
import './settings.css';
import {
  type Data,
  type Row,
  type Collection,
  collections,
  money,
  num,
} from '../model';

const settingsSections = [
  { value: 'perfil', label: 'Perfil', icon: UserRound },
  { value: 'aparencia', label: 'Aparência', icon: Sun },
  { value: 'financas', label: 'Finanças', icon: Landmark },
  { value: 'integracoes', label: 'Integrações', icon: Link2 },
  { value: 'notificacoes', label: 'Notificações', icon: Bell },
  { value: 'dados', label: 'Dados', icon: Database },
  { value: 'seguranca', label: 'Segurança', icon: ShieldCheck },
];
function settingsSection() {
  const requested = new URLSearchParams(location.search).get('settings');
  return requested && settingsSections.some(({ value }) => value === requested)
    ? requested
    : 'perfil';
}

export function SettingsView({
  data: d,
  syncStatus,
  edit,
  onImport,
  onReset,
  onRecovery,
  onSaveOpenFinance,
  onSaveSettings,
  onSaveNotifications,
  notificationOwner,
  notificationDiagnostic,
  openFinanceOnLoad = false,
  accountPanel,
}: {
  data: Data;
  onSaveOpenFinance: (next: Data, base: Data) => Promise<void>;
  syncStatus: string;
  onSaveNotifications: (p: NotificationPreferences) => void | Promise<void>;
  notificationOwner: string;
  notificationDiagnostic: string;
  edit: (kind: Collection | 'settings' | 'bike', row?: Row) => void;
  onSaveSettings: (settings: Row) => void;
  onExport: () => void;
  onImport: (file: File) => void;
  onReset: (kind: string) => void;
  onRecovery: () => void;
  openFinanceOnLoad?: boolean;
  accountPanel?: ReactNode;
}) {
  const isMobile = useIsMobile();
  const navigationId = useId();
  const pickerRef = useRef<HTMLButtonElement>(null);
  const navigationRef = useRef<HTMLDivElement>(null);
  const [sectionsOpen, setSectionsOpen] = useState(false);
  const [section, setSection] = useState(() =>
    openFinanceOnLoad ? 'integracoes' : settingsSection(),
  );
  const activeSection =
    settingsSections.find(({ value }) => value === section) ||
    settingsSections[0];
  useEffect(() => {
    if (isMobile && sectionsOpen)
      navigationRef.current
        ?.querySelector<HTMLElement>('[aria-selected="true"]')
        ?.focus();
  }, [isMobile, sectionsOpen]);
  const closeSections = () => {
    if (isMobile) {
      setSectionsOpen(false);
      pickerRef.current?.focus();
    }
  };
  useEffect(() => {
    const restoreSection = () => setSection(settingsSection());
    window.addEventListener('popstate', restoreSection);
    return () => window.removeEventListener('popstate', restoreSection);
  }, []);
  const [lastBackup, setLastBackup] = useState<string | null>(() => {
    try {
      return localStorage.getItem('rota-financeira-last-backup');
    } catch {
      return null;
    }
  });
  const markBackup = () => {
    const time = new Date().toISOString();
    setLastBackup(time);
    try {
      localStorage.setItem('rota-financeira-last-backup', time);
    } catch {}
  };
  const [copyStatus, setCopyStatus] = useState('');
  const [downloadStatus, setDownloadStatus] = useState('');
  const [settings, setSettings] = useState<Row>({
    id: 'settings',
    defaultTarget: d.settings.defaultTarget ?? 'ideal',
    idealTargetPercent: num(d.settings.idealTargetPercent ?? 20),
    acceleratedTargetPercent: num(d.settings.acceleratedTargetPercent ?? 40),
  });
  const saveSettings = () => {
    const next = { ...d, settings: { ...d.settings, ...settings } };
    onSaveSettings(next.settings);
  };
  const persistOpenFinance = async (next: Data, base: Data) => {
    await onSaveOpenFinance(next, base);
  };
  return (
    <Tabs
      className="settings-layout"
      orientation="vertical"
      value={section}
      onValueChange={(value) => {
        setSection(String(value));
        const url = new URL(location.href);
        url.searchParams.set('settings', String(value));
        history.replaceState(null, '', url.pathname + url.search + url.hash);
      }}
    >
      <div className="settings-nav-area">
        {isMobile && (
          <button
            type="button"
            className="settings-section-picker"
            ref={pickerRef}
            aria-label="Seções de configurações"
            aria-describedby={`${navigationId}-current`}
            aria-expanded={sectionsOpen}
            aria-controls={navigationId}
            onClick={() => setSectionsOpen((open) => !open)}
          >
            <span>
              <span>Seções de configurações</span>
              <strong id={`${navigationId}-current`}>
                {activeSection.label}
              </strong>
            </span>
            <ChevronDown size={18} aria-hidden="true" />
          </button>
        )}
        <TabsList
          id={navigationId}
          ref={navigationRef}
          className="settings-navigation"
          aria-label="Seções de configurações"
          hidden={isMobile && !sectionsOpen}
          activateOnFocus={false}
          onKeyDown={(event) => {
            if (isMobile && event.key === 'Escape') {
              event.preventDefault();
              closeSections();
            }
          }}
        >
          {settingsSections.map(({ value, label, icon: Icon }) => (
            <TabsTrigger key={value} value={value} onClick={closeSections}>
              <Icon aria-hidden="true" /> {label}
              <ChevronRight
                className="settings-drill-chevron"
                aria-hidden="true"
              />
            </TabsTrigger>
          ))}
        </TabsList>
      </div>
      <div className="settings-content">
        <TabsContent value="perfil" keepMounted>
          <div className="settings-section-heading">
            <h2>Seu perfil</h2>
            <p>Uma identidade para a sua rota financeira.</p>
          </div>
          <ProfileSettings
            key={`${notificationOwner}:${d.settings.profileName || ''}`}
            data={d}
            onSaveSettings={onSaveSettings}
          />
          {accountPanel}
        </TabsContent>
        <TabsContent value="aparencia" keepMounted>
          <div className="settings-section-heading">
            <h2>Aparência</h2>
            <p>
              Escolha o ambiente em que você prefere organizar suas finanças.
            </p>
          </div>
          <fieldset className="theme-choices" aria-label="Tema do aplicativo">
            {(
              [
                ['claro', 'Claro', Sun],
                ['escuro', 'Escuro', Moon],
                ['sistema', 'Sistema', Monitor],
              ] as const
            ).map(([theme, label, Icon]) => (
              <button
                key={theme}
                className="theme-choice"
                aria-pressed={d.settings.theme === theme}
                onClick={() => onSaveSettings({ ...d.settings, theme })}
              >
                <span
                  className={`theme-preview theme-preview-${theme}`}
                  aria-hidden="true"
                >
                  <span />
                  <span>
                    <i />
                    <i />
                    <i />
                  </span>
                </span>
                <span className="theme-choice-label">
                  <Icon size={16} /> {label}
                  {d.settings.theme === theme && <Check size={16} />}
                </span>
              </button>
            ))}
          </fieldset>
          <p className="inline-note">
            O modo Sistema acompanha a preferência de aparência do seu
            dispositivo.
          </p>
        </TabsContent>
        <TabsContent value="integracoes" keepMounted>
          <div className="settings-section-heading">
            <h2>Integrações</h2>
            <p>Conecte suas fontes e revise o que entra no seu planejamento.</p>
          </div>
          <ManioConfiguration
            key={'manio-' + notificationOwner}
            data={d}
            owner={notificationOwner}
            onSave={persistOpenFinance}
          />
          <ConnectedAccounts
            key={notificationOwner}
            data={d}
            owner={notificationOwner}
            onSave={persistOpenFinance}
            resumeAuthorization={openFinanceOnLoad}
          />
        </TabsContent>
        <TabsContent value="notificacoes" keepMounted>
          <div className="settings-section-heading">
            <h2>Notificações</h2>
            <p>Você escolhe quais lembretes receber, e quando.</p>
          </div>
          <NotificationSettings
            key={JSON.stringify(d.notificationPreferences) + notificationOwner}
            preferences={d.notificationPreferences}
            owner={notificationOwner}
            onSave={onSaveNotifications}
            diagnostic={notificationDiagnostic}
          />
        </TabsContent>
        <TabsContent value="financas" keepMounted>
          <div className="settings-section-heading">
            <h2>Finanças e planejamento</h2>
            <p>Ajuste sua rotina e as margens das suas metas.</p>
          </div>
          <Card
            title="Seu planejamento"
            action={
              <button onClick={() => edit('settings', d.settings)}>
                Editar configurações
              </button>
            }
          >
            <div className="four-stats">
              {detail('Saldo inicial', money(num(d.settings.openingCash)))}
              {detail('Dias / mês', String(d.settings.workDays))}
              {detail('Horas / dia', String(d.settings.hoursDay))}
              {detail('KM / dia', String(d.settings.kmDay))}
              {detail(
                'Custo essencial / mês',
                money(num(d.settings.essential)),
              )}
              {detail('Líquido desejado / dia', money(num(d.settings.netDay)))}
              {detail('Extra dívidas / mês', money(num(d.settings.extra)))}
              {detail('Extra planos / mês', money(num(d.settings.extraPlans)))}
              {detail(
                'Extra investimentos / mês',
                money(num(d.settings.extraInvestments)),
              )}
              {detail(
                'Investimentos planejados / mês',
                money(num(d.settings.reserveMonth)),
              )}
            </div>
            <p className="inline-note">
              Metas usam obrigações e margens configuradas sobre a Mínima, sem
              depreciação. Veja os valores e abatimentos na composição do
              Dashboard. A base essencial pode incluir ou somar às recorrentes.
              Avisos: {d.settings.nearKm} km ou {d.settings.nearDays} dias.
            </p>
          </Card>
          <Card title="Metas diárias">
            <Field className="settings-target-choice">
              <FieldLabel htmlFor="settings-default-target">
                Meta principal
              </FieldLabel>
              <Choice
                inputId="settings-default-target"
                name="defaultTarget"
                label="Meta principal"
                value={String(settings.defaultTarget)}
                onChange={(defaultTarget) =>
                  setSettings({ ...settings, defaultTarget })
                }
                options={[
                  { value: 'minimum', label: 'Mínima' },
                  { value: 'ideal', label: 'Ideal' },
                  { value: 'accelerated', label: 'Acelerada' },
                ]}
              />
            </Field>
            <Fields
              data={d}
              value={settings}
              setValue={setSettings}
              fields={[
                {
                  key: 'idealTargetPercent',
                  label: 'Margem da Meta Ideal (%)',
                  type: 'number',
                },
                {
                  key: 'acceleratedTargetPercent',
                  label: 'Margem da Meta Acelerada (%)',
                  type: 'number',
                },
              ]}
            />
            <p className="inline-note">
              Ideal: percentual adicional sobre a Meta Mínima.
            </p>
            <p className="inline-note">
              Acelerada: percentual adicional sobre a Meta Mínima.
            </p>
            <button className="primary" onClick={saveSettings}>
              Salvar configurações
            </button>
          </Card>
        </TabsContent>
        <TabsContent value="dados" keepMounted>
          <div className="settings-section-heading">
            <h2>Seus dados</h2>
            <p>Mantenha uma cópia dos seus registros, sempre ao seu alcance.</p>
          </div>
          <Card title="Dados e backup">
            <p>
              Versão dos dados: {MONEY_SCHEMA_VERSION} ·{' '}
              {collections.reduce((count, key) => count + d[key].length, 0)}{' '}
              registros
            </p>
            <p>
              Último backup solicitado:{' '}
              {lastBackup
                ? new Date(lastBackup).toLocaleString('pt-BR')
                : 'Ainda não registrado neste navegador'}
            </p>
            <p>
              Seus dados são salvos neste navegador. Consulte Conta e
              sincronização para verificar a cópia na nuvem. Continue exportando
              backups JSON.
            </p>
            <div className="button-row">
              <button
                className="primary"
                onClick={() => {
                  const result = downloadBackup(d);
                  setDownloadStatus(result.message);
                  if (result.ok) markBackup();
                }}
              >
                <ArrowDownToLine size={18} /> Baixar backup JSON
              </button>
              <label className="file-button">
                <ArrowUpFromLine size={18} /> Importar backup
                <input
                  aria-label="Importar backup"
                  type="file"
                  accept=".json,application/json"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) onImport(file);
                    e.target.value = '';
                  }}
                />
              </label>
              <button
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(backup(d));
                    markBackup();
                    setCopyStatus(
                      'Backup copiado. Guarde o conteúdo em um arquivo .json.',
                    );
                  } catch {
                    setCopyStatus(
                      'Não foi possível copiar. Permita acesso à área de transferência ou use Baixar backup JSON.',
                    );
                  }
                }}
              >
                Copiar backup
              </button>
              <button onClick={onRecovery}>
                Recuperar último backup automático
              </button>
            </div>
            {copyStatus && <output aria-live="polite">{copyStatus}</output>}
            {downloadStatus && (
              <output aria-live="polite">{downloadStatus}</output>
            )}
            <p className="inline-note">
              Formato JSON · versão {MONEY_SCHEMA_VERSION} ·{' '}
              {collections.reduce((s, k) => s + d[k].length, 0)} registros. A
              importação valida os dados e pede confirmação antes de substituir.
            </p>
          </Card>
        </TabsContent>
        <TabsContent value="seguranca" keepMounted>
          <div className="settings-section-heading">
            <h2>Segurança e recuperação</h2>
            <p>
              Verifique o armazenamento e mantenha seus registros recuperáveis.
            </p>
          </div>
          <DataSecurity data={d} syncStatus={syncStatus} />
          <Disclosure
            title="Diagnóstico de armazenamento"
            description="Armazenamento local e quota"
          >
            <StorageManager />
          </Disclosure>
          <details className="settings-advanced">
            <summary>Avançado: reset e limpeza de dados</summary>
            <Card title="Reset">
              <p className="inline-note">
                Cada ação pede confirmação. Um backup local de recuperação é
                salvo antes de limpar; no reset total, também é baixado um JSON.
              </p>
              <div className="reset-list">
                {[
                  [
                    'settings',
                    'Resetar configurações',
                    'Mantém registros e saldo inicial.',
                  ],
                  [
                    'finance',
                    'Limpar dados financeiros',
                    'Remove trabalho, gastos, dívidas, pagamentos, investimentos e saldo inicial. Mantém serviços da moto e planos.',
                  ],
                  [
                    'bike',
                    'Resetar moto',
                    'Remove cadastro operacional, manutenção, serviços, previsões, checklists e reserva da moto. Preserva o bem e suas avaliações no Patrimônio, sem vínculo com a nova moto.',
                  ],
                  [
                    'plans',
                    'Resetar planos',
                    'Remove planos e seus históricos de aportes e retiradas.',
                  ],
                  [
                    'wealth',
                    'Resetar patrimônio',
                    'Arquiva bens e limpa avaliações/vínculos/posições. Preserva Moto e transferências de caixa já registradas.',
                  ],
                  [
                    'total',
                    'RESET TOTAL',
                    'Apaga os dados do usuário e volta ao cadastro estrutural inicial.',
                  ],
                ].map(([k, label, note]) => (
                  <div key={k}>
                    <div>
                      <h3>{label}</h3>
                      <p>{note}</p>
                    </div>
                    <button className="danger" onClick={() => onReset(k)}>
                      {label}
                    </button>
                  </div>
                ))}
              </div>
            </Card>
          </details>
        </TabsContent>
      </div>
    </Tabs>
  );
}
