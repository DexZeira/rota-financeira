import { serve } from 'https://deno.land/std@0.194.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.7?target=deno';
import {
  buildPendingAuthorizationUpdate,
  createOpenFinanceState,
  getOpenFinanceConfiguration,
  logOpenFinanceEvent,
  openFinanceErrorResponse,
} from '../_shared/open-finance.ts';

serve(async (req: Request) => {
  const configurationResult = getOpenFinanceConfiguration(true);
  if (!configurationResult.ok) return configurationResult.response;

  const { configuration, correlationId } = configurationResult;
  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const token = authHeader.substring(7);

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

    const body = await req.json();
    const institutionId = body.institutionId;

    if (!institutionId) {
      return new Response(
        JSON.stringify({ error: 'Institution ID is required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const state = await createOpenFinanceState();

    const { data, error } = await userClient
      .from('open_finance_connections')
      .insert([
        {
          user_id: userId,
          provider: 'pluggy',
          environment: configuration.environment,
          ...buildPendingAuthorizationUpdate(state),
          created_at: new Date().toISOString()
        }
      ])
      .select('id')
      .single();

    if (error || !data) {
      throw new Error('Database error');
    }

    return new Response(
      JSON.stringify({
        connection_id: data.id,
        state: state.value,
        status: 'pending_authorization'
      }),
      { headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error: unknown) {
    logOpenFinanceEvent('open_finance.connect_failed', 500, correlationId);
    return openFinanceErrorResponse(500, correlationId);
  }
});
