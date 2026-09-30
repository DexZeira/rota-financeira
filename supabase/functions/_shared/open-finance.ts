const OPEN_FINANCE_ENVIRONMENTS = ['sandbox', 'production'] as const;
const OPEN_FINANCE_STATE_TTL_MS = 10 * 60 * 1000;

type OpenFinanceEnvironment = (typeof OPEN_FINANCE_ENVIRONMENTS)[number];

export interface OpenFinanceConfiguration {
  environment: OpenFinanceEnvironment;
  pluggyClientId: string;
  pluggyClientSecret: string;
  supabaseAnonKey: string;
  supabaseUrl: string;
}

export type OpenFinanceConfigurationResult =
  | { readonly ok: true; readonly configuration: OpenFinanceConfiguration; readonly correlationId: string }
  | { readonly ok: false; readonly response: Response };

function isValidSupabaseUrl(value: string | undefined): value is string {
  if (!value) return false;

  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
}

function isOpenFinanceEnvironment(value: string | undefined): value is OpenFinanceEnvironment {
  return value === 'sandbox' || value === 'production';
}

export function logOpenFinanceEvent(event: string, status: number, correlationId: string): void {
  console.log(JSON.stringify({ event, status, correlationId }));
}

export function openFinanceErrorResponse(status: number, correlationId: string): Response {
  return new Response(
    JSON.stringify({ error: 'Open Finance request failed', correlation_id: correlationId }),
    { status, headers: { 'Content-Type': 'application/json' } },
  );
}

export async function createOpenFinanceState(): Promise<{
  readonly value: string;
  readonly hash: string;
  readonly expiresAt: string;
}> {
  const value = crypto.randomUUID();
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(value),
  );
  const hash = Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');

  return {
    value,
    hash,
    expiresAt: new Date(Date.now() + OPEN_FINANCE_STATE_TTL_MS).toISOString(),
  };
}

export function buildPendingAuthorizationUpdate(state: {
  readonly hash: string;
  readonly expiresAt: string;
}): {
  readonly status: 'pending_authorization';
  readonly connect_state_hash: string;
  readonly connect_state_expires_at: string;
  readonly connect_state_consumed_at: null;
} {
  return {
    status: 'pending_authorization',
    connect_state_hash: state.hash,
    connect_state_expires_at: state.expiresAt,
    connect_state_consumed_at: null,
  };
}

export function buildRevokedUpdate(consumedAt: string): {
  readonly status: 'revoked';
  readonly connect_state_hash: null;
  readonly connect_state_expires_at: null;
  readonly connect_state_consumed_at: string;
} {
  return {
    status: 'revoked',
    connect_state_hash: null,
    connect_state_expires_at: null,
    connect_state_consumed_at: consumedAt,
  };
}

export function canSyncOpenFinanceConnection(
  connection: {
    readonly user_id?: unknown;
    readonly status?: unknown;
    readonly external_item_id?: unknown;
  },
  userId: string,
): boolean {
  return connection.user_id === userId &&
    connection.status === 'connected' &&
    typeof connection.external_item_id === 'string' &&
    connection.external_item_id.trim().length > 0;
}

export function ownsOpenFinanceConnection(
  connection: { readonly user_id?: unknown },
  userId: string,
): boolean {
  return connection.user_id === userId;
}

export function getOpenFinanceConfiguration(requireSupabase: boolean): OpenFinanceConfigurationResult {
  const correlationId = crypto.randomUUID();
  const environment = Deno.env.get('OPEN_FINANCE_ENV');
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const pluggyClientId = Deno.env.get('PLUGGY_CLIENT_ID');
  const pluggyClientSecret = Deno.env.get('PLUGGY_CLIENT_SECRET');

  if (
    Deno.env.get('OPEN_FINANCE_REAL_ENABLED') !== 'true' ||
    !isOpenFinanceEnvironment(environment) ||
    !pluggyClientId ||
    !pluggyClientSecret ||
    (requireSupabase && (!isValidSupabaseUrl(supabaseUrl) || !supabaseAnonKey))
  ) {
    logOpenFinanceEvent('open_finance.configuration_rejected', 503, correlationId);
    return { ok: false, response: openFinanceErrorResponse(503, correlationId) };
  }

  return {
    ok: true,
    correlationId,
    configuration: {
      environment,
      pluggyClientId,
      pluggyClientSecret,
      supabaseUrl: supabaseUrl ?? '',
      supabaseAnonKey: supabaseAnonKey ?? '',
    },
  };
}
