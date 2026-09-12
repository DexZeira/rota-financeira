import { useState } from 'react';
import { backup } from '../services/storage';
import { downloadBackup } from '../services/backup-download';
import { ArrowDownToLine, ArrowUpFromLine } from 'lucide-react';
import { Card, Fields } from '../components/common';
import {
  type Data,
  type Row,
  type Collection,
  collections,
  money,
  num,
} from '../model';

export function SettingsView({
  data: d,
  edit,
  onImport,
  onReset,
  onRecovery,
  onSaveSettings,
}: {
  data: Data;
  edit: (kind: Collection | 'settings' | 'bike', row?: Row) => void;
  onSaveSettings: (settings: Row) => void;
  onExport: () => void;
  onImport: (file: File) => void;
  onReset: (kind: string) => void;
  onRecovery: () => void;
}) {
  const [lastBackup, setLastBackup] = useState(
    () => localStorage.getItem('rota-financeira-last-backup') || '',
  );
  function markBackup() {
    const time = new Date().toISOString();
    localStorage.setItem('rota-financeira-last-backup', time);
    setLastBackup(time);
  }
  const [copyStatus, setCopyStatus] = useState('');
  const [downloadStatus, setDownloadStatus] = useState('');
  const [settings, setSettings] = useState<Row>({
    id: 'settings',
    defaultTarget: d.settings.defaultTarget ?? 'ideal',
    idealTargetPercent: num(d.settings.idealTargetPercent ?? 20),
    acceleratedTargetPercent: num(d.settings.acceleratedTargetPercent ?? 40),
  });
  const detail = (label: string, text: string) => (
    <div className="detail" key={label}>
      <span>{label}</span>
      <strong>{text}</strong>
    </div>
  );
  function saveSettings() {
    const next = {
      ...d,
      settings: {
        ...d.settings,
        defaultTarget: settings.defaultTarget,
        idealTargetPercent: settings.idealTargetPercent,
        acceleratedTargetPercent: settings.acceleratedTargetPercent,
      },
    };
    onSaveSettings(next.settings);
  }
  return (
    <>
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
          {detail('Custo essencial / mês', money(num(d.settings.essential)))}
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
          depreciação. Veja os valores e abatimentos na composição do Dashboard.
          A base essencial pode incluir ou somar às recorrentes. Avisos:{' '}
          {d.settings.nearKm} km ou {d.settings.nearDays} dias.
        </p>
      </Card>
      <Card title="Aparência">
        <Fields
          data={d}
          value={d.settings}
          setValue={onSaveSettings}
          fields={[
            {
              key: 'theme',
              label: 'Tema',
              type: 'select',
              options: ['claro', 'escuro', 'sistema'],
            },
          ]}
        />
      </Card>
      <Card title="Metas diárias">
        <Fields
          data={d}
          value={settings}
          setValue={setSettings}
          fields={[
            {
              key: 'defaultTarget',
              label: 'Meta principal',
              type: 'select',
              options: ['minimum', 'ideal', 'accelerated'],
            },
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
        <button onClick={saveSettings}>Salvar configurações</button>
      </Card>
      <Card title="Dados e backup">
        <p>
          Versão dos dados: {d.dataVersion} ·{' '}
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
          Seus dados são salvos neste navegador. Consulte Conta e sincronização
          para verificar a cópia na nuvem. Continue exportando backups JSON.
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
        {copyStatus && <output>{copyStatus}</output>}
        {downloadStatus && <output>{downloadStatus}</output>}
        <p className="inline-note">
          Formato JSON · versão {d.dataVersion} ·{' '}
          {collections.reduce((s, k) => s + d[k].length, 0)} registros. A
          importação valida os dados e pede confirmação antes de substituir.
        </p>
      </Card>
      <Card title="Reset">
        <p className="inline-note">
          Cada ação pede confirmação. Um backup local de recuperação é salvo
          antes de limpar; no reset total, também é baixado um JSON.
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
              'Remove cadastro, manutenção, serviços, previsões, checklists e reserva da moto.',
            ],
            [
              'plans',
              'Resetar planos',
              'Remove planos e seus históricos de aportes e retiradas.',
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
    </>
  );
}
