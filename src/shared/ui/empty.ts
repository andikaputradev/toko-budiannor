import { el } from '../dom';
import { icon, type IconName } from '../icons';

export interface EmptyStateOptions {
  readonly icon: IconName;
  readonly title: string;
  readonly action?: HTMLElement;
}

export function createEmptyState(options: EmptyStateOptions): HTMLDivElement {
  return el(
    'div',
    { className: 'empty' },
    icon(options.icon),
    el('p', { className: 'empty__title', text: options.title }),
    options.action,
  );
}
