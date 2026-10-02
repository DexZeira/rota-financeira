import { serve } from 'https://deno.land/std@0.194.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.7?target=deno';
import {
  getOpenFinanceConfiguration,
  getPluggyApiKey,
  logOpenFinanceEvent,
  openFinanceErrorResponse,
  type OpenFinanceConfiguration,
  type OpenFinanceFetch,
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

interface PluggyItemDetail {
  readonly id: string;
  readonly connectorId: number;
  readonly connectorName: string;
  readonly institutionName: string;
  readonly status: string;
  readonly executionStatus: string;
  readonly updatedAt: string;
  readonly clientUserId: string;
}

async function fetchPluggyItem(
  configuration: OpenFinanceConfiguration,
  itemId: string,
  fetcher: OpenFinanceFetch = fetch,
  now: () => number = Date.now,
): Promise<PluggyItemDetail> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(itemId)) {
    throw new Error('Invalid item ID');
  }

  const apiKey = await getPluggyApiKey(configuration, fetcher, now);
  const response = await fetcher(`${configuration.pluggyApiUrl || 'https://api.pluggy.ai'}/items/${itemId}`, {
    method: 'GET',
    headers: { 'X-API-KEY': apiKey },
  });

  const payload = await response.json();
  if (!payload || typeof payload.id !== 'string') {
    throw new Error('Item not found');
  }

  return {
    id: payload.id,
    connectorId: payload.connectorId,
    connectorName: payload.connectorName,
    institutionName: payload.institutionName,
    status: payload.status,
    executionStatus: payload.executionStatus,
    updatedAt: payload.updatedAt,
    clientUserId: payload.clientUserId,
  };
}

serve(async (req: Request) => {
  // Preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return withCors(
      openFinanceErrorResponse(405, ''),
    );
  }

  // Verificar se Meu Pluggy está habilitado
  if (Deno.env.get('MEU_PLUGGY_ENABLED') !== 'true') {
    return withCors(
      openFinanceErrorResponse(404, ''),
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
    if (userError || !user) {
      return withCors(openFinanceErrorResponse(401, correlationId));
    }

    const body: unknown = await req.json();
    const itemId = typeof body === 'object' && body !== null && 'item_id' in body
      ? String((body as Record<string, unknown>).item_id)
      : '';

    if (!itemId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(itemId)) {
      return withCors(openFinanceErrorResponse(400, correlationId));
    }

    // Buscar detalhes do Item na Pluggy
    const item = await fetchPluggyItem(configuration, itemId);

    // Verificar se o Item pertence ao usuário
    if (item.clientUserId !== user.id) {
      logOpenFinanceEvent('meu_pluggy.connect_rejected', 403, correlationId);
      return withCors(openFinanceErrorResponse(403, correlationId));
    }

    // Verificar se é um Item do conector Meu Pluggy
    const meuPluggyConnectorNames = ['Meu Pluggy', 'meu-pluggy', 'MeuPluggy'];
    const isMeuPluggy = meuPluggyConnectorNames.some((name) =>
      item.connectorName.toLowerCase().includes(name.toLowerCase())
    );

    if (!isMeuPluggy) {
      logOpenFinanceEvent('meu_pluggy.connect_rejected', 400, correlationId);
      return withCors(openFinanceErrorResponse(400, correlationId));
    }

    // Verificar se já existe conexão para este Item
    const { data: existing } = await userClient
      .from('open_finance_connections')
      .select('id')
      .eq('user_id', user.id)
      .eq('external_item_id', itemId)
      .eq('connection_type', 'meu_pluggy')
      .maybeSingle();

    if (existing) {
      logOpenFinanceEvent('meu_pluggy.connect_idempotent', 200, correlationId);
      return withCors(
        new Response(
          JSON.stringify({ connection_id: existing.id, status: 'connected' }),
          { headers: { 'Content-Type': 'application/json' } },
        ),
      );
    }

    // Criar conexão Meu Pluggy
    const { data, error } = await userClient
      .from('open_finance_connections')
      .insert([{
        user_id: user.id,
        provider: 'pluggy',
        external_item_id: itemId,
        connector_id: String(item.connectorId),
        institution_name: item.institutionName,
        status: 'connected',
        environment: configuration.environment,
        connection_type: 'meu_pluggy',
        external_execution_status: item.executionStatus,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        last_sync_at: new Date().toISOString(),
      }])
      .select('id')
      .single();

    if (error || !data) {
      logOpenFinanceEvent('meu_pluggy.connect_failed', 500, correlationId);
      return withCors(openFinanceErrorResponse(500, correlationId));
    }

    logOpenFinanceEvent('meu_pluggy.connected', 200, correlationId);

    return withCors(
      new Response(
        JSON.stringify({ connection_id: data.id, status: 'connected' }),
        { headers: { 'Content-Type': 'application/json' } },
      ),
    );
  } catch (error) {
    logOpenFinanceEvent('meu_pluggy.connect_failed', 500, correlationId);
    return withCors(openFinanceErrorResponse(500, correlationId));
  }
});