import type { Product, Tier } from '../data/types';
import { el } from '../dom';
import { icon } from '../icons';
import { formatDecimal } from '../format';
import { label } from '../messages';
import { warehouseTone } from '../domain/product-view';
import { createButton } from './button';
import { openModal, type ModalHandle } from './modal';
import { createMobBadge } from './mobile-card';
import { productPhotoUrl } from './product-photo';
import { createTierTable } from './tier-table';

export interface PhotoViewerOptions {
  readonly product: Product;
  readonly tier?: Tier | undefined;
  /** Konten tambahan di bawah rincian, misalnya tombol aksi. */
  readonly extra?: Node | undefined;
}

const ZOOM_STEPS = [1, 2, 3] as const;

// Penampil foto barang: foto besar yang dapat diperbesar, lalu rincian, stok, dan harga bertingkat.
export function openPhotoViewer(options: PhotoViewerOptions): ModalHandle {
  const { product } = options;
  const url = productPhotoUrl(product);
  let zoom = 0;
  const stage = el('div', { className: 'mob-viewer__stage' });
  const picture =
    url === undefined
      ? el('span', { className: 'mob-viewer__empty' }, icon('package'))
      : el('img', {
          className: 'mob-viewer__image',
          attrs: { src: url, alt: product.name, width: '480', height: '360' },
        });
  stage.append(picture);
  const zoomIn = createButton({
    text: label('perbesar'),
    variant: 'secondary',
    icon: 'zoom-in',
  });
  const zoomOut = createButton({
    text: label('perkecil'),
    variant: 'secondary',
    icon: 'zoom-out',
  });
  const paint = (): void => {
    stage.dataset['zoom'] = String(ZOOM_STEPS[zoom]);
    zoomOut.disabled = zoom === 0;
    zoomIn.disabled = zoom === ZOOM_STEPS.length - 1;
  };
  zoomIn.addEventListener('click', () => {
    zoom = Math.min(ZOOM_STEPS.length - 1, zoom + 1);
    paint();
  });
  zoomOut.addEventListener('click', () => {
    zoom = Math.max(0, zoom - 1);
    paint();
  });
  paint();
  const stock = (key: 'display' | 'besar'): HTMLElement =>
    el(
      'div',
      { className: 'mob-viewer__stock' },
      el('span', {
        className: 't-label',
        text: label(key === 'display' ? 'stokToko' : 'stokGudang'),
      }),
      createMobBadge(
        `${formatDecimal(product.stock[key], 3, 0)} ${product.baseUnit}`,
        warehouseTone(product, key) === 'bahaya'
          ? 'bahaya'
          : warehouseTone(product, key) === 'peringatan'
            ? 'peringatan'
            : 'sukses',
      ),
    );
  const body = el(
    'div',
    { className: 'mob-viewer' },
    stage,
    el('div', { className: 'mob-viewer__controls' }, zoomOut, zoomIn),
    el('p', { className: 'mob-viewer__name', text: product.name }),
    el(
      'dl',
      { className: 'mob-viewer__facts' },
      el('dt', { text: label('kodeBarang') }),
      el('dd', { text: product.code }),
      el('dt', { text: label('merkBarang') }),
      el('dd', { text: product.brand }),
      el('dt', { text: label('kategoriBarang') }),
      el('dd', { text: product.category }),
    ),
    el('div', { className: 'mob-viewer__stocks' }, stock('display'), stock('besar')),
    createTierTable(product, { highlight: options.tier }),
    options.extra,
  );
  const handle = openModal({
    title: product.name,
    body,
    actions: [{ text: label('tutup'), variant: 'secondary' }],
  });
  handle.dialog.classList.add('mob-viewer-dialog');
  return handle;
}
