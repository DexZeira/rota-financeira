import type { OpenFinanceProvider } from './provider';
import type {
  AccountBalance,
  ConnectedAccount,
  Connection,
  Institution,
  RemoteTransaction,
} from './types';
import { OpenFinanceError } from './errors';

export class PluggyOpenFinanceProvider implements OpenFinanceProvider {
  readonly name = 'pluggy';
  readonly stableCursor = true;

  constructor(
    private readonly baseUrl = 'https://api.pluggy.ai',
    private readonly clientId: string,
    private readonly clientSecret: string,
    private readonly now = () => new Date(),
  ) {}

  // Para testes
  async listInstitutions(): Promise<Institution[]> {
    // Esta implementação é temporária e será substituída pelo backend seguro
    const institutions = [
      { id: 'bradesco', name: 'Bradesco' },
      { id: 'itaú', name: 'Itaú' },
      { id: 'santander', name: 'Santander' },
    ];
    // Em produção real, seria chamada a API da Pluggy
    return institutions;
  }

  async createConnection(_userId: string, _institution: Institution): Promise<Connection> {
    // Esta implementação deve ser feita via Edge Function no Supabase
    throw new OpenFinanceError('PROVIDER_ERROR');
  }

  async authorize(_connection: Connection, _userId: string): Promise<Connection> {
    // Esta implementação deve ser feita via Edge Function no Supabase.
    throw new OpenFinanceError('PROVIDER_ERROR');
  }

  async getConsent(_connection: Connection, _userId: string): Promise<Connection> {
    // Esta implementação deve ser feita via Edge Function no Supabase
    throw new OpenFinanceError('PROVIDER_ERROR');
  }

  async revokeConsent(_connection: Connection, _userId: string): Promise<Connection> {
    // Esta implementação deve ser feita via Edge Function no Supabase
    throw new OpenFinanceError('PROVIDER_ERROR');
  }

  async listAccounts(
    _connection: Connection,
    _userId: string,
  ): Promise<ConnectedAccount[]> {
    // Esta implementação deve ser feita via Edge Function no Supabase
    throw new OpenFinanceError('PROVIDER_ERROR');
  }

  async getBalance(
    _account: ConnectedAccount,
    _connection: Connection,
    _userId: string,
  ): Promise<AccountBalance> {
    // Esta implementação deve ser feita via Edge Function no Supabase.
    throw new OpenFinanceError('PROVIDER_ERROR');
  }

  async getTransactions(
    _account: ConnectedAccount,
    _connection: Connection,
    _userId: string,
    _options: { since: string; cursor: string | null },
  ): Promise<{
    items: RemoteTransaction[];
    nextPage: string | null;
    cursor: string | null;
  }> {
    // Esta implementação deve ser feita via Edge Function no Supabase
    throw new OpenFinanceError('PROVIDER_ERROR');
  }
}
