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

    // Revogar item na Pluggy se for possível (não é sempre necessário)
    if (connectionData.external_item_id) {
      try {
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

        if (authResponse.ok) {
          const authData = await authResponse.json();
          const accessToken = authData.accessToken;

          // Revogar o item na Pluggy, se possível
          await fetch(`https://api.pluggy.ai/items/${connectionData.external_item_id}`, {
            method: 'DELETE',
            headers: {
              'Accept': 'application/json',
              'Authorization': `Bearer ${accessToken}`
            }
          });
        }
      } catch (authError) {
        // Se não for possível revogar, continuamos
        console.warn('Could not revoke item on Pluggy:', authError);
      }
    }

    // Excluir registros relacionados do banco de dados
    // Primeiro deletamos as transações associadas à conta
    const { data: accountsData, error: accountsError } = await userClient
      .from('open_finance_accounts')
      .select('*')
      .eq('connection_id', connectionId);
    if (accountsError) {
      throw new Error(`Failed to fetch accounts: ${accountsError.message}`);
    }
    // Deletar transações associadas às contas
    if (accountsData && accountsData.length > 0) {
      for (const account of accountsData) {
        await userClient
          .from('open_finance_transactions')
          .delete()
          .eq('account_id', account.id);
      }
    }

    // Deletar contas associadas à conexão
    await userClient
      .from('open_finance_accounts')
      .delete()
      .eq('connection_id', connectionId);

    // Finalmente, deletar a conexão
    const { error: deleteError } = await userClient
      .from('open_finance_connections')
      .delete()
      .eq('id', connectionId);
    if (deleteError) {
      throw new Error(`Failed to delete connection: ${deleteError.message}`);
    }

    return new Response(
      JSON.stringify({        success: true,
        message: 'Connection disconnected successfully'
      }),
      { headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in open-finance-disconnect:', error);
    return new Response(
      JSON.stringify({        error: 'Failed to disconnect',
        details: getErrorMessage(error)
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
});
