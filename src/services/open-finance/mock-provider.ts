import type { OpenFinanceProvider } from './provider';
import type {
  AccountBalance,
  ConnectedAccount,
  Connection,
  ErrorCode,
  Institution,
  RemoteTransaction,
} from './types';
import { OpenFinanceError } from './errors';
import { normalizedTransaction } from '../import/transaction-normalizer';

export class MockOpenFinanceProvider implements OpenFinanceProvider {
  readonly name = 'mock';
  readonly stableCursor = true;
  constructor(
    private readonly now = () => new Date(),
    public failure: ErrorCode | null = null,
  ) {}
  private check(c: Connection, owner: string) {
    if (c.userId !== owner || c.provider !== this.name)
      throw new OpenFinanceError('AUTH_REQUIRED');
    if (this.failure) throw new OpenFinanceError(this.failure);
  }
  async listInstitutions(): Promise<Institution[]> {
    return [
      { id: 'demo-bank', name: 'Instituição demonstração' },
      { id: 'demo-credit', name: 'Cooperativa demonstração' },
    ];
  }
  async createConnection(
    userId: string,
    institution: Institution,
  ): Promise<Connection> {
    if (
      !(await this.listInstitutions()).some(
        (i) => i.id === institution.id && i.name === institution.name,
      )
    )
      throw new OpenFinanceError('INVALID_RESPONSE');
    const date = this.now().toISOString();
    return {
      id: crypto.randomUUID(),
      userId,
      provider: this.name,
      institutionId: institution.id,
      institutionName: institution.name,
      status: 'pending_authorization',
      consentId: crypto.randomUUID(),
      consentStatus: 'pending',
      createdAt: date,
      updatedAt: date,
      expiresAt: null,
      lastSyncAt: null,
      lastSuccessfulSyncAt: null,
      errorCode: null,
      nextRetryAt: null,
    };
  }
  async authorize(c: Connection, owner: string): Promise<Connection> {
    this.check(c, owner);
    return {
      ...c,
      status: 'connected',
      consentStatus: 'authorized',
      updatedAt: this.now().toISOString(),
      expiresAt: new Date(+this.now() + 90 * 86400000).toISOString(),
      errorCode: null,
      nextRetryAt: null,
    };
  }
  async getConsent(c: Connection, owner: string): Promise<Connection> {
    this.check(c, owner);
    if (
      c.expiresAt &&
      Date.parse(c.expiresAt) <= +this.now() &&
      c.consentStatus !== 'revoked'
    )
      return { ...c, status: 'expired', consentStatus: 'expired' };
    return { ...c };
  }
  async revokeConsent(c: Connection, owner: string): Promise<Connection> {
    this.check(c, owner);
    return {
      ...c,
      status: 'revoked',
      consentStatus: 'revoked',
      updatedAt: this.now().toISOString(),
    };
  }
  async listAccounts(
    c: Connection,
    owner: string,
  ): Promise<ConnectedAccount[]> {
    this.check(c, owner);
    if ((await this.getConsent(c, owner)).consentStatus !== 'authorized')
      throw new OpenFinanceError('CONSENT_EXPIRED');
    return [
      {
        id: c.id + ':checking',
        connectionId: c.id,
        externalAccountId: 'checking',
        institutionId: c.institutionId,
        name: 'Conta demonstração',
        type: 'checking',
        currency: 'BRL',
        maskedNumber: '•••• 1234',
        active: true,
      },
    ];
  }
  async getBalance(
    a: ConnectedAccount,
    c: Connection,
    owner: string,
  ): Promise<AccountBalance> {
    this.check(c, owner);
    if (a.connectionId !== c.id || c.consentStatus !== 'authorized')
      throw new OpenFinanceError('AUTH_REQUIRED');
    if (this.failure) throw new OpenFinanceError(this.failure);
    return {
      accountId: a.id,
      available: 250000,
      current: 250000,
      currency: 'BRL',
      asOf: this.now().toISOString(),
    };
  }
  async getTransactions(
    a: ConnectedAccount,
    c: Connection,
    owner: string,
    options: { since: string; cursor: string | null },
  ): Promise<{
    items: RemoteTransaction[];
    nextPage: string | null;
    cursor: string | null;
  }> {
    if (this.failure) throw new OpenFinanceError(this.failure);
    this.check(c, owner);
    if (a.connectionId !== c.id || c.consentStatus !== 'authorized')
      throw new OpenFinanceError('AUTH_REQUIRED');
    const date = this.now().toISOString().slice(0, 10);
    const items: RemoteTransaction[] =
      options.cursor === 'mock-v1' || date < options.since
        ? []
        : [
            {
              id: a.id + ':tx-1',
              connectionId: a.connectionId,
              accountId: a.id,
              transaction: normalizedTransaction({
                line: 1,
                externalId: 'tx-1',
                date,
                description: 'Compra demonstração',
                normalizedDescription: '',
                amountCents: 4590,
                direction: 'debit',
                accountLabel: a.name,
                accountId: a.id,
                document: '',
                source: 'open_finance',
              }),
              status: 'posted',
              kind: 'normal',
              replacesId: null,
              reviewed: false,
              importLinkId: null,
            },
          ];
    return { items, nextPage: null, cursor: 'mock-v1' };
  }
}
