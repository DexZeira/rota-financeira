import type { MouseEvent } from 'react';

/** Keeps native editing and validation; date picking is a progressive enhancement. */
export function openDatePicker(event: MouseEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    if (event.defaultPrevented || input.type !== 'date' || input.disabled || input.readOnly) return;
    try {
      input.showPicker?.();
    } catch {
      // Unsupported/restricted pickers retain native keyboard and icon interaction.
    }
}
