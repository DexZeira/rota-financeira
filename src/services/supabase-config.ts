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
  const keyValue = key?.trim() || '';

  let parsed: URL | null = null;

  try {
    parsed = value ? new URL(value) : null;
  } catch {
    parsed = null;
  }

  const host = parsed?.hostname || '';

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
    supabaseHost:
      !!parsed && /^[a-z0-9-]+\.supabase\.co$/i.test(host),
    placeholderUrl:
      /seu|your|example|placeholder|real_do|project_ref|xxxxxxxx|abcxyz/i.test(
        host,
      ),
    keyPresent: !!keyValue,
    keyType,
    validPrefix:
      /^sb_publishable_[A-Za-z0-9_-]+$/.test(keyValue) ||
      (keyType === 'anon' && keyValue.split('.').length === 3),
    placeholderKey:
      /SUA_CHAVE|YOUR_KEY|placeholder|example|REAL|PUBLICAVEL|xxxxxxxx/i.test(
        keyValue,
      ),
  };
}

export function validateSupabaseConfig(
  url?: string,
  key?: string,
): {
  valid: boolean;
  message: string;
  diagnostics: SupabaseConfigDiagnostics;
} {
  const cleanUrl = url?.trim() || '';
  const cleanKey = key?.trim() || '';

  const diagnostics = inspectSupabaseConfig(cleanUrl, cleanKey);

  const result = (valid: boolean, message: string) => ({
    valid,
    message,
    diagnostics,
  });

  if (!cleanUrl || !cleanKey) {
    return result(false, CONFIG_ERROR);
  }

  try {
    const parsed = new URL(cleanUrl);

    if (
      parsed.protocol !== 'https:' ||
      !/^[a-z0-9-]+\.supabase\.co$/i.test(parsed.hostname) ||
      parsed.pathname !== '/' ||
      parsed.search ||
      parsed.hash ||
      parsed.username ||
      parsed.password ||
      diagnostics.placeholderUrl
    ) {
      return result(false, 'URL do Supabase inválida. ' + CONFIG_ERROR);
    }
  } catch {
    return result(false, 'URL do Supabase inválida. ' + CONFIG_ERROR);
  }

  if (diagnostics.placeholderKey || diagnostics.keyType === 'secret') {
    return result(false, 'Chave pública inválida. ' + CONFIG_ERROR);
  }

  if (/^sb_publishable_[A-Za-z0-9_-]+$/.test(cleanKey)) {
    return result(true, '');
  }

  try {
    const parts = cleanKey.split('.');

    if (parts.length === 3) {
      const payload = JSON.parse(
        atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')),
      ) as { role?: string };

      if (payload.role === 'anon') {
        return result(true, '');
      }
    }
  } catch {
    // chave inválida
  }

  return result(
    false,
    'Chave pública inválida ou incompleta. ' + CONFIG_ERROR,
  );
}