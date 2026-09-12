import { useState } from 'react';
import { supabase } from '../services/supabase';
import { authMessage } from '../services/auth-errors';
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
            Sincronização ainda não configurada. Você pode continuar usando os
            dados neste navegador.
          </p>
        ) : (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void (async () => {
                if (!supabase) return;
                setBusy(true);
                setMessage('');
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
                    else
                      setMessage(
                        'Confira seu email para confirmar o cadastro. Se já possui conta, entre ou recupere a senha.',
                      );
                  } else {
                    const { error } = await auth.resetPassword(email);
                    if (error) throw error;
                    setMessage(
                      'Se houver uma conta com este email, você receberá um link para redefinir sua senha.',
                    );
                  }
                } catch (error) {
                  setMessage(authMessage(error));
                } finally {
                  setBusy(false);
                }
              })();
            }}
          >
            {!recovery && (
              <label>
                Email
                <input
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </label>
            )}
            {(recovery || mode !== 'reset') && (
              <label>
                Senha
                <input
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
              <label>
                Confirmar senha
                <input
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
        {message && <output>{message}</output>}
        {!recovery && (
          <div className="form-actions">
            {supabase && (
              <>
                <button
                  onClick={() => {
                    setMode(mode === 'signup' ? 'login' : 'signup');
                    setMessage('');
                  }}
                >
                  {mode === 'signup' ? 'Entrar' : 'Criar conta'}
                </button>
                <button
                  onClick={() => {
                    setMode('reset');
                    setMessage('');
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
