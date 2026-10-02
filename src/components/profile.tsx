import { useState } from 'react';
import {
  ChevronDown,
  Link2,
  LogIn,
  LogOut,
  Monitor,
  Moon,
  Settings2,
  ShieldCheck,
  Sun,
  UserRound,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Field, FieldLabel } from '@/components/ui/field';
import type { Data, Row } from '../model';
import { profileInitials, profileName } from '../services/profile-identity';
import { authMessage } from '../services/auth-errors';
import { useAuth } from './auth-provider';
import { Feedback } from './finance-ui';
import './profile.css';

export function ProfileMenu({
  data,
  syncStatus,
  onSaveSettings,
  go,
  login,
  onSignOut,
}: {
  data: Data;
  syncStatus: string;
  onSaveSettings: (settings: Row) => void;
  go: (page: string) => void;
  login: () => void;
  onSignOut?: () => void;
}) {
  const { user, signOut } = useAuth();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const name = profileName(data.settings, user);
  const openSection = (
    section: 'perfil' | 'financas' | 'integracoes' | 'seguranca',
  ) => {
    go('Configurações');
    const url = new URL(location.href);
    url.searchParams.set('settings', section);
    history.replaceState(null, '', url.pathname + url.search + url.hash);
    window.dispatchEvent(new PopStateEvent('popstate'));
  };
  return (
    <div className="profile-control">
      <DropdownMenu>
        <DropdownMenuTrigger
          className="profile-trigger"
          aria-label={`Abrir menu de ${name}`}
        >
          <span className="profile-avatar" aria-hidden="true">
            {profileInitials(name)}
          </span>
          <span className="profile-trigger-identity">
            <span className="profile-trigger-name">{name}</span>
            <span className="profile-trigger-status">{syncStatus}</span>
          </span>
          <ChevronDown size={16} aria-hidden="true" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="profile-menu">
          <DropdownMenuGroup>
            <DropdownMenuLabel className="profile-menu-identity">
              <strong>{name}</strong>
              <span>{user?.email || 'Dados neste dispositivo'}</span>
            </DropdownMenuLabel>
            <DropdownMenuItem onClick={() => openSection('perfil')}>
              <UserRound /> Meu perfil
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => openSection('financas')}>
              <Settings2 /> Preferências
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => openSection('seguranca')}>
              <ShieldCheck /> Segurança
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => openSection('integracoes')}>
              <Link2 /> Integrações
            </DropdownMenuItem>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            <DropdownMenuLabel>Aparência</DropdownMenuLabel>
            <DropdownMenuRadioGroup
              value={String(data.settings.theme || 'claro')}
              onValueChange={(theme: string) =>
                onSaveSettings({ ...data.settings, theme })
              }
            >
              <DropdownMenuRadioItem value="claro">
                <Sun /> Claro
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="escuro">
                <Moon /> Escuro
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="sistema">
                <Monitor /> Usar tema do sistema
              </DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          {user ? (
            <DropdownMenuItem
              variant="destructive"
              disabled={busy}
              closeOnClick={false}
              onClick={() => {
                if (busy) return;
                setBusy(true);
                setError('');
                void signOut()
                  .then(({ error }) => {
                    if (error) setError(authMessage(error));
                    else onSignOut?.();
                  })
                  .catch((error: unknown) => setError(authMessage(error)))
                  .finally(() => setBusy(false));
              }}
            >
              <LogOut /> {busy ? 'Saindo…' : 'Sair da conta'}
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem onClick={login}>
              <LogIn /> Entrar ou criar conta
            </DropdownMenuItem>
          )}
          {error && (
            <Feedback tone="error" announce>
              {error}
            </Feedback>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

export function ProfileSettings({
  data,
  onSaveSettings,
}: {
  data: Data;
  onSaveSettings: (settings: Row) => void;
}) {
  const { user } = useAuth();
  const name = profileName(data.settings, user);
  const [draft, setDraft] = useState(name);
  return (
    <section className="profile-settings">
      <div className="profile-summary">
        <span
          className="profile-avatar profile-avatar-large"
          aria-hidden="true"
        >
          {profileInitials(name)}
        </span>
        <div>
          <h2>{name}</h2>
          <p>{user?.email || 'Perfil neste dispositivo'}</p>
        </div>
        <span className="profile-account-state">
          {user ? 'Conta conectada' : 'Uso local'}
        </span>
      </div>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          const profileName = draft.trim();
          if (profileName) onSaveSettings({ ...data.settings, profileName });
        }}
      >
        <Field>
          <FieldLabel htmlFor="profile-name">
            Como você quer ser chamado?
          </FieldLabel>
          <input
            id="profile-name"
            name="profileName"
            autoComplete="name"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            required
            maxLength={60}
            aria-describedby="profile-name-help"
          />
          <p id="profile-name-help" className="inline-note">
            Este nome aparece no seu perfil e no aplicativo.
          </p>
        </Field>
        <button
          className="primary"
          disabled={!draft.trim() || draft.trim() === name}
        >
          Salvar nome
        </button>
      </form>
      <dl className="profile-details">
        <div>
          <dt>Email da conta</dt>
          <dd>{user?.email || 'Entre para sincronizar entre dispositivos'}</dd>
        </div>
        <div>
          <dt>Idioma</dt>
          <dd>Português (Brasil)</dd>
        </div>
        <div>
          <dt>Moeda de apresentação</dt>
          <dd>Real brasileiro · BRL</dd>
        </div>
        <div>
          <dt>Formato de data</dt>
          <dd>DD/MM/AAAA</dd>
        </div>
      </dl>
    </section>
  );
}
