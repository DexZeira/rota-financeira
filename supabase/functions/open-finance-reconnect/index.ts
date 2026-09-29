import { serve } from 'https://deno.land/std@0.194.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

// Configurações do Supabase

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown error";
}
const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY');
const PLUGGY_CLIENT_ID = Deno.env.get('PLUGGY_CLIENT_ID')!;
const PLUGGY_CLIENT_SECRET = Deno.env.get('PLUGGY_CLIENT_SECRET')!;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error('Missing Supabase environment variables');
}

serve(async (req: Request) => {
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
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
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
    if (connectionError || !connectionData) {
      return new Response(
        JSON.stringify({ error: 'Connection not found or unauthorized' }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Autenticar na Pluggy
    const authResponse = await fetch('https://api.pluggy.ai/auth', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({
        clientId: PLUGGY_CLIENT_ID,
        clientSecret: PLUGGY_CLIENT_SECRET
      })
    });

    if (!authResponse.ok) {
      throw new Error(`Pluggy Auth error:{authResponse.status}`);
    }

    const authData = await authResponse.json();
    const accessToken = authData.accessToken;

    // Criar token de reconexão para a Item existente
    const connectTokenResponse = await fetch('https://api.pluggy.ai/connect_token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Authorization': `Bearer ${accessToken}`
      },
      body: JSON.stringify({
        itemId: connectionData.external_item_id
      })
    });

    if (!connectTokenResponse.ok) {
      throw new Error(`Pluggy Connect Token error: ${connectTokenResponse.status}`);
    }

    const connectTokenData = await connectTokenResponse.json();

    return new Response(
      JSON.stringify({        connectToken: connectTokenData.connectToken,
        itemId: connectionData.external_item_id
      }),
      { headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in open-finance-reconnect:', error);
    return new Response(
      JSON.stringify({        error: 'Failed to initiate reconnection',
        details: getErrorMessage(error)
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
});
