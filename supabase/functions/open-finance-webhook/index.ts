import { serve } from 'https://deno.land/std@0.194.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';
import {
  getOpenFinanceWebhookConfiguration,
  getPluggyItem,
} from '../_shared/open-finance.ts';
import {
  handlePluggyWebhookRequest,
  type PluggyWebhookDependencies,
  type PluggyWebhookLedgerStatus,
} from '../_shared/open-finance-webhook.ts';
import { syncOpenFinanceConnection } from '../_shared/open-finance-sync-core.ts';

function waitUntil(task: Promise<void>): void {
  const runtime: unknown = Reflect.get(globalThis, 'EdgeRuntime');
  if (typeof runtime !== 'object' || runtime === null) {
    throw new Error('Background runtime unavailable');
  }
  const schedule: unknown = Reflect.get(runtime, 'waitUntil');
  if (typeof schedule !== 'function') throw new Error('Background runtime unavailable');
  Reflect.apply(schedule, runtime, [task]);
}

serve(async (request: Request) => {
  const configurationResult = getOpenFinanceWebhookConfiguration();
  if (!configurationResult.ok) return configurationResult.response;

  const { configuration, correlationId, serviceRoleKey } = configurationResult;
  const serviceClient = createClient(configuration.supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const dependencies: PluggyWebhookDependencies = {
    insertEvent: async (event) => {
      const { error } = await serviceClient
        .from('open_finance_webhook_events')
        .insert({
          event_id: event.eventId,
          event_type: event.event,
          external_item_id: event.itemId ?? null,
          status: 'received',
        });
      if (!error) return 'inserted';
      if (error.code === '23505') return 'duplicate';
      throw new Error('Webhook ledger unavailable');
    },
    updateEvent: async (eventId, status, errorCode, connectionId) => {
      const terminal = status === 'processed' || status === 'ignored' || status === 'failed';
      const update: {
        status: PluggyWebhookLedgerStatus;
        error_code: string | null;
        processed_at: string | null;
        connection_id?: string;
      } = {
        status,
        error_code: errorCode ?? null,
        processed_at: terminal ? new Date().toISOString() : null,
        ...(connectionId ? { connection_id: connectionId } : {}),
      };
      const { error } = await serviceClient
        .from('open_finance_webhook_events')
        .update(update)
        .eq('event_id', eventId);
      if (error) throw new Error('Webhook ledger unavailable');
    },
    getItem: (itemId) => getPluggyItem(configuration, itemId),
    findConnection: async (itemId) => {
      const { data, error } = await serviceClient
        .from('open_finance_connections')
        .select('id,user_id,provider,status,external_item_id,external_execution_status')
        .eq('external_item_id', itemId)
        .eq('provider', 'pluggy')
        .eq('status', 'connected')
        .maybeSingle();
      if (error) throw new Error('Connection lookup failed');
      return data;
    },
    syncConnection: async (connection) => {
      const executionStatus = connection.external_execution_status;
      if (executionStatus !== 'SUCCESS' && executionStatus !== 'PARTIAL_SUCCESS') {
        throw new Error('Sync unavailable');
      }
      return await syncOpenFinanceConnection(serviceClient, configuration, {
        ...connection,
        external_execution_status: executionStatus,
      });
    },
    waitUntil,
    log: (entry) => console.log(JSON.stringify(entry)),
  };

  return await handlePluggyWebhookRequest(request, dependencies, correlationId);
});
