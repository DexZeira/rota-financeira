import { useEffect, useId, useState } from 'react';
import {
  activateNotifications,
  browserNotifications,
} from '../services/local-notifications';
import {
  notificationCategories,
  validateNotificationPreferences,
  type NotificationPreferences,
} from '../services/notification-preferences';
import { Feedback } from './finance-ui';
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
    [messageTone, setMessageTone] = useState<'success' | 'warning' | 'error'>('success'),
    [activating, setActivating] = useState(false),
    [saving, setSaving] = useState(false);
  const [deviceEnabled, setDeviceEnabled] = useState(() => {
    try {
      return localStorage.getItem(notificationDeviceKey(owner)) === 'enabled';
    } catch {
      return false;
    }
  });
  const feedbackId = useId();
  const privacyHelpId = useId();
  const quietHelpId = useId();
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
    if (activating || saving) return;
    setActivating(true);
    setMessage('');
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
        setMessageTone('success');
      } else {
        setMessage(
          result === 'denied'
            ? 'As notificações estão bloqueadas pelo navegador.'
            : 'Permissão não concedida. Nenhuma notificação será enviada.',
        );
        setMessageTone('warning');
      }
    } catch {
      setMessage(
        'Não foi possível ativar neste navegador. Os alertas continuam disponíveis no app.',
      );
      setMessageTone('error');
    } finally {
      setActivating(false);
    }
  }
  return (
    <form
      className="notification-settings"
      aria-busy={saving || activating}
      aria-describedby={message ? feedbackId : undefined}
      onSubmit={async (e) => {
        e.preventDefault();
        if (saving || activating) return;
        setSaving(true);
        setMessage('');
        try {
          await onSave(validateNotificationPreferences(draft));
          setMessage('Preferências de notificações salvas.');
          setMessageTone('success');
        } catch {
          setMessage(
            'Não foi possível salvar as preferências. Tente novamente.',
          );
          setMessageTone('error');
        } finally {
          setSaving(false);
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
          activating || saving || permission === 'denied' || permission === 'unsupported'
        }
        onClick={() => void activate()}
      >
        {activating ? 'Ativando notificações…' : 'Ativar notificações'}
      </button>
      <label>
        <input
          type="checkbox"
          checked={draft.enabled}
          disabled={!draft.enabled || saving}
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
              disabled={saving}
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
          disabled={saving}
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
          disabled={saving}
          aria-describedby={privacyHelpId}
          onChange={(e) =>
            setDraft((p) => ({ ...p, showValues: e.target.checked }))
          }
        />
        Mostrar valores e detalhes na tela bloqueada
      </label>
      <p id={privacyHelpId}>Desativado: conteúdo genérico, sem valores ou nomes de registros.</p>
      <label>
        <input
          type="checkbox"
          checked={draft.quietEnabled}
          disabled={saving}
          aria-describedby={quietHelpId}
          onChange={(e) =>
            setDraft((p) => ({ ...p, quietEnabled: e.target.checked }))
          }
        />
        Não incomodar
      </label>
      <div className="assistant-controls">
        <label>
          Início do silêncio (obrigatório)
          <input
            type="time"
            disabled={saving}
            aria-describedby={quietHelpId}
            value={draft.quietStart}
            onChange={(e) =>
              setDraft((p) => ({ ...p, quietStart: e.target.value }))
            }
            required
          />
        </label>
        <label>
          Fim do silêncio (obrigatório)
          <input
            type="time"
            disabled={saving}
            aria-describedby={quietHelpId}
            value={draft.quietEnd}
            onChange={(e) =>
              setDraft((p) => ({ ...p, quietEnd: e.target.value }))
            }
            required
          />
        </label>
      </div>
      <p id={quietHelpId}>
        Horário local do dispositivo. Horários iguais silenciam o dia inteiro.
      </p>
      <p>
        Até 3 avisos por dia, ao abrir ou voltar ao app. Sem garantia de entrega
        com o app fechado. A autorização do navegador é individual por
        dispositivo.
      </p>
      <button type="submit" disabled={saving || activating}>
        {saving ? 'Salvando preferências…' : 'Salvar preferências de notificações'}
      </button>
      {message ? (
        <Feedback id={feedbackId} tone={messageTone} announce>{message}</Feedback>
      ) : diagnostic ? (
        <Feedback tone="info">{diagnostic}</Feedback>
      ) : null}
    </form>
  );
}
