import { el } from '../../../shared/dom';
import { formatDecimal } from '../../../shared/format';
import { label, type LabelKey } from '../../../shared/messages';
import type { Product } from '../../../shared/data/types';
import { fromBase } from '../../../shared/data/units';
import { openModal } from '../../../shared/ui/modal';
import { stockLines, type StockKey } from '../domain/catalog-view';

const LOCATION_LABELS: Readonly<Record<StockKey, LabelKey>> = {
  toko: 'stokToko',
  gudang: 'stokGudang',
  po: 'stokPo',
};

// Lembar Cek Stok Barang: stok Toko, Gudang, dan PO dalam setiap satuan jual barang.
export function openStockSheet(product: Product): void {
  const head = el(
    'tr',
    {},
    el('th', { text: label('lokasiStok'), attrs: { scope: 'col' } }),
    ...product.units.map((unit) => el('th', { text: unit.code, attrs: { scope: 'col' } })),
  );
  const rows = stockLines(product).map((line) =>
    el(
      'tr',
      {},
      el('th', { text: label(LOCATION_LABELS[line.key]), attrs: { scope: 'row' } }),
      ...product.units.map((unit) =>
        el('td', {
          text:
            line.quantity === undefined
              ? '-'
              : formatDecimal(fromBase(product, unit.code, line.quantity), 3, 1),
        }),
      ),
    ),
  );
  openModal({
    title: label('cekStokBarang'),
    body: el(
      'div',
      { className: 'pos-stock' },
      el('p', { className: 'pos-stock__name t-section-title', text: product.name }),
      el(
        'div',
        { className: 'pos-stock__scroll' },
        el(
          'table',
          { className: 'pos-stock__table' },
          el('thead', {}, head),
          el('tbody', {}, ...rows),
        ),
      ),
    ),
    actions: [{ text: label('tutup'), variant: 'secondary' }],
  });
}
