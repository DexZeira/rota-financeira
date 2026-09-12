export const CONFIG_ERROR =
  'Supabase não configurado corretamente. Verifique VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY.';
export type SupabaseConfigDiagnostics = {
  urlPresent: boolean;
  urlParseable: boolean;
  https: boolean;
  supabaseHost: boolean;
  placeholderUrl: boolean;
  keyPresent: boolean;
  keyType: 'publishable' | 'anon' | 'secret' | 'unknown';
  validPrefix: boolean;
  placeholderKey: boolean;
};
export function inspectSupabaseConfig(
  url?: string,
  key?: string,
): SupabaseConfigDiagnostics {
  const value = url?.trim() || '';
  let parsed: URL | null = null;
  try {
    parsed = value ? new URL(value) : null;
  } catch {
    parsed = null;
  }
  const host = parsed?.hostname || '',
    keyValue = key?.trim() || '';
  const keyType = keyValue.startsWith('sb_publishable_')
    ? 'publishable'
    : keyValue.startsWith('sb_secret_') || /service_role/i.test(keyValue)
      ? 'secret'
      : keyValue.split('.').length === 3
        ? 'anon'
        : 'unknown';
  return {
    urlPresent: !!value,
    urlParseable: !!parsed,
    https: parsed?.protocol === 'https:',
    supabaseHost: !!parsed && /^[a-z0-9-]+\.supabase\.co$/.test(host),
    placeholderUrl: /seu|your|example|placeholder|real_do/i.test(host),
    keyPresent: !!keyValue,
    keyType,
    validPrefix:
      /^sb_publishable_.+/.test(keyValue) ||
      (keyType === 'anon' && keyValue.split('.').length === 3),
    placeholderKey: /SUA_CHAVE|YOUR_KEY|placeholder|example|REAL/i.test(
      keyValue,
    ),
  };
}
export function validateSupabaseConfig(
  url?: string,
  key?: string,
): { valid: boolean; message: string; diagnostics: SupabaseConfigDiagnostics } {
  const diagnostics = inspectSupabaseConfig(url, key);
  const result = (valid: boolean, message: string) => ({
    valid,
    message,
    diagnostics,
  });
  if (!url?.trim() || !key?.trim()) return result(false, CONFIG_ERROR);
  try {
    const parsed = new URL(url);
    if (
      parsed.protocol !== 'https:' ||
      !/^[a-z0-9-]+\.supabase\.co$/.test(parsed.hostname) ||
      parsed.pathname !== '/' ||
      parsed.search ||
      parsed.hash ||
      parsed.username ||
      parsed.password ||
      diagnostics.placeholderUrl
    )
      return result(false, 'URL do Supabase inválida. ' + CONFIG_ERROR);
  } catch {
    return result(false, 'URL do Supabase inválida. ' + CONFIG_ERROR);
  }
  if (diagnostics.placeholderKey || diagnostics.keyType === 'secret')
    return result(false, 'Chave pública inválida. ' + CONFIG_ERROR);
  if (/^sb_publishable_[A-Za-z0-9_-]+$/.test(key)) return result(true, '');
  try {
    const payload = JSON.parse(
      atob(key.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')),
    ) as { role?: string };
    if (key.split('.').length === 3 && payload.role === 'anon')
      return result(true, '');
  } catch {
    /* Reject malformed keys. */
  }
  return {
    valid: false,
    message: 'Chave pública inválida ou incompleta. ' + CONFIG_ERROR,
    diagnostics,
  };
}
