import type { Product } from '../data/types';
import { el } from '../dom';
import { icon } from '../icons';
import { mt } from '../mobile-text';
import { openModal, type ModalHandle } from './modal';
import { productPhotoUrl } from './product-photo';

export interface PhotoViewerOptions {
  readonly product: Product;
}

// Layar "Gambar Produk": tombol X, nama barang, gambar penuh, dan penghitung "1/1".
// Sengaja tanpa stok, harga, atau rincian lain (Owner dan Sales sama).
export function openPhotoViewer(options: PhotoViewerOptions): ModalHandle {
  const { product } = options;
  const url = productPhotoUrl(product);
  const picture =
    url === undefined
      ? el('span', { className: 'mob-gallery__empty' }, icon('package'))
      : el('img', {
          className: 'mob-gallery__image',
          attrs: { src: url, alt: product.name, width: '480', height: '480' },
        });
  const close = el(
    'button',
    {
      className: 'mob-gallery__close',
      attrs: { type: 'button', 'aria-label': mt('tutupGambar') },
    },
    icon('x'),
  );
  const body = el(
    'div',
    { className: 'mob-gallery' },
    close,
    el('p', { className: 'mob-gallery__name', text: product.name }),
    el('div', { className: 'mob-gallery__stage' }, picture),
    el('p', { className: 'mob-gallery__count', text: mt('gambarKe', { nomor: 1, total: 1 }) }),
  );
  const handle = openModal({ title: mt('gambarProduk'), body, actions: [] });
  handle.dialog.classList.add('mob-gallery-dialog');
  close.addEventListener('click', () => {
    handle.close();
  });
  close.focus();
  return handle;
}
