import { useEffect, useState } from 'react';
import {
  activateNotifications,
  browserNotifications,
} from '../services/local-notifications';
import {
  notificationCategories,
  validateNotificationPreferences,
  type NotificationPreferences,
} from '../services/notification-preferences';
export const notificationDeviceKey = (owner: string) =>
  `rota-notifications-opt-in:${owner}`;
export function NotificationSettings({
  preferences,
  owner,
  onSave,
  diagnostic,
}: {
  preferences: NotificationPreferences;
  owner: string;
  onSave: (p: NotificationPreferences) => void | Promise<void>;
  diagnostic: string;
}) {
  const [draft, setDraft] = useState(preferences),
    [permission, setPermission] = useState(browserNotifications.permission),
    [message, setMessage] = useState(''),
    [busy, setBusy] = useState(false);
  const [deviceEnabled, setDeviceEnabled] = useState(() => {
    try {
      return localStorage.getItem(notificationDeviceKey(owner)) === 'enabled';
    } catch {
      return false;
    }
  });
  const status =
    permission === 'unsupported'
      ? 'Não suportadas'
      : permission === 'denied'
        ? 'Bloqueadas'
        : permission === 'granted' && draft.enabled && deviceEnabled
          ? 'Permitidas'
          : 'Desativadas';
  useEffect(() => {
    const refresh = () => setPermission(browserNotifications.permission());
    window.addEventListener('focus', refresh);
    return () => window.removeEventListener('focus', refresh);
  }, []);
  async function activate() {
    setBusy(true);
    try {
      const result = await activateNotifications();
      setPermission(result);
      if (result === 'granted') {
        localStorage.setItem(notificationDeviceKey(owner), 'enabled');
        setDeviceEnabled(true);
        setDraft((p) => ({ ...p, enabled: true }));
        setMessage(
          'Permissão concedida. Salve as preferências para ativar a entrega.',
        );
      } else
        setMessage(
          result === 'denied'
            ? 'As notificações estão bloqueadas pelo navegador.'
            : 'Permissão não concedida. Nenhuma notificação será enviada.',
        );
    } catch {
      setMessage(
        'Não foi possível ativar neste navegador. Os alertas continuam disponíveis no app.',
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <form
      className="notification-settings"
      onSubmit={async (e) => {
        e.preventDefault();
        try {
          await onSave(validateNotificationPreferences(draft));
          setMessage('Preferências de notificações salvas.');
        } catch {
          setMessage(
            'Não foi possível salvar as preferências. Tente novamente.',
          );
        }
      }}
    >
      <output>{status}</output>
      {permission === 'denied' && (
        <p>
          As notificações estão bloqueadas pelo navegador. Para permitir, revise
          as permissões deste site no navegador.
        </p>
      )}
      {permission === 'unsupported' && (
        <p>
          Este navegador não oferece notificações PWA nesta sessão. Em alguns
          celulares, é necessário instalar o app na tela inicial.
        </p>
      )}
      <button
        type="button"
        disabled={
          busy || permission === 'denied' || permission === 'unsupported'
        }
        onClick={() => void activate()}
      >
        Ativar notificações
      </button>
      <label>
        <input
          type="checkbox"
          checked={draft.enabled}
          disabled={!draft.enabled}
          onChange={() => {
            setDraft((p) => ({ ...p, enabled: false }));
          }}
        />
        Entregas ativadas no perfil (desmarque para desativar e salve)
      </label>
      <fieldset>
        <legend>Categorias</legend>
        {Object.entries(notificationCategories).map(([key, label]) => (
          <label key={key}>
            <input
              type="checkbox"
              checked={
                draft.categories[key as keyof typeof notificationCategories]
              }
              onChange={(e) =>
                setDraft((p) => ({
                  ...p,
                  categories: { ...p.categories, [key]: e.target.checked },
                }))
              }
            />
            {label}
          </label>
        ))}
      </fieldset>
      <label>
        Antecedência
        <select
          value={draft.leadDays}
          onChange={(e) =>
            setDraft((p) => ({
              ...p,
              leadDays: Number(
                e.target.value,
              ) as NotificationPreferences['leadDays'],
            }))
          }
        >
          {[1, 3, 7, 15].map((n) => (
            <option key={n} value={n}>
              {n} {n === 1 ? 'dia' : 'dias'}
            </option>
          ))}
        </select>
      </label>
      <label>
        <input
          type="checkbox"
          checked={draft.showValues}
          onChange={(e) =>
            setDraft((p) => ({ ...p, showValues: e.target.checked }))
          }
        />
        Mostrar valores e detalhes na tela bloqueada
      </label>
      <p>Desativado: conteúdo genérico, sem valores ou nomes de registros.</p>
      <label>
        <input
          type="checkbox"
          checked={draft.quietEnabled}
          onChange={(e) =>
            setDraft((p) => ({ ...p, quietEnabled: e.target.checked }))
          }
        />
        Não incomodar
      </label>
      <div className="assistant-controls">
        <label>
          Início do silêncio
          <input
            type="time"
            value={draft.quietStart}
            onChange={(e) =>
              setDraft((p) => ({ ...p, quietStart: e.target.value }))
            }
            required
          />
        </label>
        <label>
          Fim do silêncio
          <input
            type="time"
            value={draft.quietEnd}
            onChange={(e) =>
              setDraft((p) => ({ ...p, quietEnd: e.target.value }))
            }
            required
          />
        </label>
      </div>
      <p>
        Horário local do dispositivo. Horários iguais silenciam o dia inteiro.
      </p>
      <p>
        Até 3 avisos por dia, ao abrir ou voltar ao app. Sem garantia de entrega
        com o app fechado. A autorização do navegador é individual por
        dispositivo.
      </p>
      <button type="submit">Salvar preferências de notificações</button>
      <output>{message || diagnostic}</output>
    </form>
  );
}
