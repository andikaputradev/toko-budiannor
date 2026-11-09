import { el, type Child } from '../dom';
import { icon, type IconName } from '../icons';

export type MobTone = 'netral' | 'sukses' | 'peringatan' | 'info' | 'bahaya';

export interface MobCardOptions {
  readonly tone?: MobTone | undefined;
  readonly title?: string | undefined;
  readonly iconName?: IconName | undefined;
  readonly action?: { readonly text: string; readonly onClick: () => void } | undefined;
  readonly className?: string | undefined;
  readonly body: readonly Child[];
}

// Kartu bernada (netral, sukses, peringatan, info, bahaya) dengan judul dan tautan aksi opsional.
export function createMobCard(options: MobCardOptions): HTMLElement {
  const tone = options.tone ?? 'netral';
  const action = options.action;
  const link =
    action === undefined
      ? false
      : el('button', {
          className: 'mob-card__action',
          text: action.text,
          attrs: { type: 'button' },
        });
  if (link !== false && action !== undefined) {
    link.addEventListener('click', action.onClick);
  }
  const head =
    options.title === undefined
      ? false
      : el(
          'div',
          { className: 'mob-card__head' },
          el(
            'h2',
            { className: 'mob-card__title' },
            options.iconName === undefined ? false : icon(options.iconName),
            el('span', { text: options.title }),
          ),
          link,
        );
  return el(
    'section',
    {
      className: ['mob-card', `mob-card--${tone}`, options.className]
        .filter((part): part is string => part !== undefined)
        .join(' '),
    },
    head,
    ...options.body,
  );
}

// Inisial untuk avatar: dua huruf dari dua kata pertama, atau dua huruf pertama satu kata.
export function initialsOf(name: string): string {
  const words = name
    .replace(/^(bapak|ibu|pak|bu)\s+/i, '')
    .split(/\s+/)
    .filter((word) => word !== '');
  const first = words[0] ?? '';
  const second = words[1];
  const letters =
    second === undefined ? first.slice(0, 2) : `${first.charAt(0)}${second.charAt(0)}`;
  return letters.toUpperCase();
}

export function createAvatar(initials: string): HTMLElement {
  return el('span', { className: 'mob-avatar', text: initials, attrs: { 'aria-hidden': 'true' } });
}

export function createMobBadge(text: string, tone: MobTone, iconName?: IconName): HTMLElement {
  return el(
    'span',
    { className: `mob-badge mob-badge--${tone}` },
    iconName === undefined ? false : icon(iconName),
    el('span', { text }),
  );
}
