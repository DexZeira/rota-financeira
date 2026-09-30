import { serve } from 'https://deno.land/std@0.194.0/http/server.ts';
import { getOpenFinanceConfiguration, logOpenFinanceEvent, openFinanceErrorResponse } from '../_shared/open-finance.ts';
serve(async (req: Request) => {
  const configurationResult = getOpenFinanceConfiguration(false);
  if (!configurationResult.ok) return configurationResult.response;

  const { correlationId } = configurationResult;
  try {
    // Pluggy permite headers customizados no cadastro do webhook. A assinatura
    // usada aqui só pode ser implementada após esse contrato ser configurado.
    const signature = req.headers.get('x-pluggy-signature');
    if (!signature) {
      return new Response(
        JSON.stringify({ error: 'Missing signature' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      );
    }

    return openFinanceErrorResponse(503, correlationId);

  } catch {
    logOpenFinanceEvent('open_finance.webhook_failed', 500, correlationId);
    return openFinanceErrorResponse(500, correlationId);
  }
});
