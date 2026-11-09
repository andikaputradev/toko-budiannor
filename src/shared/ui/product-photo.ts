import { categoryPhoto } from '../../apps/pos/domain/catalog-view';
import type { Product } from '../data/types';
import { el } from '../dom';
import { icon } from '../icons';
import { label } from '../messages';

export type PhotoSize = 'sm' | 'md' | 'lg';

const SIZES: Readonly<Record<PhotoSize, { readonly width: number; readonly height: number }>> = {
  sm: { width: 56, height: 56 },
  md: { width: 88, height: 88 },
  lg: { width: 132, height: 112 },
};

export function productPhotoUrl(product: Product): string | undefined {
  const url = product.photoUrl ?? categoryPhoto(product.category);
  return url === undefined ? undefined : `${import.meta.env.BASE_URL}${url}`;
}

export interface PhotoOptions {
  /** Bila diisi, foto menjadi tombol yang memanggil fungsi ini (untuk memperbesar). */
  readonly onZoom?: (() => void) | undefined;
}

// Foto barang: foto sendiri, lalu foto kategori, lalu kotak placeholder bergambar ikon.
export function createProductPhoto(
  product: Product,
  size: PhotoSize,
  options: PhotoOptions = {},
): HTMLElement {
  const { width, height } = SIZES[size];
  const url = productPhotoUrl(product);
  const picture =
    url === undefined
      ? el('span', { className: `mob-photo mob-photo--${size} mob-photo--empty` }, icon('package'))
      : el('img', {
          className: `mob-photo mob-photo--${size}`,
          attrs: {
            src: url,
            alt: '',
            width: String(width),
            height: String(height),
            loading: 'lazy',
          },
        });
  const onZoom = options.onZoom;
  if (onZoom === undefined) {
    return picture;
  }
  const button = el(
    'button',
    {
      className: `mob-photo-button mob-photo-button--${size}`,
      attrs: { type: 'button', 'aria-label': label('perbesarFoto', { nama: product.name }) },
    },
    picture,
    el('span', { className: 'mob-photo-button__zoom' }, icon('zoom-in')),
  );
  button.addEventListener('click', onZoom);
  return button;
}
