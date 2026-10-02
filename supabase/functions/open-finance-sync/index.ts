import { serve } from 'https://deno.land/std@0.194.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';
import {
  canSyncOpenFinanceConnection,
  createOpenFinanceSyncResponse,
  getOpenFinanceConfiguration,
  isOpenFinanceUuid,
  logOpenFinanceSyncEvent,
  openFinanceErrorResponse,
} from '../_shared/open-finance.ts';
import { syncOpenFinanceConnection } from '../_shared/open-finance-sync-core.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function withCors(response: Response): Response {
  const headers = new Headers(response.headers);

  for (const [key, value] of Object.entries(corsHeaders)) {
    headers.set(key, value);
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function requestConnectionId(value: unknown): string | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const connectionId = (value as Record<string, unknown>).connection_id;
  return typeof connectionId === 'string' && isOpenFinanceUuid(connectionId)
    ? connectionId
    : null;
}

serve(async (req: Request) => {
  // IMPORTANTE: preflight deve ser tratado antes de configuração/JWT.
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: corsHeaders,
    });
  }

  if (req.method !== 'POST') {
    return withCors(
      openFinanceErrorResponse(405, ''),
    );
  }

  const configurationResult = getOpenFinanceConfiguration(true);
  if (!configurationResult.ok) {
    return withCors(configurationResult.response);
  }

  const { configuration, correlationId } = configurationResult;
  let accountsCount = 0;
  let transactionsCount = 0;
  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      logOpenFinanceSyncEvent('sync.authenticate', 401, correlationId, 0, 0);
      return withCors(openFinanceErrorResponse(401, correlationId));
    }
    const token = authHeader.slice(7);
    const userClient = createClient(configuration.supabaseUrl, configuration.supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userError } = await userClient.auth.getUser(token);
    if (userError || !user) {
      logOpenFinanceSyncEvent('sync.authenticate', 401, correlationId, 0, 0);
      return withCors(openFinanceErrorResponse(401, correlationId));
    }

    const body: unknown = await req.json();
    const connectionId = requestConnectionId(body);
    if (!connectionId) {
      logOpenFinanceSyncEvent('sync.validate_request', 400, correlationId, 0, 0);
      return withCors(openFinanceErrorResponse(400, correlationId));
    }

    const { data: connection, error: connectionError } = await userClient
      .from('open_finance_connections')
      .select('id,user_id,provider,status,external_item_id,external_execution_status')
      .eq('id', connectionId)
      .eq('user_id', user.id)
      .maybeSingle();
    if (
      connectionError ||
      !connection ||
      connection.provider !== 'pluggy' ||
      !canSyncOpenFinanceConnection(connection, user.id)
    ) {
      logOpenFinanceSyncEvent('sync.connection_unavailable', 404, correlationId, 0, 0);
      return withCors(openFinanceErrorResponse(404, correlationId));
    }
    const result = await syncOpenFinanceConnection(userClient, configuration, connection);
    accountsCount = result.accounts;
    transactionsCount = result.transactions;
    logOpenFinanceSyncEvent(
      'sync.complete', 200, correlationId, accountsCount, transactionsCount,
    );
    return withCors(
      createOpenFinanceSyncResponse(
        connectionId, accountsCount, transactionsCount, result.partial, result.syncedAt,
      ),
    );
  } catch {
    logOpenFinanceSyncEvent(
      'sync.failed', 500, correlationId, accountsCount, transactionsCount,
    );
    return withCors(openFinanceErrorResponse(500, correlationId));
  }
});
