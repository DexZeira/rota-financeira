import type { ErrorCode } from './types';
export class OpenFinanceError extends Error {
  constructor(
    public readonly code: ErrorCode,
    public readonly retryAfterSeconds = 60,
  ) {
    super(code);
  }
}
export const errorCode = (error: unknown): ErrorCode =>
  error instanceof OpenFinanceError ? error.code : 'PROVIDER_ERROR';
export const errorMessage: Record<ErrorCode, string> = {
  AUTH_REQUIRED: 'Renove a autorização para continuar.',
  CONSENT_EXPIRED: 'O acesso expirou. Reconecte a instituição.',
  RATE_LIMITED: 'A fonte pediu uma pausa. Aguarde antes de tentar novamente.',
  NETWORK_ERROR: 'Sem conexão — exibindo dados da última sincronização.',
  PROVIDER_ERROR:
    'A fonte está indisponível. Seus dados anteriores foram preservados.',
  PARTIAL_SYNC: 'Algumas contas não puderam ser atualizadas.',
  INVALID_RESPONSE:
    'A fonte enviou dados incompatíveis. Nenhum dado dessa conta foi aplicado.',
};
