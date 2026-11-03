import { el } from '../dom';
import { icon, type IconName } from '../icons';

export type BannerKind = 'info' | 'warning' | 'danger' | 'offline';

const BANNER_ICONS: Readonly<Record<BannerKind, IconName>> = {
  info: 'info',
  warning: 'triangle-alert',
  danger: 'circle-x',
  offline: 'wifi-off',
};

export function createBanner(kind: BannerKind, text: string): HTMLDivElement {
  return el(
    'div',
    {
      className: `banner banner--${kind}`,
      attrs: { role: kind === 'danger' ? 'alert' : 'status' },
    },
    icon(BANNER_ICONS[kind]),
    el('span', { text }),
  );
}
