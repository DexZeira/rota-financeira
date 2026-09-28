import type {
  AccountBalance,
  ConnectedAccount,
  Connection,
  Institution,
  RemoteTransaction,
} from './types';
// Frontend-facing boundary. Real adapters call an authenticated backend; credentials never cross this interface.
export interface OpenFinanceProvider {
  readonly name: string;
  readonly stableCursor: boolean;
  listInstitutions(): Promise<Institution[]>;
  createConnection(
    userId: string,
    institution: Institution,
  ): Promise<Connection>;
  authorize(connection: Connection, userId: string): Promise<Connection>;
  getConsent(connection: Connection, userId: string): Promise<Connection>;
  revokeConsent(connection: Connection, userId: string): Promise<Connection>;
  listAccounts(
    connection: Connection,
    userId: string,
  ): Promise<ConnectedAccount[]>;
  getBalance(
    account: ConnectedAccount,
    connection: Connection,
    userId: string,
  ): Promise<AccountBalance>;
  getTransactions(
    account: ConnectedAccount,
    connection: Connection,
    userId: string,
    options: { since: string; cursor: string | null },
  ): Promise<{
    items: RemoteTransaction[];
    nextPage: string | null;
    cursor: string | null;
  }>;
}
