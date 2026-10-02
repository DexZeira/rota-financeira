import { serve } from 'https://deno.land/std@0.194.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.7?target=deno';
import {
  buildRevokedUpdate,
  getOpenFinanceConfiguration,
  logOpenFinanceEvent,
  openFinanceErrorResponse,
  ownsOpenFinanceConnection,
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
    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      {
        status: 405,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      },
    );
  }

  const configurationResult = getOpenFinanceConfiguration(true);
  if (!configurationResult.ok) {
    return withCors(configurationResult.response);
  }

  const { configuration, correlationId } = configurationResult;
  try {
    // Verificar autenticação
    const authHeader = req.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        {
          status: 401,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json',
          },
        },
      );
    }

    const token = authHeader.substring(7); // Remove "Bearer "
    // Validar token e obter usuário
    const userClient = createClient(configuration.supabaseUrl, configuration.supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userError } = await userClient.auth.getUser(token);
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Invalid token' }),
        {
          status: 401,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json',
          },
        },
      );
    }

    const userId = user.id;

    // Obter dados do corpo da requisição
    const body = await req.json();
    const connectionId = body.connectionId;
    if (!connectionId) {
      return new Response(
        JSON.stringify({ error: 'Connection ID is required' }),
        {
          status: 400,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json',
          },
        },
      );
    }

    // Verificar se a conexão pertence ao usuário
    const { data: connectionData, error: connectionError } = await userClient
      .from('open_finance_connections')
      .select('*')
      .eq('id', connectionId)
      .eq('user_id', userId)
      .single();
    if (connectionError || !connectionData || !ownsOpenFinanceConnection(connectionData, userId)) {
      return withCors(
        new Response(
          JSON.stringify({ error: 'Connection not found or unauthorized' }),
          { status: 404, headers: { 'Content-Type': 'application/json' } }
        )
      );
    }

    if (connectionData.external_item_id) {
      logOpenFinanceEvent('open_finance.provider_revocation_pending', 501, correlationId);
    }

    const { data: updatedConnection, error: updateError } = await userClient
      .from('open_finance_connections')
      .update({
        ...buildRevokedUpdate(new Date().toISOString()),
        updated_at: new Date().toISOString(),
      })
      .eq('id', connectionId)
      .eq('user_id', userId)
      .select('id')
      .single();
    if (updateError || !updatedConnection) {
      throw new Error('Database error');
    }

    return withCors(
      new Response(
        JSON.stringify({
          connection_id: connectionId,
          status: 'revoked',
        }),
        { headers: { 'Content-Type': 'application/json' } }
      )
    );
  } catch {
    logOpenFinanceEvent('open_finance.disconnect_failed', 500, correlationId);
    return withCors(openFinanceErrorResponse(500, correlationId));
  }
});
