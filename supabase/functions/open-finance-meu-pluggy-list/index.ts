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

interface MeuPluggyItem {
  readonly id: string;
  readonly connectorId: number;
  readonly connectorName: string;
  readonly status: string;
  readonly executionStatus: string;
  readonly updatedAt: string;
  readonly clientUserId: string;
}

async function fetchMeuPluggyItems(
  configuration: OpenFinanceConfiguration,
  fetcher: OpenFinanceFetch = fetch,
  now: () => number = Date.now,
): Promise<MeuPluggyItem[]> {
  const apiKey = await getPluggyApiKey(configuration, fetcher, now);

  // Listar todos os Items da aplicação
  const response = await fetcher(`${configuration.pluggyApiUrl || 'https://api.pluggy.ai'}/items`, {
    method: 'GET',
    headers: { 'X-API-KEY': apiKey },
  });

  const payload = await response.json();
  if (!Array.isArray(payload.results)) {
    throw new Error('Invalid items response');
  }

  // Filtrar apenas Items do conector "Meu Pluggy"
  // O conector Meu Pluggy tem nome específico ou ID conhecido
  const meuPluggyConnectorNames = ['Meu Pluggy', 'meu-pluggy', 'MeuPluggy'];

  return payload.results
    .filter((item: Record<string, unknown>) => {
      const connectorName = item.connectorName as string | undefined;
      return connectorName && meuPluggyConnectorNames.some((name) =>
        connectorName.toLowerCase().includes(name.toLowerCase())
      );
    })
    .map((item: Record<string, unknown>) => ({
      id: item.id as string,
      connectorId: item.connectorId as number,
      connectorName: item.connectorName as string,
      status: item.status as string,
      executionStatus: item.executionStatus as string,
      updatedAt: item.updatedAt as string,
      clientUserId: item.clientUserId as string,
    }));
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

    const items = await fetchMeuPluggyItems(configuration);

    // Filtrar apenas itens do usuário atual
    const userItems = items.filter((item) => item.clientUserId === user.id);

    // Retornar dados mínimos necessários
    const result = userItems.map((item) => ({
      id: item.id,
      connectorName: item.connectorName,
      status: item.status,
      executionStatus: item.executionStatus,
      updatedAt: item.updatedAt,
    }));

    logOpenFinanceEvent('meu_pluggy.list_success', 200, correlationId);

    return withCors(
      new Response(
        JSON.stringify({ items: result }),
        { headers: { 'Content-Type': 'application/json' } },
      ),
    );
  } catch (error) {
    logOpenFinanceEvent('meu_pluggy.list_failed', 500, correlationId);
    return withCors(openFinanceErrorResponse(500, correlationId));
  }
});