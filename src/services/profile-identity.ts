import type { Row } from '../model';

type ProfileUser = {
  email?: string;
  user_metadata?: Record<string, unknown>;
} | null;

export function profileName(settings: Row, user: ProfileUser): string {
  const configured =
    typeof settings.profileName === 'string' ? settings.profileName.trim() : '';
  if (configured) return configured;
  for (const value of [
    user?.user_metadata?.full_name,
    user?.user_metadata?.name,
  ]) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  const localName = user?.email
    ?.split('@')[0]
    ?.replace(/[._-]+/g, ' ')
    .trim();
  return localName
    ? localName.replace(/(^|\s)\p{L}/gu, (letter) =>
        letter.toLocaleUpperCase('pt-BR'),
      )
    : 'Seu perfil';
}

export function profileInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  return (
    [words[0]?.[0], words.length > 1 ? words.at(-1)?.[0] : undefined]
      .filter(Boolean)
      .join('')
      .toLocaleUpperCase('pt-BR') || 'RF'
  );
}
