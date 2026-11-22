import '../../../styles/mobile-sales.css';
import { el } from '../../../shared/dom';
import { formatDecimal } from '../../../shared/format';
import { label } from '../../../shared/messages';
import { mt } from '../../../shared/mobile-text';
import type { Product, WarehouseId } from '../../../shared/data/types';
import { breakdownStock } from '../../../shared/data/units';
import { preferredUnit } from '../../../shared/domain/orders';
import { stockFlag } from '../../../shared/domain/stock-browse';
import { createButton } from '../../../shared/ui/button';
import { createSelectField } from '../../../shared/ui/field';
import { openPhotoViewer } from '../../../shared/ui/image-viewer';
import { openModal } from '../../../shared/ui/modal';
import { createProductPhoto } from '../../../shared/ui/product-photo';
import { createStockBrowser } from '../../../shared/ui/stock-browser';
import { createTierTable } from '../../../shared/ui/tier-table';
import { showToast } from '../../../shared/ui/toast';
import type { SalesScreen } from './screen-type';

// Stok satu gudang dipecah ke satuan jual, mis. "2 Dus + 3 Pcs"; hijau bila ada, merah bila kosong.
function stockLine(product: Product, warehouse: WarehouseId): HTMLElement {
  const parts = breakdownStock(product, product.stock[warehouse])
    .map((part) => `${formatDecimal(part.quantity, 3, 0)} ${part.unit}`)
    .join(' + ');
  return el('p', {
    className: `stk-stock__item stk-stock__item--${stockFlag(product, warehouse)}`,
    text: mt(warehouse === 'display' ? 'stbStokToko' : 'stbStokGudang', {
      nilai:
        parts === ''
          ? `${formatDecimal(product.stock[warehouse], 3, 0)} ${product.baseUnit}`
          : parts,
    }),
  });
}

// Katalog Sales memakai tampilan yang sama dengan Stok Barang Owner, tanpa Harga Beli dan Hpp Avg.
export const renderCatalog: SalesScreen = (session, _go, _query, shell) => {
  shell.setTitle(label('stkJudul'));
  shell.setBack(undefined);

  // Lembar detail dari ketuk nama barang: foto, stok, harga, dan tombol Tambah ke Order.
  const openDetail = (product: Product): void => {
    const unit = createSelectField({
      labelText: label('kolomSatuan'),
      options: product.units.map((item) => ({ value: item.code, text: item.code })),
      value: preferredUnit(product),
    });
    const add = createButton({ text: label('tambahKeOrder'), icon: 'plus' });
    const body = el(
      'div',
      { className: 'sls-detail-sheet' },
      el(
        'div',
        { className: 'sls-detail-sheet__head' },
        createProductPhoto(product, 'lg', {
          onZoom: () => {
            openPhotoViewer({ product });
          },
        }),
        el(
          'dl',
          { className: 'sls-facts' },
          el('dt', { text: label('kodeBarang') }),
          el('dd', { text: product.code }),
          el('dt', { text: label('merkBarang') }),
          el('dd', { text: product.brand }),
          el('dt', { text: label('kategoriBarang') }),
          el('dd', { text: product.category }),
        ),
      ),
      el(
        'div',
        { className: 'stk-stock' },
        stockLine(product, 'display'),
        stockLine(product, 'besar'),
      ),
      createTierTable(product, { highlight: session.tier() }),
      unit.root,
      add,
    );
    const handle = openModal({
      title: product.name,
      body,
      actions: [{ text: label('tutup'), variant: 'secondary' }],
    });
    handle.dialog.classList.add('sls-dialog');
    add.addEventListener('click', () => {
      session.addLine(product, unit.select.value);
      showToast({ kind: 'success', text: label('ditambahKeOrder', { nama: product.name }) });
      handle.close();
    });
  };

  return createStockBrowser({
    store: session.store,
    showCost: false,
    onOpen: openDetail,
  });
};
