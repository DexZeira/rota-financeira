import { useState } from 'react';
import { supabase, supabaseConfig } from '../services/supabase';
import {
  authMessage,
  authErrorDetails,
  SIGNUP_CONFIRMATION,
} from '../services/auth-errors';
import { useAuth } from './auth-provider';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';

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
  const recovery = auth.recovery;
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !recovery) close();
      }}
    >
      <DialogContent className="account-dialog">
        <DialogTitle>Rota Financeira</DialogTitle>
        <DialogDescription>
          {recovery
            ? 'Defina sua nova senha'
            : mode === 'signup'
              ? 'Crie sua conta'
              : mode === 'reset'
                ? 'Recupere sua senha'
                : 'Entre na sua conta'}
        </DialogDescription>
        {!supabase ? (
          <p>
            {supabaseConfig.message} Você pode continuar usando os dados neste
            navegador.
          </p>
        ) : (
          <form
            onSubmit={(event) => {
              event.preventDefault();
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
                Email
                <input
                  id={`${mode}-email`}
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </label>
            )}
            {(recovery || mode !== 'reset') && (
              <label htmlFor={`${recovery ? 'recovery' : mode}-password`}>
                Senha
                <input
                  id={`${recovery ? 'recovery' : mode}-password`}
                  name="password"
                  type="password"
                  autoComplete={
                    mode === 'signup' || recovery
                      ? 'new-password'
                      : 'current-password'
                  }
                  required
                  minLength={mode === 'signup' || recovery ? 8 : 1}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </label>
            )}
            {(recovery || mode === 'signup') && (
              <label htmlFor={`${recovery ? 'recovery' : mode}-confirm`}>
                Confirmar senha
                <input
                  id={`${recovery ? 'recovery' : mode}-confirm`}
                  name="password_confirmation"
                  type="password"
                  autoComplete="new-password"
                  required
                  minLength={8}
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                />
              </label>
            )}
            <button className="primary" disabled={busy}>
              {busy
                ? 'Aguarde…'
                : recovery
                  ? 'Salvar nova senha'
                  : mode === 'signup'
                    ? 'Criar conta'
                    : mode === 'reset'
                      ? 'Enviar link'
                      : 'Entrar'}
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
        {message && <output>{message}</output>}
        {details && (
          <details>
            <summary>Detalhes do erro de autenticação</summary>
            <p>Status: {details.status ?? 'Sem resposta HTTP'}</p>
            <p>Code: {details.code ?? 'Não informado'}</p>
            <p>Message: {details.message || 'Não informada'}</p>
          </details>
        )}
        {!recovery && (
          <div className="form-actions">
            {supabase && (
              <>
                <button
                  onClick={() => {
                    setMode(mode === 'signup' ? 'login' : 'signup');
                    setMessage('');
                    setDetails(null);
                  }}
                >
                  {mode === 'signup' ? 'Entrar' : 'Criar conta'}
                </button>
                <button
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
            <button onClick={close}>Continuar sem conta</button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function AccountPanel({
  status,
  lastSync,
  login,
  sync,
  choose,
}: {
  status: string;
  lastSync?: string;
  login: () => void;
  sync: () => void;
  choose: (choice: 'local' | 'cloud') => void;
}) {
  const { session, signOut } = useAuth();
  const [error, setError] = useState('');
  const [confirm, setConfirm] = useState<'local' | 'cloud' | null>(null);
  return (
    <section className="card account-panel">
      <h2>Conta e sincronização</h2>
      <p>{session?.user.email || 'Somente neste dispositivo'}</p>
      <output>{status}</output>
      <p>
        Última sincronização:{' '}
        {lastSync
          ? new Date(lastSync).toLocaleString('pt-BR')
          : 'Ainda não realizada'}
      </p>
      {error && <p role="alert">{error}</p>}
      <div className="form-actions">
        {session ? (
          <>
            <button onClick={sync}>Sincronizar agora</button>
            <button onClick={() => setConfirm('cloud')}>
              Baixar dados da nuvem
            </button>
            <button onClick={() => setConfirm('local')}>
              Enviar dados deste dispositivo
            </button>
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
        Ao sair, os dados locais são mantidos. Backup JSON continua disponível
        abaixo.
      </small>
      <Dialog
        open={!!confirm}
        onOpenChange={(open) => {
          if (!open) setConfirm(null);
        }}
      >
        <DialogContent>
          <DialogTitle>Confirmar substituição</DialogTitle>
          <DialogDescription>
            {confirm === 'cloud'
              ? 'Os dados da nuvem substituirão os dados deste dispositivo. Uma cópia local será preservada.'
              : 'Os dados deste dispositivo substituirão o snapshot da conta, após verificar conflitos.'}
          </DialogDescription>
          <div className="form-actions">
            <button onClick={() => setConfirm(null)}>Cancelar</button>
            <button
              onClick={() => {
                if (confirm) choose(confirm);
                setConfirm(null);
              }}
            >
              Continuar
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}
