import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase, supabaseConfig } from '../services/supabase';

function client() {
  if (!supabase) throw Error(supabaseConfig.message);
  return supabase;
}
const actions = {
  signIn: (email: string, password: string) =>
    client().auth.signInWithPassword({ email, password }),
  signUp: (email: string, password: string) =>
    client().auth.signUp({
      email,
      password,
      options: { emailRedirectTo: window.location.origin + '/' },
    }),
  signOut: () => client().auth.signOut(),
  resetPassword: (email: string) =>
    client().auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin + '/',
    }),
  updatePassword: (password: string) => client().auth.updateUser({ password }),
};

const AuthContext = createContext<
  | ({
      user: Session['user'] | null;
      session: Session | null;
      loading: boolean;
      recovery: boolean;
      finishRecovery: () => void;
    } & typeof actions)
  | null
>(null);
export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(!!supabase);
  const [recovery, setRecovery] = useState(false);
  useEffect(() => {
    if (!supabase) return;
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, next) => {
      setSession(next);
      setLoading(false);
      if (event === 'PASSWORD_RECOVERY') setRecovery(true);
      if (event === 'SIGNED_OUT') setRecovery(false);
    });
    return () => subscription.unsubscribe();
  }, []);
  return (
    <AuthContext.Provider
      value={{
        ...actions,
        user: session?.user ?? null,
        session,
        loading,
        recovery,
        finishRecovery: () => setRecovery(false),
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw Error('AuthProvider ausente.');
  return context;
}
