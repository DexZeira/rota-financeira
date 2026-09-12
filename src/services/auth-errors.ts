export function authMessage(error: unknown) {
  const message =
    error && typeof error === 'object' && 'message' in error
      ? String(error.message)
      : '';
  if (/invalid login/i.test(message)) return 'Email ou senha incorretos.';
  if (/already registered|already been registered/i.test(message))
    return 'Este email já está cadastrado.';
  if (/email not confirmed/i.test(message))
    return 'Confirme seu email pelo link enviado antes de entrar.';
  if (/rate limit|too many/i.test(message))
    return 'Muitas tentativas. Aguarde alguns minutos e tente novamente.';
  if (/password/i.test(message))
    return 'Verifique a senha. Use pelo menos 8 caracteres.';
  return 'Não foi possível concluir agora. Verifique sua conexão e tente novamente.';
}
