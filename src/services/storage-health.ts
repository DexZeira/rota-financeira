export const STORAGE_THRESHOLDS = {
  attention: 80,
  warning: 90,
  critical: 95,
} as const;
export function quotaHealth(usage?: number, quota?: number) {
  const percent =
    Number.isFinite(usage) &&
    Number.isFinite(quota) &&
    usage! >= 0 &&
    quota! > 0
      ? (usage! / quota!) * 100
      : null;
  return {
    usage: percent === null ? null : usage!,
    quota: percent === null ? null : quota!,
    percent,
    level:
      percent === null
        ? 'unknown'
        : percent >= 95
          ? 'critical'
          : percent >= 90
            ? 'warning'
            : percent >= 80
              ? 'attention'
              : 'normal',
  };
}
export async function storageHealth() {
  try {
    const estimate = await navigator.storage?.estimate();
    return quotaHealth(estimate?.usage, estimate?.quota);
  } catch {
    return quotaHealth();
  }
}
