import type { ConnectEventType } from 'react-pluggy-connect';

export type OpenFinanceWidgetMode = 'sandbox' | 'production';

export type OpenFinanceWidgetSession = {
  readonly connectionId: string;
  readonly connectToken: string;
  readonly state: string;
  readonly status: 'pending_authorization' | 'connected';
};

export type OpenFinanceConfirmation = {
  readonly connectionId: string;
  readonly status: 'connected';
};

export interface OpenFinanceFunctionsClient {
  readonly functions: {
    invoke(
      name: string,
      options: { readonly body: Record<string, string> },
    ): Promise<{ readonly data: unknown; readonly error: unknown }>;
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function resolvePluggyWidgetEvent(
  event: 'open' | 'hide' | 'error' | 'close',
  successStarted: boolean,
  oauthInProgress = false,
): {
  readonly clearSession: boolean;
  readonly nextStatus: 'open' | 'pending' | 'error' | 'closed' | null;
} {
  if (event === 'open') return { clearSession: false, nextStatus: 'open' };
  if (successStarted) return { clearSession: false, nextStatus: null };
  if (event === 'hide' || (event === 'close' && oauthInProgress)) {
    return { clearSession: false, nextStatus: 'pending' };
  }
  return {
    clearSession: true,
    nextStatus: event === 'error' ? 'error' : 'closed',
  };
}

export function isPluggyOAuthTransitionEvent(event: ConnectEventType): boolean {
  return event === 'SUBMITTED_LOGIN' ||
    event === 'SUBMITTED_MFA' ||
    event === 'LOGIN_SUCCESS' ||
    event === 'LOGIN_MFA_SUCCESS' ||
    event === 'LOGIN_STEP_COMPLETED' ||
    event === 'ITEM_RESPONSE';
}

export function logPluggyWidgetCallback(
  callback: 'onOpen' | 'onEvent' | 'onHide' | 'onClose' | 'onError' | 'onSuccess',
  event?: ConnectEventType,
): void {
  console.debug(JSON.stringify(event ? { callback, event } : { callback }));
}

export function isOpenFinanceCallbackPath(pathname: string): boolean {
  return pathname === '/open-finance/callback';
}

export function buildPluggyWidgetOptions(
  mode: OpenFinanceWidgetMode,
  connectToken: string,
): {
  readonly connectToken: string;
  readonly includeSandbox?: true;
  readonly allowConnectInBackground: true;
  readonly forceOauthInBrowser: true;
} {
  return {
    connectToken,
    ...(mode === 'sandbox' ? { includeSandbox: true as const } : {}),
    allowConnectInBackground: true,
    forceOauthInBrowser: true,
  };
}

export async function invokeOpenFinanceAuthorization(
  client: OpenFinanceFunctionsClient,
  action: 'connect' | 'reconnect',
  connectionId?: string,
): Promise<OpenFinanceWidgetSession> {
  if (action === 'reconnect' && !connectionId) {
    throw new Error('Não foi possível iniciar a autorização.');
  }

  const response = await client.functions.invoke(
    action === 'connect' ? 'open-finance-connect' : 'open-finance-reconnect',
    {
      body: action === 'connect' ? {} : { connectionId: connectionId as string },
    },
  );
  if (response.error || !isRecord(response.data)) {
    throw new Error('Não foi possível iniciar a autorização.');
  }

  const connection = response.data.connection_id;
  const token = response.data.connect_token;
  const state = response.data.state;
  if (
    typeof connection !== 'string' ||
    typeof token !== 'string' ||
    typeof state !== 'string' ||
    response.data.status !== 'pending_authorization'
  ) {
    throw new Error('Não foi possível iniciar a autorização.');
  }

  return {
    connectionId: connection,
    connectToken: token,
    state,
    status: 'pending_authorization',
  };
}

export async function invokeOpenFinanceConfirmation(
  client: OpenFinanceFunctionsClient,
  session: OpenFinanceWidgetSession,
  itemId: string,
): Promise<OpenFinanceConfirmation> {
  const response = await client.functions.invoke('open-finance-confirm', {
    body: {
      connection_id: session.connectionId,
      item_id: itemId,
      state: session.state,
    },
  });
  if (response.error || !isRecord(response.data)) {
    throw new Error('Não foi possível confirmar a autorização.');
  }
  if (
    response.data.connection_id !== session.connectionId ||
    response.data.status !== 'connected'
  ) throw new Error('Não foi possível confirmar a autorização.');

  return { connectionId: session.connectionId, status: 'connected' };
}

export type MeuPluggyItem = {
  readonly id: string;
  readonly connectorName: string;
  readonly status: string;
  readonly executionStatus: string;
  readonly updatedAt: string;
};

export async function listMeuPluggyItems(
  client: OpenFinanceFunctionsClient,
): Promise<MeuPluggyItem[]> {
  const response = await client.functions.invoke('open-finance-meu-pluggy-list', { body: {} });
  if (response.error || !isRecord(response.data)) {
    throw new Error('Não foi possível listar contas do Meu Pluggy.');
  }
  const data = response.data as Record<string, unknown>;
  if (!Array.isArray(data.items)) {
    throw new Error('Resposta inválida do Meu Pluggy.');
  }
  return data.items.map((item: Record<string, unknown>) => ({
    id: String(item.id),
    connectorName: String(item.connectorName),
    status: String(item.status),
    executionStatus: String(item.executionStatus),
    updatedAt: String(item.updatedAt),
  }));
}

export async function connectMeuPluggyItem(
  client: OpenFinanceFunctionsClient,
  itemId: string,
): Promise<{ connectionId: string; status: 'connected' }> {
  const response = await client.functions.invoke('open-finance-meu-pluggy-connect', {
    body: { item_id: itemId },
  });
  if (response.error || !isRecord(response.data)) {
    throw new Error('Não foi possível conectar conta do Meu Pluggy.');
  }
  const data = response.data as Record<string, unknown>;
  const connectionId = data.connection_id as string | undefined;
  const status = data.status as string | undefined;
  if (typeof connectionId !== 'string' || status !== 'connected') {
    throw new Error('Resposta inválida ao conectar Meu Pluggy.');
  }
  return { connectionId, status: 'connected' };
}
