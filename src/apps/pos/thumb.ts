import { el } from '../../shared/dom';
import type { Product } from '../../shared/data/types';
import { label } from '../../shared/messages';
import { categoryPhoto } from './domain/catalog-view';

export type ThumbSize = 'sm' | 'md' | 'lg';

const SIZES: Readonly<Record<ThumbSize, { readonly width: number; readonly height: number }>> = {
  sm: { width: 48, height: 48 },
  md: { width: 160, height: 96 },
  lg: { width: 176, height: 144 },
};

// Hanya lima pengguna kasir yang punya avatar; sales lapangan tidak memakai layar POS.
const AVATAR_USERS: ReadonlySet<string> = new Set(['U-1', 'U-2', 'U-3', 'U-4', 'U-5']);

export function avatarUrl(userId: string): string | undefined {
  return AVATAR_USERS.has(userId) ? `avatar/${userId}.svg` : undefined;
}

// Foto barang: foto sendiri (barang proposal), lalu foto kategori, lalu kotak placeholder.
export function createProductThumb(product: Product, size: ThumbSize): HTMLElement {
  const url = product.photoUrl ?? categoryPhoto(product.category);
  const { width, height } = SIZES[size];
  if (url === undefined) {
    return el('span', {
      className: `pos-photo pos-photo--${size}`,
      text: size === 'sm' ? '' : label('fotoProduk'),
    });
  }
  return el('img', {
    className: `pos-photo pos-photo--img pos-photo--${size}`,
    attrs: {
      src: `${import.meta.env.BASE_URL}${url}`,
      alt: '',
      width: String(width),
      height: String(height),
      loading: 'lazy',
    },
  });
}
