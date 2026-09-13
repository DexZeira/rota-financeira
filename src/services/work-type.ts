export type WorkType = 'uber' | 'cards' | 'other';

export function workTypeForActivity(activity: string): WorkType {
  if (activity === 'Entrega de cartões') return 'cards';
  if (/uber/i.test(activity)) return 'uber';
  return 'other';
}

export function activityForWorkType(type: WorkType, previous = ''): string {
  if (type === 'uber') return 'Uber Moto';
  if (type === 'cards') return 'Entrega de cartões';
  return previous === 'Uber Moto' || previous === 'Entrega de cartões' ? '' : previous;
}
