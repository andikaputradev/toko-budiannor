export const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

export interface FocusTarget {
  focus(): void;
}

export interface TabEvent {
  readonly key: string;
  readonly shiftKey: boolean;
  preventDefault(): void;
}

export function cycleIndex(current: number, length: number, backwards: boolean): number {
  if (length <= 0) {
    return -1;
  }
  if (current < 0 || current >= length) {
    return backwards ? length - 1 : 0;
  }
  return backwards ? (current - 1 + length) % length : (current + 1) % length;
}

export function isEscape(event: { readonly key: string }): boolean {
  return event.key === 'Escape' || event.key === 'Esc';
}

export function trapTab(
  event: TabEvent,
  targets: readonly FocusTarget[],
  active: unknown,
): boolean {
  if (event.key !== 'Tab') {
    return false;
  }
  event.preventDefault();
  const current = targets.findIndex((target) => target === active);
  targets[cycleIndex(current, targets.length, event.shiftKey)]?.focus();
  return true;
}
