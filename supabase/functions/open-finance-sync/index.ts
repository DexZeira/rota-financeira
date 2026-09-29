import { serve } from 'https://deno.land/std@0.194.0/http/server.ts';
import { createClient } from "npm:@supabase/supabase-js@2";

// Tipos para dados da Pluggy
interface PluggyAccount {
  id: string;
  name: string;
  type: string;
  number: string;
  currency: string;
  balance?: {
    current?: number;
    available?: number;
  };
}

interface PluggyTransaction {
  id: string;
  accountId: string;
  date: string;
  description: string;
  amount: number;
  currency: string;
  status: string;
  category?: string;
  merchant?: string;
  type?: string;
}

interface PluggyBalance {
  accountId: string;
  current?: number;
  available?: number;
  asOf: string;
}

interface PluggyTransactionsPage {
  transactions: PluggyTransaction[];
  nextCursor?: string;
  nextPage?: boolean;
}

interface ProcessedAccount {
  id: string;
  external_account_id: string;
}

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const PLUGGY_CLIENT_ID = Deno.env.get('PLUGGY_CLIENT_ID') ?? '';
const PLUGGY_CLIENT_SECRET = Deno.env.get('PLUGGY_CLIENT_SECRET') ?? '';

if (!PLUGGY_CLIENT_ID || !PLUGGY_CLIENT_SECRET) {
  throw new Error('PLUGGY_CLIENT_ID and PLUGGY_CLIENT_SECRET must be set');
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

    // Baixar contas
    const accountsResponse = await fetch(`https://api.pluggy.ai/items/${connectionData.external_item_id}/accounts`, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'Authorization': `Bearer ${accessToken}`
      }
    });

    if (!accountsResponse.ok) {
      throw new Error(`Pluggy Accounts error: ${accountsResponse.status}`);
    }

    const accountsData = (await accountsResponse.json()) as { accounts: PluggyAccount[] };

    // Baixar saldos
    const balancesData: PluggyBalance[] = [];
    for (const account of accountsData.accounts) {
      if (account.id) {
        const balanceResponse = await fetch(`https://api.pluggy.ai/accounts/${account.id}/balance`, {
          method: 'GET',
          headers: {
            'Accept': 'application/json',
            'Authorization': `Bearer ${accessToken}`
          }
        });

        if (balanceResponse.ok) {
          const balance = (await balanceResponse.json()) as PluggyBalance;
          balancesData.push({
            ...balance
          });
        }
      }
    }

    // Baixar transações para cada conta
    let allTransactions: PluggyTransaction[] = [];
    for (const account of accountsData.accounts) {
      if (account.id) {
        // Baixar transações com paginação
        let cursor: string | null = null;
        do {
          const transactionsUrl = cursor            ? `https://api.pluggy.ai/accounts/${account.id}/transactions?cursor=${cursor}`
            : `https://api.pluggy.ai/accounts/${account.id}/transactions`;
          const transactionsResponse = await fetch(transactionsUrl, {
            method: 'GET',
            headers: {
              'Accept': 'application/json',
              'Authorization': `Bearer ${accessToken}`
            }
          });

          if (!transactionsResponse.ok) {
            throw new Error(`Pluggy Transactions error: ${transactionsResponse.status}`);
          }

          const transactionsPage = (await transactionsResponse.json()) as PluggyTransactionsPage;
          allTransactions = allTransactions.concat(transactionsPage.transactions || []);
          cursor = transactionsPage.nextCursor || null;
        } while (cursor);
      }
    }

    // Mapear e persistir dados
    // Processar contas
    const accountUpsertPromises = accountsData.accounts.map(async (account: PluggyAccount) => {
      if (!account.id || !account.name) return null;
      const { data: existingAccount, error } = await userClient
        .from('open_finance_accounts')
        .select('*')
        .eq('external_account_id', account.id)
        .single();
      if (error && error.code !== 'PGRST116') {  // Se for "no rows returned", não é erro
        throw new Error(`Account lookup error: ${error.message}`);
      }
      if (existingAccount) {
        // Atualizar conta existente
        const { data: updatedData, error: updateError } = await userClient
          .from('open_finance_accounts')
          .update({
            name: account.name,
            type: account.type,
            number: account.number,
            currency: account.currency,
            balance_current: account.balance?.current,
            balance_available: account.balance?.available,
            updated_at: new Date().toISOString()
          })
          .eq('id', existingAccount.id)
          .select().single();
        if (updateError) {
          throw new Error(`Failed to update account: ${updateError.message}`);
        }
        return updatedData;
      } else {
        // Inserir nova conta
        const { data: insertedData, error: insertError } = await userClient
          .from('open_finance_accounts')
          .insert([{
            connection_id: connectionId,
            external_account_id: account.id,
            name: account.name,
            type: account.type,
            number: account.number,
            currency: account.currency,
            balance_current: account.balance?.current,
            balance_available: account.balance?.available,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          }])
          .select().single();
        if (insertError) {
          throw new Error(`Failed to insert account: ${insertError.message}`);
        }
        return insertedData;
      }
    });

    const processedAccounts = (await Promise.all(accountUpsertPromises)).filter((a): a is ProcessedAccount => a !== null);
    // Processar saldos
    for (const balance of balancesData) {
      // Para os saldos, precisamos encontrar a conta correspondente
      const account = accountsData.accounts.find((acc) => acc.id === balance.accountId);
      if (account && account.id) {
        const { data: existingBalanceRecord, error } = await userClient
          .from('open_finance_accounts')
          .select('*')
          .eq('external_account_id', balance.accountId)
          .single();

        if (!error && existingBalanceRecord) {
          // Atualizar saldo com upsert (usando o external_account_id como identificador único para a conta)
          const { error: updateError } = await userClient
            .from('open_finance_accounts')
            .update({
              balance_current: balance.current,
              balance_available: balance.available,
              updated_at: new Date().toISOString()
            })
            .eq('id', existingBalanceRecord.id);
          if (updateError) {
            throw new Error(`Failed to update balance: ${updateError.message}`);
          }
        }
      }
    }

    // Processar transações
    const transactionUpsertPromises = allTransactions.map(async (transaction: PluggyTransaction) => {
      if (!transaction.id || !transaction.accountId) return;
      const { data: existingTransaction, error } = await userClient
        .from('open_finance_transactions')
        .select('*')
        .eq('external_transaction_id', transaction.id)
        .single();

      if (error && error.code !== 'PGRST116') {  // Se for "no rows returned", não é erro
        throw new Error(`Transaction lookup error: ${error.message}`);
      }

      if (existingTransaction) {
        // Atualizar transação existente
        const { error: updateError } = await userClient
          .from('open_finance_transactions')
          .update({
            date: transaction.date,
            description: transaction.description,
            amount: transaction.amount,
            currency: transaction.currency,
            status: transaction.status,
            category: transaction.category,
            merchant: transaction.merchant,
            type: transaction.type,
            updated_at: new Date().toISOString()
          })
          .eq('id', existingTransaction.id);
        if (updateError) {
          throw new Error(`Failed to update transaction: ${updateError.message}`);
        }
        return;
      } else {
        // Inserir nova transação
        const accountData = processedAccounts.find((acc) => acc.external_account_id === transaction.accountId);
        if (!accountData) {
          throw new Error(`Account not found for transaction: ${transaction.id}`);
        }
        const { error: insertError } = await userClient
          .from('open_finance_transactions')
          .insert([{
            account_id: accountData.id,
            external_transaction_id: transaction.id,
            date: transaction.date,
            description: transaction.description,
            amount: transaction.amount,
            currency: transaction.currency,
            status: transaction.status,
            category: transaction.category,
            merchant: transaction.merchant,
            type: transaction.type,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          }]);
        if (insertError) {
          throw new Error(`Failed to insert transaction: ${insertError.message}`);
        }
        return;
      }
    });

    await Promise.all(transactionUpsertPromises);

    // Atualizar data de última sincronização
    const { error } = await userClient
      .from('open_finance_connections')
      .update({
        last_sync_at: new Date().toISOString()
      })
      .eq('id', connectionId);
    if (error) {
      throw new Error(`Failed to update last sync: ${error.message}`);
    }

    return new Response(
      JSON.stringify({        success: true,
        accounts_imported: accountsData.accounts.length,
        transactions_imported: allTransactions.length
      }),
      { headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error: unknown) {
    console.error('Error in open-finance-sync:', error);
    let errorMessage: string = 'Failed to synchronize data';
    if (error instanceof Error) {
      errorMessage = error.message;
    }
    return new Response(
      JSON.stringify({        error: 'Failed to synchronize data',
        details: errorMessage
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
});
