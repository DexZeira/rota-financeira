import { useId, useState } from 'react';
import { ArrowRight, Eye, EyeOff, RefreshCw } from 'lucide-react';
import { BrandLogo } from './brand-logo';
import { supabase, supabaseConfig } from '../services/supabase';
import {
  authMessage,
  authErrorDetails,
  SIGNUP_CONFIRMATION,
} from '../services/auth-errors';
import { useAuth } from './auth-provider';
import type { SyncErrorDetails } from '../services/cloud-sync';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Feedback } from './finance-ui';
import './account.css';

export function AuthForm({ close }: { close: () => void }) {
  const auth = useAuth();
  const [mode, setMode] = useState<'login' | 'signup' | 'reset'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [message, setMessage] = useState('');
  const [details, setDetails] = useState<ReturnType<
    typeof authErrorDetails
  > | null>(null);
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const feedbackId = useId();
  const recovery = auth.recovery;
  const passwordMismatch = message === 'As senhas precisam ser iguais.';
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !recovery) close();
      }}
    >
      <DialogContent className="account-dialog auth-dialog" showCloseButton={!recovery}>
        <div className="login-layout">
          <aside className="login-brand-panel">
            <BrandLogo />
            <div className="login-brand-copy"><h2>Seu dinheiro.<br />Uma direção.</h2>
              <p>Contas, patrimônio e decisões em um único lugar.</p></div>
            <svg className="login-route" viewBox="0 0 480 220" fill="none" aria-hidden="true">
              <path className="login-route-guide" d="M-30 170H90C112 170 120 192 140 213M290 240L351 133C368 104 380 102 405 102H510" />
              <path className="login-route-line" d="M24 176H68C87 176 92 170 109 162L238 102C254 94 267 99 285 90L420 24" />
              <circle cx="24" cy="176" r="5" fill="currentColor" />
              <circle cx="238" cy="102" r="6" fill="var(--sidebar)" stroke="currentColor" strokeWidth="2" />
              <circle cx="420" cy="24" r="5" fill="currentColor" />
            </svg>
          </aside>
          <div className="login-form-panel">
        <BrandLogo className="login-mobile-brand" />
        <DialogTitle>{recovery ? 'Uma nova senha' : mode === 'signup' ? 'Comece sua rota' : mode === 'reset' ? 'Recupere seu acesso' : 'Bem-vindo de volta'}</DialogTitle>
        <DialogDescription>
          {recovery
            ? 'Defina uma nova senha para continuar na sua conta.'
            : mode === 'signup'
              ? 'Crie sua conta para acompanhar sua vida financeira.'
              : mode === 'reset'
                ? 'Enviaremos um link para você definir uma nova senha.'
                : 'Entre para acompanhar sua vida financeira.'}
        </DialogDescription>
        {!supabase ? (
          <p>
            {supabaseConfig.message} Você pode continuar usando os dados neste
            navegador.
          </p>
        ) : (
          <form
            aria-busy={busy}
            aria-describedby={message ? feedbackId : undefined}
            onSubmit={(event) => {
              event.preventDefault();
              if (busy) return;
              void (async () => {
                if (!supabase) return;
                setBusy(true);
                setMessage('');
                setDetails(null);
                try {
                  if ((mode === 'signup' || recovery) && password !== confirm) {
                    setMessage('As senhas precisam ser iguais.');
                    return;
                  }
                  if (recovery) {
                    const { error } = await auth.updatePassword(password);
                    if (error) throw error;
                    auth.finishRecovery();
                    close();
                  } else if (mode === 'login') {
                    const { error } = await auth.signIn(email, password);
                    if (error) throw error;
                    close();
                  } else if (mode === 'signup') {
                    const { data, error } = await auth.signUp(email, password);
                    if (error) throw error;
                    if (data.session) close();
                    else setMessage(SIGNUP_CONFIRMATION);
                  } else {
                    const { error } = await auth.resetPassword(email);
                    if (error) throw error;
                    setMessage(
                      'Se houver uma conta com este email, você receberá um link para redefinir sua senha.',
                    );
                  }
                } catch (error) {
                  const diagnostic = authErrorDetails(error, [
                    password,
                    confirm,
                  ]);
                  setDetails(diagnostic);
                  setMessage(authMessage(diagnostic));
                } finally {
                  setBusy(false);
                }
              })();
            }}
          >
            {!recovery && (
              <label htmlFor={`${mode}-email`}>
                Email (obrigatório)
                <input
                  id={`${mode}-email`}
                  name="email"
                  type="email"
                  autoComplete="email"
                  placeholder="voce@exemplo.com"
                  required
                  disabled={busy}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </label>
            )}
            {(recovery || mode !== 'reset') && (
              <div className="auth-field">
                <label htmlFor={`${recovery ? 'recovery' : mode}-password`}>Senha (obrigatória)</label>
                <div className="login-password">
                <input
                  id={`${recovery ? 'recovery' : mode}-password`}
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete={
                    mode === 'signup' || recovery
                      ? 'new-password'
                      : 'current-password'
                  }
                  required
                  disabled={busy}
                  aria-invalid={passwordMismatch || undefined}
                  aria-describedby={passwordMismatch ? feedbackId : undefined}
                  minLength={mode === 'signup' || recovery ? 8 : 1}
                  value={password}
                  placeholder={mode === 'signup' || recovery ? 'Pelo menos 8 caracteres' : 'Sua senha'}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <button type="button" className="login-password-toggle" disabled={busy}
                  aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'} aria-pressed={showPassword}
                  onClick={() => setShowPassword((show) => !show)}>
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button></div>
              </div>
            )}
            {(recovery || mode === 'signup') && (
              <label htmlFor={`${recovery ? 'recovery' : mode}-confirm`}>
                Confirmar senha (obrigatória)
                <input
                  id={`${recovery ? 'recovery' : mode}-confirm`}
                  name="password_confirmation"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  required
                  disabled={busy}
                  aria-invalid={passwordMismatch || undefined}
                  aria-describedby={passwordMismatch ? feedbackId : undefined}
                  minLength={8}
                  value={confirm}
                  placeholder="Repita sua senha"
                  onChange={(e) => setConfirm(e.target.value)}
                />
              </label>
            )}
            <button className="primary login-submit" disabled={busy}>
              {busy
                ? recovery
                  ? 'Salvando nova senha…'
                  : mode === 'signup'
                    ? 'Criando conta…'
                    : mode === 'reset'
                      ? 'Enviando link…'
                      : 'Entrando…'
                : recovery
                  ? 'Salvar nova senha'
                  : mode === 'signup'
                    ? 'Criar conta'
                    : mode === 'reset'
                      ? 'Enviar link'
                      : 'Entrar'}
              {!busy && <ArrowRight size={18} aria-hidden="true" />}
            </button>
          </form>
        )}
        {!supabase && (
          <details>
            <summary>Diagnóstico seguro da configuração</summary>
            <p>
              URL presente:{' '}
              {supabaseConfig.diagnostics.urlPresent ? 'sim' : 'não'}
              <br />
              URL parseável:{' '}
              {supabaseConfig.diagnostics.urlParseable ? 'sim' : 'não'}
              <br />
              HTTPS: {supabaseConfig.diagnostics.https ? 'sim' : 'não'}
              <br />
              Host .supabase.co:{' '}
              {supabaseConfig.diagnostics.supabaseHost ? 'sim' : 'não'}
              <br />
              Placeholder detectado:{' '}
              {supabaseConfig.diagnostics.placeholderUrl ? 'sim' : 'não'}
              <br />
              Chave presente:{' '}
              {supabaseConfig.diagnostics.keyPresent ? 'sim' : 'não'}
              <br />
              Tipo: {supabaseConfig.diagnostics.keyType}
              <br />
              Prefixo válido:{' '}
              {supabaseConfig.diagnostics.validPrefix ? 'sim' : 'não'}
              <br />
              Placeholder detectado:{' '}
              {supabaseConfig.diagnostics.placeholderKey ? 'sim' : 'não'}
            </p>
          </details>
        )}
        {message && (
          <Feedback
            id={feedbackId}
            tone={details || passwordMismatch ? 'error' : 'success'}
            announce
          >
            {message}
          </Feedback>
        )}
        {!recovery && (
          <div className="login-actions">
            {supabase && (
              <>
                <button
                  className="login-switch"
                  disabled={busy}
                  onClick={() => {
                    setMode(mode === 'login' ? 'signup' : 'login');
                    setMessage('');
                    setDetails(null);
                    setShowPassword(false);
                  }}
                >
                  {mode === 'login' ? 'Criar conta' : 'Voltar para entrar'}
                </button>
                <button
                  className="login-forgot"
                  disabled={busy}
                  onClick={() => {
                    setMode('reset');
                    setMessage('');
                    setDetails(null);
                  }}
                >
                  Esqueci minha senha
                </button>
              </>
            )}
            <button disabled={busy} onClick={close}>Continuar sem conta</button>
          </div>
        )}
      </div></div></DialogContent>
    </Dialog>
  );
}

export function AccountPanel({
  status,
  lastSync,
  login,
  sync,
  choose,
  syncError,
}: {
  status: string;
  lastSync?: string;
  login: () => void;
  sync: () => void;
  choose: (choice: 'local' | 'cloud') => void;
  syncError?: SyncErrorDetails;
}) {
  const { session, signOut } = useAuth();
  const [error, setError] = useState('');
  const [confirm, setConfirm] = useState<'local' | 'cloud' | null>(null);
  const syncTone = syncError
    ? 'error'
    : status.toLocaleLowerCase().includes('offline')
      ? 'offline'
      : status.toLocaleLowerCase().includes('sincronizado')
        ? 'success'
        : 'sync';
  return (
    <section className="card account-panel">
      <h2>Conta e sincronização</h2>
      <p>{session?.user.email || 'Somente neste dispositivo'}</p>
      <Feedback tone={syncTone} title="Sincronização" announce>
        {syncError
          ? 'A sincronização precisa de atenção. Seus dados locais foram preservados.'
          : status}
      </Feedback>
      <p>
        Última sincronização:{' '}
        {lastSync
          ? new Date(lastSync).toLocaleString('pt-BR')
          : 'Ainda não realizada'}
      </p>
      {error && <Feedback tone="error" announce>{error}</Feedback>}
      <AlertDialog
        open={!!confirm}
        onOpenChange={(open) => {
          if (!open) setConfirm(null);
        }}
      >
        <div className="form-actions">
          {session ? (
            <>
              <button className="primary" onClick={sync}><RefreshCw size={16} aria-hidden="true" /> Sincronizar agora</button>
              <AlertDialogTrigger
                render={<button aria-label="Baixar dados da nuvem" onClick={() => setConfirm('cloud')} />}
              >
                Baixar dados da nuvem
              </AlertDialogTrigger>
              <AlertDialogTrigger
                render={<button aria-label="Enviar dados deste dispositivo" onClick={() => setConfirm('local')} />}
              >
                Enviar dados deste dispositivo
              </AlertDialogTrigger>
            <button
              onClick={() => {
                void signOut()
                  .then(({ error }) => {
                    if (error) setError(authMessage(error));
                  })
                  .catch((e) => setError(authMessage(e)));
              }}
            >
              Sair
            </button>
            </>
          ) : (
            <button onClick={login}>Entrar / Criar conta</button>
          )}
        </div>
      <small>
        Ao sair, os dados locais são mantidos. Exporte uma cópia na seção Dados.
      </small>
        <AlertDialogContent>
          <AlertDialogTitle>Confirmar substituição</AlertDialogTitle>
          <AlertDialogDescription>
            {confirm === 'cloud'
              ? 'Os dados da nuvem substituirão os dados deste dispositivo. Uma cópia local será preservada.'
              : 'Os dados deste dispositivo substituirão o snapshot da conta, após verificar conflitos.'}
          </AlertDialogDescription>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setConfirm(null)}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (confirm) choose(confirm);
                setConfirm(null);
              }}
            >
              Continuar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
