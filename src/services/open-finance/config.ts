// Configurações específicas da integração com Pluggy
export const PLUGGY_CONFIG = {
  baseUrl: 'https://api.pluggy.ai',
  environment: import.meta.env.VITE_OPEN_FINANCE_ENV || 'sandbox',
};

// Tipos de instituições suportadas
export const SUPPORTED_INSTITUTIONS = [
  { id: 'bradesco', name: 'Bradesco' },
  { id: 'itaú', name: 'Itaú' },
  { id: 'santander', name: 'Santander' },
];

// Configurações de sincronização
export const SYNC_CONFIG = {
  batchSize: 100, // número máximo de transações por página
  maxRetries: 3,
  timeoutMs: 30000,
};
