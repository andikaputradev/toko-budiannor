import '../../../styles/mobile-owner.css';
import { el } from '../../../shared/dom';
import { formatDecimal, formatRupiah, formatTime } from '../../../shared/format';
import { label, message } from '../../../shared/messages';
import type { Product, WarehouseId } from '../../../shared/data/types';
import { breakdownStock, fromBase } from '../../../shared/data/units';
import { warehouseTone } from '../../../shared/domain/product-view';
import { splitMin } from '../../../shared/domain/stock';
import { createButton } from '../../../shared/ui/button';
import { createSelectField, createTextField } from '../../../shared/ui/field';
import { openPhotoViewer } from '../../../shared/ui/image-viewer';
import { createMobBadge } from '../../../shared/ui/mobile-card';
import { openModal } from '../../../shared/ui/modal';
import { createProductPhoto } from '../../../shared/ui/product-photo';
import { createStockBrowser } from '../../../shared/ui/stock-browser';
import { createTierTable } from '../../../shared/ui/tier-table';
import { showToast } from '../../../shared/ui/toast';
import { failureText } from '../failure';
import { preferredUnit } from '../domain/orders';
import type { OwnerSession } from '../owner-session';
import type { ScreenHandle } from '../screen';
import { openSheet } from '../sheet';
import type { OwnerShell } from '../shell';

function stockText(product: Product, warehouse: WarehouseId): string {
  return `${formatDecimal(product.stock[warehouse], 3, 0)} ${product.baseUnit}`;
}

// Satu kolom stok pada lembar detail: judul kecil dan lencana berwarna sesuai status.
function stockBadge(product: Product, warehouse: WarehouseId): HTMLElement {
  return el(
    'span',
    { className: 'trx-stk' },
    el('span', {
      className: 'trx-stk__label',
      text: label(warehouse === 'display' ? 'stkLabelToko' : 'stkLabelGudang'),
    }),
    createMobBadge(stockText(product, warehouse), warehouseTone(product, warehouse)),
  );
}

export function renderStock(
  session: OwnerSession,
  go: (path: string) => void,
  query?: URLSearchParams,
  shell?: OwnerShell,
): ScreenHandle {
  shell?.setTitle(label('stkJudul'));
  shell?.setBack(undefined);
  const store = session.store;

  const openMutation = (product: Product): void => {
    const options = [
      { value: 'besar', text: label('namaGudangBesar') },
      { value: 'display', text: label('namaGudangDisplay') },
    ];
    const from = createSelectField({ labelText: label('gudangAsal'), options, value: 'besar' });
    const to = createSelectField({ labelText: label('gudangTujuan'), options, value: 'display' });
    to.select.value = 'display';
    const quantity = createTextField({ labelText: label('jumlahMutasi'), inputMode: 'decimal' });
    const unit = createSelectField({
      labelText: label('kolomSatuan'),
      options: product.units.map((item) => ({ value: item.code, text: item.code })),
      value: preferredUnit(product),
    });
    const available = el('p', { className: 't-label' });
    const paintAvailable = (): void => {
      const source = from.select.value as WarehouseId;
      available.textContent = `${label('stokAsal')}: ${formatDecimal(fromBase(product, unit.select.value, product.stock[source]), 3, 1)} ${unit.select.value}`;
    };
    from.select.addEventListener('change', paintAvailable);
    unit.select.addEventListener('change', paintAvailable);
    paintAvailable();
    openSheet({
      title: `${label('buatMutasi')}: ${product.name}`,
      body: el(
        'div',
        { className: 'own-form' },
        from.root,
        to.root,
        unit.root,
        available,
        quantity.root,
      ),
      submitText: label('simpanMutasi'),
      onSubmit: () => {
        const result = session.saveTransfer(
          product.id,
          from.select.value as WarehouseId,
          to.select.value as WarehouseId,
          unit.select.value,
          quantity.input.value,
        );
        if (result.ok) {
          showToast({ kind: 'success', text: message('MSG-012', { nomor: result.number }) });
          return undefined;
        }
        return failureText(result);
      },
    });
  };

  // Lembar Detail Barang: foto, stok tiap gudang, harga bertingkat, HPP, dan aksi.
  const openDetail = (product: Product): void => {
    const current = (): Product =>
      store.getState().data.products.find((item) => item.id === product.id) ?? product;
    const stockBox = (key: WarehouseId): HTMLElement => {
      const item = current();
      const parts = breakdownStock(item, item.stock[key])
        .map((part) => `${formatDecimal(part.quantity, 3, 0)} ${part.unit}`)
        .join(' + ');
      return el(
        'div',
        { className: 'trx-detail-stock' },
        stockBadge(item, key),
        el('span', {
          className: 'mob-muted',
          text: label('stkMinimum', { nilai: formatDecimal(splitMin(item)[key], 3, 0) }),
        }),
        parts === '' ? false : el('span', { className: 'mob-muted', text: parts }),
      );
    };
    const mutate = createButton({
      text: label('buatMutasi'),
      variant: 'secondary',
      icon: 'arrow-left-right',
    });
    const order = createButton({ text: label('buatPo'), icon: 'clipboard-list' });
    const item = current();
    const body = el(
      'div',
      { className: 'trx-detail-sheet' },
      el(
        'div',
        { className: 'trx-detail-sheet__head' },
        createProductPhoto(item, 'lg', {
          onZoom: () => {
            openPhotoViewer({ product: item });
          },
        }),
        el(
          'dl',
          { className: 'trx-facts' },
          el('dt', { text: label('kodeBarang') }),
          el('dd', { text: item.code }),
          el('dt', { text: label('merkBarang') }),
          el('dd', { text: item.brand }),
          el('dt', { text: label('kategoriBarang') }),
          el('dd', { text: item.category }),
        ),
      ),
      el('div', { className: 'trx-detail-stocks' }, stockBox('display'), stockBox('besar')),
      createTierTable(item),
      el(
        'p',
        { className: 'trx-hpp' },
        el('span', { className: 'mob-muted', text: label('stkHpp', { satuan: item.baseUnit }) }),
        el('strong', { text: formatRupiah(item.hpp) }),
      ),
      el('div', { className: 'trx-detail-actions' }, mutate, order),
    );
    const handle = openModal({
      title: label('detailBarang'),
      body,
      actions: [{ text: label('tutup'), variant: 'secondary' }],
    });
    handle.dialog.classList.add('trx-dialog', 'trx-dialog--wide');
    mutate.addEventListener('click', () => {
      handle.close();
      openMutation(item);
    });
    order.addEventListener('click', () => {
      handle.close();
      go(`/owner/transaksi?tab=po&barang=${encodeURIComponent(item.code)}`);
    });
  };

  return createStockBrowser({
    store,
    showCost: true,
    belowMinimum: query?.get('filter') === 'minimum',
    onOpen: openDetail,
    loadedAt: () => formatTime(new Date(session.state().loadedAt)),
    subscribe: (paint) => session.subscribe(paint),
  });
}
