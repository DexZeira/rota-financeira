import { isOpenFinanceUuid, openFinanceErrorResponse } from './open-finance.ts';

const TRIGGERS = ['USER', 'CLIENT', 'SYNC', 'INTERNAL'] as const;

export type PluggyWebhookLedgerStatus =
  | 'received'
  | 'processing'
  | 'processed'
  | 'ignored'
  | 'failed';

export interface PluggyWebhookEvent {
  readonly event: string;
  readonly eventId: string;
  readonly itemId?: string;
  readonly triggeredBy?: (typeof TRIGGERS)[number];
  readonly clientUserId?: string;
}

export interface PluggyWebhookItem {
  readonly id: string;
  readonly clientUserId: string;
  readonly status: string;
  readonly executionStatus: string;
}

export interface PluggyWebhookConnection {
  readonly id: string;
  readonly user_id: string;
  readonly provider: string;
  readonly status: string;
  readonly external_item_id: string;
  readonly external_execution_status: string | null;
}

export interface PluggyWebhookSyncResult {
  readonly accounts: number;
  readonly transactions: number;
  readonly partial: boolean;
}

export interface PluggyWebhookLog {
  readonly correlationId: string;
  readonly eventId: string;
  readonly event: string;
  readonly status: string;
  readonly connectionId?: string;
  readonly accounts?: number;
  readonly transactions?: number;
}

export interface PluggyWebhookDependencies {
  readonly insertEvent: (event: PluggyWebhookEvent) => Promise<'inserted' | 'duplicate'>;
  readonly updateEvent: (
    eventId: string,
    status: PluggyWebhookLedgerStatus,
    errorCode?: string,
    connectionId?: string,
  ) => Promise<void>;
  readonly getItem: (itemId: string) => Promise<PluggyWebhookItem>;
  readonly findConnection: (itemId: string) => Promise<PluggyWebhookConnection | null>;
  readonly syncConnection: (
    connection: PluggyWebhookConnection,
  ) => Promise<PluggyWebhookSyncResult>;
  readonly waitUntil: (task: Promise<void>) => void;
  readonly log: (entry: PluggyWebhookLog) => void;
}

class WebhookProcessingError extends Error {
  constructor(readonly code: string) {
    super('Webhook processing failed');
  }
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= 256;
}

export function parsePluggyWebhookEvent(value: unknown): PluggyWebhookEvent | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  if (!nonEmptyString(input.event) || !nonEmptyString(input.eventId)) return null;
  if (
    input.itemId !== undefined &&
    (!nonEmptyString(input.itemId) || !isOpenFinanceUuid(input.itemId))
  ) return null;
  if (
    input.triggeredBy !== undefined &&
    !TRIGGERS.includes(input.triggeredBy as (typeof TRIGGERS)[number])
  ) return null;
  if (input.clientUserId !== undefined && !nonEmptyString(input.clientUserId)) return null;
  if (input.event === 'item/updated' && input.itemId === undefined) return null;
  return {
    event: input.event,
    eventId: input.eventId,
    ...(typeof input.itemId === 'string' ? { itemId: input.itemId } : {}),
    ...(typeof input.triggeredBy === 'string'
      ? { triggeredBy: input.triggeredBy as (typeof TRIGGERS)[number] }
      : {}),
    ...(typeof input.clientUserId === 'string' ? { clientUserId: input.clientUserId } : {}),
  };
}

async function safelyUpdateEvent(
  dependencies: PluggyWebhookDependencies,
  eventId: string,
  status: PluggyWebhookLedgerStatus,
  errorCode?: string,
): Promise<void> {
  try {
    await dependencies.updateEvent(eventId, status, errorCode);
  } catch {
    // The background promise must always settle even if the ledger is unavailable.
  }
}

async function ignoreEvent(
  event: PluggyWebhookEvent,
  dependencies: PluggyWebhookDependencies,
  correlationId: string,
): Promise<void> {
  await dependencies.updateEvent(event.eventId, 'ignored');
  dependencies.log({
    correlationId,
    eventId: event.eventId,
    event: event.event,
    status: 'ignored',
    accounts: 0,
    transactions: 0,
  });
}

async function processPluggyWebhookEvent(
  event: PluggyWebhookEvent,
  dependencies: PluggyWebhookDependencies,
  correlationId: string,
): Promise<void> {
  if (event.event !== 'item/updated' || !event.itemId) {
    await ignoreEvent(event, dependencies, correlationId);
    return;
  }

  let item: PluggyWebhookItem;
  try {
    item = await dependencies.getItem(event.itemId);
  } catch {
    throw new WebhookProcessingError('ITEM_VALIDATION_FAILED');
  }
  if (
    item.id !== event.itemId ||
    item.status !== 'UPDATED' ||
    (item.executionStatus !== 'SUCCESS' && item.executionStatus !== 'PARTIAL_SUCCESS')
  ) {
    await ignoreEvent(event, dependencies, correlationId);
    return;
  }

  let connection: PluggyWebhookConnection | null;
  try {
    connection = await dependencies.findConnection(item.id);
  } catch {
    throw new WebhookProcessingError('CONNECTION_LOOKUP_FAILED');
  }
  if (
    !connection ||
    connection.provider !== 'pluggy' ||
    connection.status !== 'connected' ||
    connection.external_item_id !== item.id ||
    connection.user_id !== item.clientUserId
  ) {
    await ignoreEvent(event, dependencies, correlationId);
    return;
  }

  await dependencies.updateEvent(event.eventId, 'processing', undefined, connection.id);
  let result: PluggyWebhookSyncResult;
  try {
    result = await dependencies.syncConnection({
      ...connection,
      external_execution_status: item.executionStatus,
    });
  } catch {
    throw new WebhookProcessingError('SYNC_FAILED');
  }
  await dependencies.updateEvent(event.eventId, 'processed');
  dependencies.log({
    correlationId,
    eventId: event.eventId,
    event: event.event,
    status: 'processed',
    connectionId: connection.id,
    accounts: result.accounts,
    transactions: result.transactions,
  });
}

function acceptedResponse(): Response {
  return new Response(null, { status: 202 });
}

export async function handlePluggyWebhookRequest(
  request: Request,
  dependencies: PluggyWebhookDependencies,
  correlationId: string,
): Promise<Response> {
  if (request.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'Open Finance request failed', correlation_id: correlationId }),
      {
        status: 405,
        headers: { 'Content-Type': 'application/json', Allow: 'POST' },
      },
    );
  }
  if (request.headers.get('Content-Type')?.split(';', 1)[0].trim().toLowerCase() !== 'application/json') {
    return openFinanceErrorResponse(415, correlationId);
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return openFinanceErrorResponse(400, correlationId);
  }
  const event = parsePluggyWebhookEvent(payload);
  if (!event) return openFinanceErrorResponse(400, correlationId);

  let inserted: 'inserted' | 'duplicate';
  try {
    inserted = await dependencies.insertEvent(event);
  } catch {
    return openFinanceErrorResponse(500, correlationId);
  }
  if (inserted === 'duplicate') return acceptedResponse();

  const task = processPluggyWebhookEvent(event, dependencies, correlationId).catch(async (error: unknown) => {
    const errorCode = error instanceof WebhookProcessingError
      ? error.code
      : 'PROCESSING_FAILED';
    await safelyUpdateEvent(dependencies, event.eventId, 'failed', errorCode);
    dependencies.log({
      correlationId,
      eventId: event.eventId,
      event: event.event,
      status: 'failed',
      accounts: 0,
      transactions: 0,
    });
  });
  dependencies.waitUntil(task);
  return acceptedResponse();
}
