import { createClient } from '@supabase/supabase-js';
import { validateSupabaseConfig } from './supabase-config';
const env = (
  import.meta as ImportMeta & { env: Record<string, string | undefined> }
).env;
const url = env.VITE_SUPABASE_URL;
const key = env.VITE_SUPABASE_ANON_KEY;
export const supabaseConfig = validateSupabaseConfig(url, key);
export const supabase =
  supabaseConfig.valid && url && key
    ? createClient(url, key, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
        },
      })
    : null;
