import { serve } from 'https://deno.land/std@0.194.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.7?target=deno';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const PLUGGY_CLIENT_ID = Deno.env.get('PLUGGY_CLIENT_ID') ?? '';
const PLUGGY_CLIENT_SECRET = Deno.env.get('PLUGGY_CLIENT_SECRET') ?? '';

if (!PLUGGY_CLIENT_ID || !PLUGGY_CLIENT_SECRET) {
  throw new Error('PLUGGY_CLIENT_ID and PLUGGY_CLIENT_SECRET must be set');
}

serve(async (req: Request) => {
  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const token = authHeader.substring(7);

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

    const body = await req.json();
    const institutionId = body.institutionId;

    if (!institutionId) {
      return new Response(
        JSON.stringify({ error: 'Institution ID is required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

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
      throw new Error(`Pluggy Auth error: ${authResponse.status}`);
    }

    const authData = await authResponse.json();
    const accessToken = authData.accessToken;

    const pluggyResponse = await fetch('https://api.pluggy.ai/items', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Authorization': `Bearer ${accessToken}`
      },
      body: JSON.stringify({
        institutionId: institutionId,
        properties: {}
      })
    });

    if (!pluggyResponse.ok) {
      throw new Error(`Pluggy API error: ${pluggyResponse.status}`);
    }

    const itemData = await pluggyResponse.json();

    const { data, error } = await userClient
      .from('open_finance_connections')
      .insert([
        {
          user_id: userId,
          provider: 'pluggy',
          external_item_id: itemData.id,
          connector_id: itemData.connectorId,
          institution_name: itemData.institution?.name,
          status: itemData.status,
          environment: Deno.env.get('OPEN_FINANCE_ENV') ?? 'sandbox',
          created_at: new Date().toISOString()
        }
      ])
      .select();

    if (error) {
      throw new Error(`Database error: ${error.message}`);
    }

    return new Response(
      JSON.stringify({
        item_id: itemData.id,
        connect_token: itemData.connectToken
      }),
      { headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error: unknown) {
    console.error('Error in open-finance-connect:', error);

    let errorMessage = 'Failed to create connection';
    if (error instanceof Error) {
      errorMessage = error.message;
    }

    return new Response(
      JSON.stringify({
        error: 'Failed to create connection',
        details: errorMessage
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
});
