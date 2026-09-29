import { serve } from 'https://deno.land/std@0.194.0/http/server.ts';

// Configurações do Supabase

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown error";
}
serve(async (req: Request) => {
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

    return new Response(
      JSON.stringify({ error: 'Webhook verification is not configured' }),
      { status: 503, headers: { 'Content-Type': 'application/json' } },
    );

  } catch (error) {
    console.error('Error in open-finance-webhook:', error);
    return new Response(
      JSON.stringify({        error: 'Failed to process webhook',
        details: getErrorMessage(error)
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
});
