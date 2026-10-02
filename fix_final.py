with open('src/components/connected-accounts.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Add the missing imports at the top
old_imports = '''import { useMemo, useState, useSyncExternalStore } from 'react';
import { categories, money, type Data } from '../model';
import {
  emptyOpenFinance,
  type Connection,
  type Institution,
} from '../services/open-finance/types';
import { MockOpenFinanceProvider } from '../services/open-finance/mock-provider';
import { OpenFinanceSyncService } from '../services/open-finance/sync';
import { errorCode, errorMessage } from '../services/open-finance/errors';
import {
  reconcileTransfer,
  deleteConnectionData,
  reconcileRemote,
  reviewTransactions,
} from '../services/open-finance/reconciliation';
import type { Review } from '../services/import/types';
import { recordDiagnostic } from '../services/app-diagnostics';
import { transactionPage } from '../services/open-finance/state';
import { createOpenFinanceProvider } from '../services/open-finance/provider.factory';'''

new_imports = '''import { useMemo, useState, useSyncExternalStore } from 'react';
import { categories, money, type Data } from '../model';
import {
  emptyOpenFinance,
  type Connection,
  type Institution,
} from '../services/open-finance/types';
import { MockOpenFinanceProvider } from '../services/open-finance/mock-provider';
import { OpenFinanceSyncService } from '../services/open-finance/sync';
import { errorCode, errorMessage } from '../services/open-finance/errors';
import {
  reconcileTransfer,
  deleteConnectionData,
  reconcileRemote,
  reviewTransactions,
} from '../services/open-finance/reconciliation';
import type { Review } from '../services/import/types';
import { recordDiagnostic } from '../services/app-diagnostics';
import { transactionPage } from '../services/open-finance/state';
import { createOpenFinanceProvider } from '../services/open-finance/provider.factory';
import { supabase } from '../services/supabase';
import {
  listMeuPluggyItems,
  connectMeuPluggyItem,
  type MeuPluggyItem,
  type OpenFinanceFunctionsClient,
} from '../services/open-finance/widget';'''

content = content.replace(old_imports, new_imports)

# 2. Update the provider selection logic
old_provider = '''  const mode = import.meta.env.VITE_OPEN_FINANCE_MODE || 'disabled';
  const realEnabled = import.meta.env.OPEN_FINANCE_REAL_ENABLED === 'true';
  // Selecionar provider com base na configuração
  const provider = useMemo(() => {
    if (mode === 'mock') {
      return new MockOpenFinanceProvider();
    } else if (realEnabled && mode === 'sandbox') {
      return createOpenFinanceProvider();
    }    return new MockOpenFinanceProvider();
  }, [mode, realEnabled]);'''

new_provider = '''  const mode = import.meta.env.VITE_OPEN_FINANCE_MODE || 'disabled';
  const realEnabled = import.meta.env.OPEN_FINANCE_REAL_ENABLED === 'true';
  const meuPluggyEnabled = import.meta.env.VITE_MEU_PLUGGY_ENABLED === 'true';
  const traditionalOpenFinanceEnabled = realEnabled && (mode === 'sandbox' || mode === 'production');
  const bankingIntegrationEnabled = traditionalOpenFinanceEnabled || meuPluggyEnabled;
  // Selecionar provider com base na configuração
  const provider = useMemo(() => {
    if (mode === 'mock') {
      return new MockOpenFinanceProvider();
    } else if (traditionalOpenFinanceEnabled) {
      return createOpenFinanceProvider();
    }    return new MockOpenFinanceProvider();
  }, [traditionalOpenFinanceEnabled]);'''

content = content.replace(old_provider, new_provider)

# 3. Replace the early returns with conditional rendering in main return
# First, remove the existing early returns and the mock return
old_early_returns = '''}
  if (mode !== 'mock')
    return (
      <p>
        Integração bancária desabilitada. Provider real e ambiente sandbox ainda
        não configurados. A importação CSV/OFX continua disponível.
      </p>
    );
  return ('''

new_early_returns = '''}

  // Early return only when banking integration is completely disabled
  if (!bankingIntegrationEnabled)
    return (
      <p>
        Integração bancária desabilitada. Provider real e ambiente sandbox ainda
        não configurados. A importação CSV/OFX continua disponível.
      </p>
    );

  // Main return with conditional rendering for Meu Pluggy vs traditional
  if (mode === 'mock') {
    // Mock mode - show demo UI with both options
  } else if (!traditionalOpenFinanceEnabled && meuPluggyEnabled) {
    // Only Meu Pluggy available
  } else {
    // Traditional Open Finance available (with or without Meu Pluggy)
  }

  return ('''

content = content.replace(old_early_returns, new_early_returns)

with open('src/components/connected-accounts.tsx', 'w', encoding='utf-8') as f:
    f.write(content)

print('Step 1 done - imports and provider logic updated')