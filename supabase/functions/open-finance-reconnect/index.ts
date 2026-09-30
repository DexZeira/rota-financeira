import { serve } from 'https://deno.land/std@0.194.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';
import {
  buildPendingAuthorizationUpdate,
  createOpenFinanceState,
  getOpenFinanceConfiguration,
  logOpenFinanceEvent,
  ownsOpenFinanceConnection,
  openFinanceErrorResponse,
} from '../_shared/open-finance.ts';

serve(async (req: Request) => {
  const configurationResult = getOpenFinanceConfiguration(true);
  if (!configurationResult.ok) return configurationResult.response;

  const { configuration, correlationId } = configurationResult;
  try {
    // Verificar autenticação
    const authHeader = req.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
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
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const userId = user.id;

    // Obter dados do corpo da requisição
    const body = await req.json();
    const connectionId = body.connectionId;
    if (!connectionId) {
      return new Response(
        JSON.stringify({ error: 'Connection ID is required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
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
      return new Response(
        JSON.stringify({ error: 'Connection not found or unauthorized' }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const state = await createOpenFinanceState();
    const { data: updatedConnection, error: updateError } = await userClient
      .from('open_finance_connections')
      .update({
        ...buildPendingAuthorizationUpdate(state),
        updated_at: new Date().toISOString(),
      })
      .eq('id', connectionId)
      .eq('user_id', userId)
      .select('id')
      .single();

    if (updateError || !updatedConnection) {
      throw new Error('Database error');
    }

    return new Response(
      JSON.stringify({
        connection_id: updatedConnection.id,
        state: state.value,
        status: 'pending_authorization',
      }),
      { headers: { 'Content-Type': 'application/json' } }
    );
  } catch {
    logOpenFinanceEvent('open_finance.reconnect_failed', 500, correlationId);
    return openFinanceErrorResponse(500, correlationId);
  }
});
