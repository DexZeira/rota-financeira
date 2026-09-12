export function authErrorDetails(error: unknown, sensitive: string[] = []) {
  const source =
    error && typeof error === 'object'
      ? (error as Record<string, unknown>)
      : {};
  let message =
    typeof source.message === 'string'
      ? source.message
      : typeof error === 'string'
        ? error
        : '';
  for (const value of sensitive.filter(Boolean))
    message = message.split(value).join('[oculto]');
  message = message.replace(
    /(?:sb_secret_|sb_publishable_)[A-Za-z0-9_-]+|eyJ[A-Za-z0-9_.-]+/g,
    '[oculto]',
  );
  return {
    message,
    code: typeof source.code === 'string' ? source.code : undefined,
    status: typeof source.status === 'number' ? source.status : undefined,
  };
}
export const SIGNUP_CONFIRMATION =
  'Conta criada. Enviamos um link de confirmação para seu email.';
export function authMessage(error: unknown) {
  const { message, code } = authErrorDetails(error);
  if (
    code === 'email_address_invalid' ||
    /email address.*invalid/i.test(message)
  )
    return 'Digite um email válido.';
  if (/invalid api key/i.test(message))
    return 'A chave pública do Supabase está inválida.';
  if (
    code === 'signup_disabled' ||
    /signup.*disabled|signups not allowed/i.test(message)
  )
    return 'O cadastro por email está desativado no Supabase.';
  if (code === 'invalid_credentials' || /invalid login/i.test(message))
    return 'Email ou senha incorretos.';
  if (/already registered|already been registered/i.test(message))
    return 'Este email já está cadastrado.';
  if (/email not confirmed/i.test(message))
    return 'Confirme seu email pelo link enviado antes de entrar.';
  if (/rate limit|too many/i.test(message) || code?.includes('rate_limit'))
    return 'Muitas tentativas. Aguarde alguns minutos e tente novamente.';
  if (code === 'weak_password' || /password/i.test(message))
    return 'Senha insuficiente. Confira os requisitos nos detalhes do erro.';
  return message || 'Não foi possível concluir o cadastro.';
}
