import type { Transaction } from '../import/types';

export type ConnectionStatus =
  | 'disconnected'
  | 'pending_authorization'
  | 'connected'
  | 'syncing'
  | 'expired'
  | 'revoked'
  | 'error'
  | 'reauthorization_required';
export type ErrorCode =
  | 'AUTH_REQUIRED'
  | 'CONSENT_EXPIRED'
  | 'RATE_LIMITED'
  | 'NETWORK_ERROR'
  | 'PROVIDER_ERROR'
  | 'PARTIAL_SYNC'
  | 'INVALID_RESPONSE';
export type ConsentStatus = 'pending' | 'authorized' | 'expired' | 'revoked';
export type Institution = { id: string; name: string };
export type ConnectionType = 'open_finance' | 'meu_pluggy';
export type Connection = {
  id: string;
  userId: string;
  provider: string;
  institutionId: string;
  institutionName: string;
  status: ConnectionStatus;
  consentId: string;
  consentStatus: ConsentStatus;
  createdAt: string;
  updatedAt: string;
  expiresAt: string | null;
  lastSyncAt: string | null;
  lastSuccessfulSyncAt: string | null;
  errorCode: ErrorCode | null;
  nextRetryAt?: string | null;
  externalItemId?: string | null;
  connectionType?: ConnectionType;
};
export type ConnectedAccount = {
  id: string;
  connectionId: string;
  externalAccountId: string;
  institutionId: string;
  name: string;
  type: 'checking' | 'savings' | 'payment' | 'investment' | 'other';
  currency: string;
  maskedNumber: string;
  active: boolean;
};
export type AccountBalance = {
  accountId: string;
  available: number | null;
  current: number | null;
  currency: string;
  asOf: string;
};
// Uses the Phase 5 transaction; only provenance/lifecycle lives in this link.
export type RemoteTransaction = {
  id: string;
  connectionId: string;
  accountId: string;
  transaction: Transaction;
  status: 'pending' | 'posted';
  kind: 'normal' | 'refund' | 'reversal';
  replacesId: string | null;
  reviewed: boolean;
  importLinkId: string | null;
};
export type SyncState = {
  connectionId: string;
  accountId: string;
  cursor: string | null;
  errorCode: ErrorCode | null;
  nextRetryAt: string | null;
};
export type OpenFinanceState = {
  connections: Connection[];
  accounts: ConnectedAccount[];
  balances: AccountBalance[];
  transactions: RemoteTransaction[];
  sync: SyncState[];
};
export const emptyOpenFinance = (): OpenFinanceState => ({
  connections: [],
  accounts: [],
  balances: [],
  transactions: [],
  sync: [],
});
export type Mode = 'disabled' | 'mock' | 'sandbox' | 'production';
