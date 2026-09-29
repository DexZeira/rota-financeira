import { MockOpenFinanceProvider } from './mock-provider';

// O provedor Pluggy é server-side; o frontend não recebe credenciais.
export function createOpenFinanceProvider(): MockOpenFinanceProvider {
  return new MockOpenFinanceProvider();
}
