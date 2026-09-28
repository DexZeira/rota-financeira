import type { OpenFinanceProvider } from './provider';
import {
  emptyOpenFinance,
  type OpenFinanceState,
  type RemoteTransaction,
} from './types';
import { OpenFinanceError, errorCode } from './errors';
import { validateOpenFinance } from './state';

export class OpenFinanceSyncService {
  private running = new Set<string>();
  constructor(
    private readonly provider: OpenFinanceProvider,
    private readonly now = () => new Date(),
    private readonly timeoutMs = 15000,
  ) {}
  private async request<T>(operation: Promise<T>): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        operation,
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () => reject(new OpenFinanceError('NETWORK_ERROR')),
            this.timeoutMs,
          );
        }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
  async synchronize(
    source: OpenFinanceState,
    connectionId: string,
    owner: string,
    days: 30 | 90 | 365,
    online = true,
  ): Promise<OpenFinanceState> {
    const connection = source.connections.find((c) => c.id === connectionId);
    if (
      !connection ||
      connection.userId !== owner ||
      connection.provider !== this.provider.name
    )
      throw new OpenFinanceError('AUTH_REQUIRED');
    if (!online) throw new OpenFinanceError('NETWORK_ERROR');
    if (this.running.has(connectionId))
      throw new OpenFinanceError('RATE_LIMITED');
    if (
      connection.nextRetryAt &&
      Date.parse(connection.nextRetryAt) > +this.now()
    )
      throw new OpenFinanceError('RATE_LIMITED');
    if (
      source.sync.some(
        (s) =>
          s.connectionId === connectionId &&
          s.nextRetryAt &&
          Date.parse(s.nextRetryAt) > +this.now(),
      )
    )
      throw new OpenFinanceError('RATE_LIMITED');
    if (
      [
        'revoked',
        'reauthorization_required',
        'pending_authorization',
        'disconnected',
      ].includes(connection.status)
    )
      throw new OpenFinanceError('AUTH_REQUIRED');
    if (
      connection.errorCode &&
      connection.lastSyncAt &&
      +this.now() - Date.parse(connection.lastSyncAt) < 60000
    )
      throw new OpenFinanceError('RATE_LIMITED');
    this.running.add(connectionId);
    let next = structuredClone(source);
    const at = this.now().toISOString();
    let nextRetryAt: string | null = null;
    const index = next.connections.findIndex((c) => c.id === connectionId);
    try {
      const consent = await this.request(
        this.provider.getConsent(connection, owner),
      );
      if (
        consent.id !== connection.id ||
        consent.userId !== owner ||
        consent.provider !== connection.provider ||
        consent.institutionId !== connection.institutionId
      )
        throw new OpenFinanceError('INVALID_RESPONSE');
      if (
        consent.consentStatus !== 'authorized' ||
        (consent.expiresAt && Date.parse(consent.expiresAt) <= +this.now())
      )
        throw new OpenFinanceError('CONSENT_EXPIRED');
      const accounts = await this.request(
        this.provider.listAccounts(consent, owner),
      );
      if (
        !Array.isArray(accounts) ||
        accounts.length > 500 ||
        new Set(accounts.map((a) => a.id)).size !== accounts.length ||
        accounts.some(
          (a) =>
            a.connectionId !== connectionId ||
            source.accounts.some(
              (old) => old.id === a.id && old.connectionId !== connectionId,
            ),
        )
      )
        throw new OpenFinanceError('INVALID_RESPONSE');
      next.accounts = next.accounts.map((a) =>
        a.connectionId === connectionId &&
        !accounts.some((current) => current.id === a.id)
          ? { ...a, active: false }
          : a,
      );
      let failed = 0;
      for (const account of accounts) {
        const oldState = source.sync.find((s) => s.accountId === account.id);
        try {
          const balance = await this.request(
            this.provider.getBalance(account, consent, owner),
          );
          const items: RemoteTransaction[] = [];
          let cursor = this.provider.stableCursor
            ? (oldState?.cursor ?? null)
            : null;
          let finalCursor: string | null = null;
          const visited = new Set<string>();
          for (let page = 0; ; page++) {
            if (page >= 1000 || (cursor && visited.has(cursor)))
              throw new OpenFinanceError('INVALID_RESPONSE');
            if (cursor) visited.add(cursor);
            const batch = await this.request(
              this.provider.getTransactions(account, consent, owner, {
                since: new Date(+this.now() - days * 86400000)
                  .toISOString()
                  .slice(0, 10),
                cursor,
              }),
            );
            if (
              !Array.isArray(batch.items) ||
              items.length + batch.items.length > 100000
            )
              throw new OpenFinanceError('INVALID_RESPONSE');
            items.push(...batch.items);
            finalCursor = batch.cursor;
            if (!batch.nextPage) break;
            cursor = batch.nextPage;
          }
          if (
            items.some(
              (r) =>
                r.connectionId !== connectionId || r.accountId !== account.id,
            )
          )
            throw new OpenFinanceError('INVALID_RESPONSE');
          const validated = validateOpenFinance({
            ...emptyOpenFinance(),
            connections: [consent],
            accounts: [account],
            balances: [balance],
            transactions: items,
            sync: [
              {
                connectionId,
                accountId: account.id,
                cursor: this.provider.stableCursor ? finalCursor : null,
                errorCode: null,
                nextRetryAt: null,
              },
            ],
          });
          const merged = new Map(next.transactions.map((t) => [t.id, t]));
          const external = new Map(
            next.transactions
              .filter(
                (t) => t.accountId === account.id && t.transaction.externalId,
              )
              .map((t) => [t.transaction.externalId, t]),
          );
          for (const item of validated.transactions) {
            const old =
              external.get(item.transaction.externalId) ||
              (item.replacesId ? external.get(item.replacesId) : undefined) ||
              merged.get(item.id);
            if (old && old.accountId !== item.accountId)
              throw new OpenFinanceError('INVALID_RESPONSE');
            const changed =
              old &&
              (old.transaction.amountCents !== item.transaction.amountCents ||
                old.transaction.direction !== item.transaction.direction ||
                old.transaction.date !== item.transaction.date);
            if (old) merged.delete(old.id);
            const updated = {
              ...item,
              id: old?.id || item.id,
              reviewed: changed ? false : (old?.reviewed ?? false),
              importLinkId: old?.importLinkId ?? null,
            };
            merged.set(updated.id, updated);
            if (item.transaction.externalId)
              external.set(item.transaction.externalId, updated);
          }
          const candidate = validateOpenFinance({
            ...next,
            accounts: [
              ...next.accounts.filter((a) => a.id !== account.id),
              ...validated.accounts,
            ],
            balances: [
              ...next.balances.filter((b) => b.accountId !== account.id),
              ...validated.balances,
            ],
            sync: [
              ...next.sync.filter((s) => s.accountId !== account.id),
              ...validated.sync,
            ],
            transactions: [...merged.values()],
          });
          Object.assign(next, candidate);
        } catch (e) {
          if (['AUTH_REQUIRED', 'CONSENT_EXPIRED'].includes(errorCode(e)))
            throw e;
          failed++;
          const retryAt = new Date(
            +this.now() +
              Math.max(
                60,
                e instanceof OpenFinanceError ? e.retryAfterSeconds : 60,
              ) *
                1000,
          ).toISOString();
          if (!nextRetryAt || retryAt > nextRetryAt) nextRetryAt = retryAt;
          // Failed accounts retain their entire previous snapshot/cursor. Never publish half a page.
          if (next.accounts.some((a) => a.id === account.id))
            next.sync = [
              ...next.sync.filter((s) => s.accountId !== account.id),
              {
                connectionId,
                accountId: account.id,
                cursor: oldState?.cursor ?? null,
                errorCode: errorCode(e),
                nextRetryAt: retryAt,
              },
            ];
        }
      }
      next.connections[index] = {
        ...consent,
        status: failed ? 'error' : 'connected',
        lastSyncAt: at,
        lastSuccessfulSyncAt: failed ? connection.lastSuccessfulSyncAt : at,
        updatedAt: at,
        errorCode: failed ? 'PARTIAL_SYNC' : null,
        nextRetryAt,
      };
    } catch (e) {
      const code = errorCode(e);
      next = structuredClone(source);
      next.connections[index] = {
        ...connection,
        status:
          code === 'CONSENT_EXPIRED'
            ? 'expired'
            : code === 'AUTH_REQUIRED'
              ? 'reauthorization_required'
              : 'error',
        consentStatus:
          code === 'CONSENT_EXPIRED' ? 'expired' : connection.consentStatus,
        lastSyncAt: at,
        updatedAt: at,
        errorCode: code,
        nextRetryAt: new Date(
          +this.now() +
            Math.max(
              60,
              e instanceof OpenFinanceError ? e.retryAfterSeconds : 60,
            ) *
              1000,
        ).toISOString(),
      };
    } finally {
      this.running.delete(connectionId);
    }
    return validateOpenFinance(next);
  }
}
