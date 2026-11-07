export const ICON_NAMES = [
  'search',
  'printer',
  'wifi-off',
  'wifi',
  'trash-2',
  'triangle-alert',
  'circle-check',
  'download',
  'x',
  'arrow-left-right',
  'banknote',
  'pause',
  'save',
  'eye',
  'eye-off',
  'info',
  'circle-x',
  'clock',
  'pencil',
  'inbox',
  'chevron-down',
  'bell',
  'refresh-cw',
  'phone',
  'message-circle',
  'send',
  'trending-up',
  'trending-down',
  'layout-dashboard',
  'package',
  'clipboard-list',
  'file-text',
  'wallet',
  'plus',
  'check',
  'chevron-left',
  'menu',
  'ellipsis-vertical',
  'scan-barcode',
  'user-round',
  'receipt',
  'log-out',
  'minus',
  'delete',
  'shopping-cart',
  'funnel',
  'users',
  'settings',
  'qr-code',
  'mail',
  'calendar',
  'image-plus',
  'paperclip',
  'lock',
  'smartphone',
  'database',
  'layout-grid',
  'list',
  'sun',
  'moon',
  'monitor',
  'arrow-left',
  'chevron-right',
  'credit-card',
] as const;

export type IconName = (typeof ICON_NAMES)[number];

const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';

export function icon(name: IconName, size: 'default' | 'table' = 'default'): SVGSVGElement {
  const svg = document.createElementNS(SVG_NAMESPACE, 'svg');
  svg.setAttribute('class', size === 'table' ? 'icon icon-table' : 'icon');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  const use = document.createElementNS(SVG_NAMESPACE, 'use');
  use.setAttribute('href', `${import.meta.env.BASE_URL}icons/sprite.svg#${name}`);
  svg.append(use);
  return svg;
}
