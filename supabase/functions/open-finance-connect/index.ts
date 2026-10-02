import { serve } from 'https://deno.land/std@0.194.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.7?target=deno';
import {
  buildPendingAuthorizationUpdate,
  createOpenFinancePendingResponse,
  createOpenFinanceState,
  createPluggyConnectToken,
  getOpenFinanceConfiguration,
  logOpenFinanceEvent,
  openFinanceErrorResponse,
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

    const token = authHeader.substring(7);

    const userClient = createClient(
      configuration.supabaseUrl,
      configuration.supabaseAnonKey,
      {
        global: {
          headers: {
            Authorization: authHeader,
          },
        },
      },
    );

    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser(token);

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

    const state = await createOpenFinanceState();

    const connectToken = await createPluggyConnectToken(configuration, {
      clientUserId: userId,
      avoidDuplicates: true,
    });

    const { data, error } = await userClient
      .from('open_finance_connections')
      .insert([
        {
          user_id: userId,
          provider: 'pluggy',
          environment: configuration.environment,
          ...buildPendingAuthorizationUpdate(state),
          created_at: new Date().toISOString(),
        },
      ])
      .select('id')
      .single();

    if (error || !data) {
      throw new Error('Database error');
    }

    return withCors(
      createOpenFinancePendingResponse(
        data.id,
        connectToken,
        state.value,
      ),
    );
  } catch {
    logOpenFinanceEvent(
      'open_finance.connect_failed',
      500,
      correlationId,
    );

    return withCors(
      openFinanceErrorResponse(500, correlationId),
    );
  }
});