import type { Product, Tier } from '../data/types';
import { TIERS } from '../data/types';
import { el } from '../dom';
import { formatDecimal, formatRupiah } from '../format';
import { tierRows } from '../domain/product-view';
import { label, type LabelKey } from '../messages';

const TIER_LABEL: Readonly<Record<Tier, LabelKey>> = {
  eceran: 'tierEceran',
  grosir: 'tierGrosir',
  kontraktor: 'tierKontraktor',
};

// Tabel harga bertingkat: satu baris per satuan jual, satu kolom per tier. `highlight` menyorot tier.
export function createTierTable(
  product: Product,
  options: { readonly highlight?: Tier | undefined } = {},
): HTMLElement {
  const active = (tier: Tier): string => (options.highlight === tier ? 'true' : 'false');
  const table = el(
    'table',
    { className: 'mob-tier' },
    el('caption', { className: 'visually-hidden', text: label('hargaBertingkat') }),
    el(
      'thead',
      {},
      el(
        'tr',
        {},
        el('th', { text: label('kolomSatuanJual'), attrs: { scope: 'col' } }),
        ...TIERS.map((tier) =>
          el('th', {
            className: 'is-end',
            text: label(TIER_LABEL[tier]),
            attrs: { scope: 'col', 'data-active': active(tier) },
          }),
        ),
      ),
    ),
    el(
      'tbody',
      {},
      ...tierRows(product).map((row) =>
        el(
          'tr',
          {},
          el(
            'th',
            { attrs: { scope: 'row' } },
            el('strong', { text: row.unit }),
            row.factor === 1
              ? false
              : el('small', {
                  className: 'mob-tier__factor',
                  text: label('satuanSama', {
                    faktor: formatDecimal(row.factor),
                    dasar: product.baseUnit,
                  }),
                }),
          ),
          ...TIERS.map((tier) =>
            el('td', {
              className: 'is-end',
              text: formatRupiah(row.prices[tier]),
              attrs: { 'data-active': active(tier) },
            }),
          ),
        ),
      ),
    ),
  );
  // Harga Rupiah tidak boleh dipotong atau meluapkan lembar pada layar sempit (320 px): tabel
  // menggulir ke samping di dalam wadahnya, yang dapat difokus agar terjangkau papan ketik.
  return el(
    'div',
    {
      className: 'mob-tier-scroll',
      attrs: { role: 'region', tabindex: '0', 'aria-label': label('hargaBertingkat') },
    },
    table,
  );
}
