import { serve } from 'https://deno.land/std@0.194.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.7?target=deno';
import {
  assessOpenFinanceConfirmation,
  buildConfirmedConnectionUpdate,
  createOpenFinanceConnectedResponse,
  getOpenFinanceConfiguration,
  getPluggyItem,
  hashOpenFinanceState,
  isOpenFinanceUuid,
  logOpenFinanceEvent,
  openFinanceErrorResponse,
  validatePluggyItemConfirmation,
} from '../_shared/open-finance.ts';

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
  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return withCors(openFinanceErrorResponse(401, correlationId));
    }

    const token = authHeader.slice(7);
    const userClient = createClient(
      configuration.supabaseUrl,
      configuration.supabaseAnonKey,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user }, error: userError } = await userClient.auth.getUser(token);
    if (userError || !user) return withCors(openFinanceErrorResponse(401, correlationId));

    const body: unknown = await req.json();
    const connectionId = readBodyString(body, 'connection_id');
    const itemId = readBodyString(body, 'item_id');
    const state = readBodyString(body, 'state');
    if (
      !isOpenFinanceUuid(connectionId) ||
      !isOpenFinanceUuid(itemId) ||
      state.length === 0 ||
      state.length > 256
    ) return withCors(openFinanceErrorResponse(400, correlationId));

    const { data: connection, error: connectionError } = await userClient
      .from('open_finance_connections')
      .select(
        'id,user_id,status,external_item_id,connect_state_hash,connect_state_expires_at,connect_state_consumed_at',
      )
      .eq('id', connectionId)
      .eq('user_id', user.id)
      .single();
    if (connectionError || !connection) {
      logOpenFinanceEvent('open_finance.confirm_rejected', 404, correlationId);
      return withCors(openFinanceErrorResponse(404, correlationId));
    }

    const decision = await assessOpenFinanceConfirmation(
      connection,
      user.id,
      itemId,
      state,
    );
    if (decision === 'idempotent') {
      return withCors(createOpenFinanceConnectedResponse(connectionId));
    }
    if (decision !== 'confirm') {
      logOpenFinanceEvent('open_finance.confirm_rejected', 409, correlationId);
      return withCors(openFinanceErrorResponse(409, correlationId));
    }

    const item = await getPluggyItem(configuration, itemId);
    const executionStatus = validatePluggyItemConfirmation(item, itemId, user.id);
    if (!executionStatus) {
      logOpenFinanceEvent('open_finance.confirm_rejected', 409, correlationId);
      return withCors(openFinanceErrorResponse(409, correlationId));
    }

    const consumedAt = new Date().toISOString();
    const stateHash = await hashOpenFinanceState(state);
    const { data: updated, error: updateError } = await userClient
      .from('open_finance_connections')
      .update(buildConfirmedConnectionUpdate(itemId, executionStatus, consumedAt))
      .eq('id', connectionId)
      .eq('user_id', user.id)
      .eq('status', 'pending_authorization')
      .eq('connect_state_hash', stateHash)
      .is('connect_state_consumed_at', null)
      .gt('connect_state_expires_at', consumedAt)
      .select('id')
      .maybeSingle();
    if (!updateError && updated) {
      logOpenFinanceEvent('open_finance.confirmed', 200, correlationId);
      return withCors(createOpenFinanceConnectedResponse(updated.id));
    }

    const { data: current } = await userClient
      .from('open_finance_connections')
      .select('id,status,external_item_id')
      .eq('id', connectionId)
      .eq('user_id', user.id)
      .maybeSingle();
    if (current?.status === 'connected' && current.external_item_id === itemId) {
      return withCors(createOpenFinanceConnectedResponse(connectionId));
    }

    logOpenFinanceEvent('open_finance.confirm_rejected', 409, correlationId);
    return withCors(openFinanceErrorResponse(409, correlationId));
  } catch {
    logOpenFinanceEvent('open_finance.confirm_failed', 500, correlationId);
    return withCors(openFinanceErrorResponse(500, correlationId));
  }
});

function readBodyString(body: unknown, key: string): string {
  return typeof body === 'object' && body !== null && key in body &&
      typeof (body as Record<string, unknown>)[key] === 'string'
    ? (body as Record<string, string>)[key]
    : '';
}
