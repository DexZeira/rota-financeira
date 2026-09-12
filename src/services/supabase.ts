import { createClient } from '@supabase/supabase-js';

const env = (
  import.meta as ImportMeta & { env: Record<string, string | undefined> }
).env;
const url = env.VITE_SUPABASE_URL;
const key = env.VITE_SUPABASE_ANON_KEY;
// Only publishable/anon keys belong in a Vite bundle.
function publicKey(value: string) {
  if (value.startsWith('sb_publishable_')) return true;
  try {
    const payload = JSON.parse(
      atob(value.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')),
    ) as { role?: string };
    return payload.role === 'anon';
  } catch {
    return false;
  }
}
function validUrl(value: string) {
  try {
    return (
      new URL(value).protocol === 'https:' ||
      /^http:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(value)
    );
  } catch {
    return false;
  }
}
export const supabase =
  url && validUrl(url) && key && publicKey(key)
    ? createClient(url, key, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
        },
      })
    : null;
