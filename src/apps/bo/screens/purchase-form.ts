import { el, nextId } from '../../../shared/dom';
import { formatDecimal, formatRupiah } from '../../../shared/format';
import { label } from '../../../shared/messages';
import { createButton } from '../../../shared/ui/button';
import { showToast } from '../../../shared/ui/toast';
import type { BoSession } from '../bo-session';
import type { ScreenHandle } from './login';
import {
  calculatePurchaseTotals,
  createPurchaseInvoiceDraft,
  getSupplierDebtInfo,
  importFromPurchaseOrder,
  type PurchaseInvoiceDraft,
  type PurchaseInvoiceLine,
} from '../domain/purchase-transaction';
import { calculateTieredDiscount } from '../domain/discount';

export function renderPurchaseForm(
  session: BoSession,
  go: (path: string) => void,
  initialPoNumber?: string,
): ScreenHandle {
  const store = session.store;
  let dataset = store.getState().data;
  const purchaseOrders = store.getState().purchaseOrders;

  let draft: PurchaseInvoiceDraft = createPurchaseInvoiceDraft(dataset);

  if (initialPoNumber) {
    const foundPo = purchaseOrders.find((p) => p.number === initialPoNumber);
    if (foundPo) {
      draft = importFromPurchaseOrder(foundPo, dataset);
    }
  }

  // Root container
  const container = el('div', { className: 'bo-form-page' });

  // DOM Elements
  const invoiceNumEl = el('input', {
    className: 'input is-readonly',
    attrs: { type: 'text', readonly: 'true', value: draft.invoiceNumber },
  });
  const dateEl = el('input', {
    className: 'input',
    attrs: { type: 'date', value: draft.date },
  });
  const receivedDateEl = el('input', {
    className: 'input',
    attrs: { type: 'date', value: draft.receivedDate },
  });
  const poSelectEl = el('select', { className: 'input is-select' });

  // Supplier elements
  const supplierSelectEl = el('select', { className: 'input is-select' });
  const addressEl = el('input', {
    className: 'input',
    attrs: { type: 'text', placeholder: 'Alamat Pemasok' },
  });
  const phoneEl = el('input', {
    className: 'input',
    attrs: { type: 'tel', placeholder: '0811...' },
  });
  const supplierInvNoEl = el('input', {
    className: 'input',
    attrs: { type: 'text', placeholder: 'Nomor Surat Jalan / Faktur Supplier' },
  });
  const notesEl = el('textarea', {
    className: 'input is-textarea',
    attrs: { rows: '2', placeholder: 'Catatan penerimaan barang...' },
  });

  // Payment elements
  const termsSelectEl = el('select', { className: 'input is-select' });
  const tempoSelectEl = el('select', { className: 'input is-select' });
  const channelSelectEl = el('select', { className: 'input is-select' });

  // Debt Info Card
  const debtBoxEl = el('div', { className: 'bo-credit-box' });

  // Table items & footer
  const tableBodyEl = el('tbody', {});
  const subtotalEl = el('span', { className: 't-value', text: formatRupiah(0) });
  const discountNotaEl = el('input', {
    className: 'input is-sm is-num',
    attrs: { type: 'number', min: '0', value: '0' },
  });
  const ongkirEl = el('input', {
    className: 'input is-sm is-num',
    attrs: { type: 'number', min: '0', value: '0' },
  });
  const grandTotalEl = el('span', { className: 'bo-grand-total__value', text: formatRupiah(0) });

  // Quick item entry inputs
  const itemProductSelect = el('select', { className: 'input is-select' });
  const itemDestinationSelect = el('select', { className: 'input is-select' });
  const itemUnitSelect = el('select', { className: 'input is-select' });
  const itemQtyInput = el('input', {
    className: 'input is-sm is-num',
    attrs: { type: 'number', min: '1', value: '1' },
  });
  const itemPriceInput = el('input', {
    className: 'input is-sm is-num',
    attrs: { type: 'number', min: '0', value: '0' },
  });
  const itemDiscountInput = el('input', {
    className: 'input is-sm',
    attrs: { type: 'text', placeholder: '3+2.5 / 5% / Rp' },
  });
  const itemLastBuyInfo = el('span', { className: 'bo-hint-sub', text: '-' });

  [
    { value: 'hutang', text: 'HUTANG / TEMPO' },
    { value: 'tunai', text: 'TUNAI / LUNAS' },
  ].forEach((opt) => {
    termsSelectEl.appendChild(el('option', { text: opt.text, attrs: { value: opt.value } }));
  });

  [
    { value: '30', text: '30 HARI' },
    { value: '60', text: '60 HARI' },
    { value: '14', text: '14 HARI' },
    { value: '0', text: 'CASH / 0 HARI' },
  ].forEach((opt) => {
    tempoSelectEl.appendChild(el('option', { text: opt.text, attrs: { value: opt.value } }));
  });

  [
    { value: 'kas', text: 'KAS TOKO' },
    { value: 'bank', text: 'TRANSFER BANK' },
  ].forEach((opt) => {
    channelSelectEl.appendChild(el('option', { text: opt.text, attrs: { value: opt.value } }));
  });

  [
    { value: 'gudang', text: 'GUDANG BESAR' },
    { value: 'toko', text: 'TOKO / DISPLAY' },
  ].forEach((opt) => {
    itemDestinationSelect.appendChild(
      el('option', { text: opt.text, attrs: { value: opt.value } }),
    );
  });

  function refreshDropdowns(): void {
    dataset = store.getState().data;

    // Supplier dropdown
    supplierSelectEl.replaceChildren(
      el('option', { text: '-- Pilih Pemasok --', attrs: { value: '' } }),
      ...dataset.suppliers.map((s) =>
        el('option', { text: `${s.name} (${s.phone || '-'})`, attrs: { value: s.id } }),
      ),
    );

    // PO pending dropdown
    poSelectEl.replaceChildren(
      el('option', { text: '-- Pilih PO Pending --', attrs: { value: '' } }),
      ...purchaseOrders.map((p) => {
        const supp = dataset.suppliers.find((s) => s.id === p.supplierId);
        return el('option', {
          text: `${p.number} - ${supp?.name ?? 'Pemasok'} (${formatRupiah(p.total)})`,
          attrs: { value: p.number },
        });
      }),
    );

    // Product select
    itemProductSelect.replaceChildren(
      el('option', { text: '-- Pilih Barang --', attrs: { value: '' } }),
      ...dataset.products.map((p) =>
        el('option', {
          text: `${p.code ? p.code + ' - ' : ''}${p.name} [Stok: ${p.stock.display + p.stock.besar}]`,
          attrs: { value: p.id },
        }),
      ),
    );
  }

  function syncSupplierInfo(): void {
    const suppId = supplierSelectEl.value;
    const supp = dataset.suppliers.find((s) => s.id === suppId);
    if (supp) {
      addressEl.value = 'Jl. Pergudangan Industri No. 8';
      phoneEl.value = supp.phone || '';
      const debt = getSupplierDebtInfo(supp);
      debtBoxEl.replaceChildren(
        el(
          'div',
          { className: 'bo-credit-stat' },
          el('span', { className: 'bo-credit-stat__lbl', text: label('labelTotalHutang') }),
          el('span', { className: 'bo-credit-stat__val', text: formatRupiah(debt.totalHutang) }),
        ),
        el(
          'div',
          {
            className: `bo-credit-stat ${debt.hutangJatuhTempo > 0 ? 'is-warning' : 'is-success'}`,
          },
          el('span', { className: 'bo-credit-stat__lbl', text: label('labelHutangJatuhTempo') }),
          el('span', {
            className: 'bo-credit-stat__val',
            text: formatRupiah(debt.hutangJatuhTempo),
          }),
        ),
      );
    } else {
      addressEl.value = '';
      phoneEl.value = '';
      debtBoxEl.replaceChildren(
        el('span', { className: 't-label', text: 'Pilih pemasok untuk melihat status hutang.' }),
      );
    }
  }

  function updateItemUnitOptions(): void {
    const prodId = itemProductSelect.value;
    const prod = dataset.products.find((p) => p.id === prodId);
    if (!prod) {
      itemUnitSelect.replaceChildren(el('option', { text: '-', attrs: { value: '' } }));
      itemPriceInput.value = '0';
      itemLastBuyInfo.textContent = '-';
      return;
    }
    const units = [prod.baseUnit, ...prod.units.map((u) => u.name)];
    itemUnitSelect.replaceChildren(
      ...units.map((u) => el('option', { text: u, attrs: { value: u } })),
    );

    const price: number = prod.lastPurchasePrice ?? prod.hpp;
    itemPriceInput.value = String(price);
    itemLastBuyInfo.textContent = `${label('labelHargaBeliTerakhir')}: ${formatRupiah(price)}`;
  }

  function renderTableLines(): void {
    tableBodyEl.replaceChildren();
    if (draft.lines.length === 0) {
      tableBodyEl.appendChild(
        el(
          'tr',
          {},
          el('td', {
            attrs: { colspan: '8' },
            className: 'bo-empty-cell',
            text: 'Belum ada item pembelian. Tambahkan item di atas.',
          }),
        ),
      );
    } else {
      draft.lines.forEach((l, idx) => {
        const discCalc = calculateTieredDiscount(l.unitPrice, l.discountExpr, l.quantity);
        const delBtn = createButton({
          text: '✕',
          variant: 'danger',
          onClick: () => {
            draft = {
              ...draft,
              lines: draft.lines.filter((_, i) => i !== idx),
            };
            recalcTotals();
            renderTableLines();
          },
        });
        delBtn.classList.add('is-btn-sm');

        tableBodyEl.appendChild(
          el(
            'tr',
            {},
            el('td', { text: String(idx + 1) }),
            el(
              'td',
              {},
              el('strong', { text: l.productName }),
              l.productCode
                ? el('div', { className: 't-label', text: `Kode: ${l.productCode}` })
                : el('span', {}),
            ),
            el(
              'td',
              {},
              el('span', {
                className: `bo-badge ${l.destination === 'gudang' ? 'is-gudang' : 'is-toko'}`,
                text: l.destination === 'gudang' ? 'GUDANG' : 'TOKO',
              }),
            ),
            el('td', { text: l.unit }),
            el('td', { className: 'is-end', text: formatDecimal(l.quantity) }),
            el('td', { className: 'is-end', text: formatRupiah(l.unitPrice) }),
            el(
              'td',
              { className: 'is-center' },
              el('span', {
                className: l.discountExpr ? 'bo-badge is-disc' : 't-muted',
                text: l.discountExpr ? l.discountExpr : '-',
              }),
            ),
            el('td', { className: 'is-end is-bold', text: formatRupiah(discCalc.finalTotal) }),
            el('td', { className: 'is-center' }, delBtn),
          ),
        );
      });
    }
  }

  function recalcTotals(): void {
    const discNota = parseFloat(discountNotaEl.value) || 0;
    const ongkir = parseFloat(ongkirEl.value) || 0;
    const totals = calculatePurchaseTotals(draft.lines, discNota, ongkir);
    draft = {
      ...draft,
      subtotal: totals.subtotal,
      invoiceDiscount: totals.invoiceDiscount,
      expeditionFee: totals.expeditionFee,
      grandTotal: totals.grandTotal,
    };
    subtotalEl.textContent = formatRupiah(totals.subtotal);
    grandTotalEl.textContent = formatRupiah(totals.grandTotal);
  }

  // Event Handlers
  supplierSelectEl.addEventListener('change', () => {
    const suppId = supplierSelectEl.value;
    const supp = dataset.suppliers.find((s) => s.id === suppId);
    draft = {
      ...draft,
      supplierId: suppId || undefined,
      supplierName: supp?.name ?? '',
      supplierPhone: supp?.phone ?? '',
    };
    syncSupplierInfo();
  });

  poSelectEl.addEventListener('change', () => {
    const poNum = poSelectEl.value;
    if (!poNum) return;
    const foundPo = purchaseOrders.find((p) => p.number === poNum);
    if (foundPo) {
      draft = importFromPurchaseOrder(foundPo, dataset);
      supplierSelectEl.value = draft.supplierId ?? '';
      addressEl.value = draft.supplierAddress;
      phoneEl.value = draft.supplierPhone;
      supplierInvNoEl.value = draft.supplierInvoiceNumber;
      notesEl.value = draft.notes;
      recalcTotals();
      renderTableLines();
      showToast({ kind: 'success', text: `Data berhasil diimpor dari ${poNum}.` });
    }
  });

  itemProductSelect.addEventListener('change', updateItemUnitOptions);
  discountNotaEl.addEventListener('input', recalcTotals);
  ongkirEl.addEventListener('input', recalcTotals);

  // Quick Add Item Button
  const addItemBtn = createButton({
    text: 'Tambah Baris',
    variant: 'secondary',
    icon: 'plus',
    onClick: () => {
      const prodId = itemProductSelect.value;
      if (!prodId) {
        showToast({ kind: 'info', text: 'Pilih barang terlebih dahulu.' });
        return;
      }
      const prod = dataset.products.find((p) => p.id === prodId);
      const qty = parseFloat(itemQtyInput.value) || 1;
      const price: number =
        parseFloat(itemPriceInput.value) || (prod?.lastPurchasePrice ?? prod?.hpp ?? 50000);
      const disc = itemDiscountInput.value.trim();
      const unit =
        (itemUnitSelect.value !== '' ? itemUnitSelect.value : undefined) ?? prod?.baseUnit ?? 'PCS';
      const dest = itemDestinationSelect.value === 'toko' ? 'toko' : 'gudang';

      const newLine: PurchaseInvoiceLine = {
        id: nextId('pline'),
        productId: prodId,
        productName: prod?.name ?? prodId,
        productCode: prod?.code ?? '',
        destination: dest,
        unit,
        quantity: qty,
        unitPrice: price,
        discountExpr: disc,
        lastPurchasePrice: price,
        lastPurchaseDate: prod?.lastPurchaseDate,
      };

      draft = {
        ...draft,
        lines: [...draft.lines, newLine],
      };
      recalcTotals();
      renderTableLines();

      itemProductSelect.value = '';
      itemQtyInput.value = '1';
      itemPriceInput.value = '0';
      itemDiscountInput.value = '';
      itemLastBuyInfo.textContent = '-';
      itemProductSelect.focus();
    },
  });
  addItemBtn.classList.add('is-btn-sm');

  // Top Action Buttons
  const btnBaru = createButton({
    text: label('tombolBaru'),
    variant: 'secondary',
    icon: 'plus',
    onClick: () => {
      draft = createPurchaseInvoiceDraft(dataset);
      invoiceNumEl.value = draft.invoiceNumber;
      supplierSelectEl.value = '';
      addressEl.value = '';
      phoneEl.value = '';
      supplierInvNoEl.value = '';
      notesEl.value = '';
      discountNotaEl.value = '0';
      ongkirEl.value = '0';
      recalcTotals();
      renderTableLines();
      showToast({ kind: 'info', text: 'Faktur pembelian baru siap diisi.' });
    },
  });

  const btnSimpan = createButton({
    text: label('tombolSimpanFaktur'),
    variant: 'primary',
    icon: 'check',
    onClick: () => {
      if (draft.lines.length === 0) {
        showToast({ kind: 'info', text: 'Faktur pembelian belum memiliki item barang.' });
        return;
      }
      showToast({
        kind: 'success',
        text: `Faktur Pembelian ${draft.invoiceNumber} berhasil disimpan.`,
      });
    },
  });

  const btnDaftar = createButton({
    text: label('tombolDaftarNota'),
    variant: 'secondary',
    icon: 'list',
    onClick: () => {
      go('/bo/transaksi/daftar-nota?tab=pembelian');
    },
  });

  // Top action bar
  const topBar = el(
    'div',
    { className: 'bo-toolbar' },
    el(
      'div',
      { className: 'bo-toolbar__left' },
      el('h1', { className: 'bo-page-title', text: label('formPembelianJudul') }),
      el('span', { className: 'bo-status-pill is-info', text: 'DRAF PEMBELIAN' }),
    ),
    el('div', { className: 'bo-toolbar__right' }, btnBaru, btnSimpan, btnDaftar),
  );

  // Form Metadata 3 Kolom
  const col1 = el(
    'div',
    { className: 'bo-form-col' },
    el('h3', { className: 'bo-form-sec-title', text: 'Identitas Pembelian' }),
    el(
      'div',
      { className: 'field' },
      el('label', { className: 'field__label', text: label('tanggal') }),
      dateEl,
    ),
    el(
      'div',
      { className: 'field' },
      el('label', { className: 'field__label', text: label('labelTanggalTerimaBarang') }),
      receivedDateEl,
    ),
    el(
      'div',
      { className: 'field' },
      el('label', { className: 'field__label', text: label('noInvoice') }),
      invoiceNumEl,
    ),
    el(
      'div',
      { className: 'field' },
      el('label', { className: 'field__label', text: label('labelNoPoPending') }),
      poSelectEl,
    ),
  );

  const col2 = el(
    'div',
    { className: 'bo-form-col' },
    el('h3', { className: 'bo-form-sec-title', text: 'Pemasok / Supplier' }),
    el(
      'div',
      { className: 'field' },
      el('label', { className: 'field__label', text: label('labelPemasok') }),
      supplierSelectEl,
    ),
    el(
      'div',
      { className: 'field' },
      el('label', { className: 'field__label', text: label('labelAlamat') }),
      addressEl,
    ),
    el(
      'div',
      { className: 'field' },
      el('label', { className: 'field__label', text: label('telepon') }),
      phoneEl,
    ),
    el(
      'div',
      { className: 'field' },
      el('label', { className: 'field__label', text: label('labelNoFakturPemasok') }),
      supplierInvNoEl,
    ),
    el(
      'div',
      { className: 'field' },
      el('label', { className: 'field__label', text: label('labelCatatanBarang') }),
      notesEl,
    ),
  );

  const col3 = el(
    'div',
    { className: 'bo-form-col' },
    el('h3', { className: 'bo-form-sec-title', text: 'Syarat Pembayaran' }),
    el(
      'div',
      { className: 'bo-form-row-2' },
      el(
        'div',
        { className: 'field' },
        el('label', { className: 'field__label', text: label('labelSyaratBayarWajib') }),
        termsSelectEl,
      ),
      el(
        'div',
        { className: 'field' },
        el('label', { className: 'field__label', text: label('kolomJatuhTempo') }),
        tempoSelectEl,
      ),
    ),
    el(
      'div',
      { className: 'field' },
      el('label', { className: 'field__label', text: label('metodePembayaran') }),
      channelSelectEl,
    ),
    el(
      'div',
      { className: 'field' },
      el('label', { className: 'field__label', text: label('labelInfoHutangSupplier') }),
      debtBoxEl,
    ),
  );

  const metaCard = el('div', { className: 'bo-panel bo-form-meta-grid' }, col1, col2, col3);

  // Quick item entry bar
  const quickEntryBar = el(
    'div',
    { className: 'bo-quick-entry' },
    el(
      'div',
      { className: 'field is-grow-2' },
      el('label', { className: 'field__label', text: label('menuDataBarang') }),
      itemProductSelect,
    ),
    el(
      'div',
      { className: 'field' },
      el('label', { className: 'field__label', text: label('labelMasukKeStok') }),
      itemDestinationSelect,
    ),
    el(
      'div',
      { className: 'field' },
      el('label', { className: 'field__label', text: label('satuanDasar') }),
      itemUnitSelect,
    ),
    el(
      'div',
      { className: 'field' },
      el('label', { className: 'field__label', text: label('kolomKuantitas') }),
      itemQtyInput,
    ),
    el(
      'div',
      { className: 'field' },
      el('label', { className: 'field__label', text: label('labelHargaBeliAkhir') }),
      itemPriceInput,
    ),
    el(
      'div',
      { className: 'field' },
      el('label', { className: 'field__label', text: label('labelDiskonBertingkat') }),
      itemDiscountInput,
    ),
    el(
      'div',
      { className: 'field is-btn-col' },
      el('label', { className: 'field__label', text: 'Aksi' }),
      addItemBtn,
    ),
  );

  // Table Items
  const tableEl = el(
    'table',
    { className: 'pos-table is-compact' },
    el(
      'thead',
      {},
      el(
        'tr',
        {},
        el('th', { className: 'bo-col-no', text: 'No' }),
        el('th', { text: label('namaBarang') }),
        el('th', { text: label('labelMasukKeStok') }),
        el('th', { text: label('satuanDasar') }),
        el('th', { className: 'is-end', text: label('kolomKuantitas') }),
        el('th', { className: 'is-end', text: label('labelHargaBeliAkhir') }),
        el('th', { className: 'is-center', text: label('labelDiskonBertingkat') }),
        el('th', { className: 'is-end', text: label('kolomTotal') }),
        el('th', { className: 'is-center bo-col-del', text: 'Hapus' }),
      ),
    ),
    tableBodyEl,
  );

  // Summary Footer
  const footerCard = el(
    'div',
    { className: 'bo-panel bo-form-footer-summary' },
    el(
      'div',
      { className: 'bo-footer-fields' },
      el(
        'div',
        { className: 'field is-horizontal' },
        el('label', { className: 'field__label', text: 'Subtotal' }),
        subtotalEl,
      ),
      el(
        'div',
        { className: 'field is-horizontal' },
        el('label', { className: 'field__label', text: label('labelDiskonNota') }),
        discountNotaEl,
      ),
      el(
        'div',
        { className: 'field is-horizontal' },
        el('label', { className: 'field__label', text: label('labelOngkosAngkutPabrik') }),
        ongkirEl,
      ),
    ),
    el(
      'div',
      { className: 'bo-grand-total-card' },
      el('span', { className: 'bo-grand-total__label', text: label('labelTotalAkhir') }),
      grandTotalEl,
    ),
  );

  // Initial paint
  refreshDropdowns();
  syncSupplierInfo();
  renderTableLines();
  recalcTotals();

  container.replaceChildren(
    topBar,
    metaCard,
    el('div', { className: 'bo-panel' }, quickEntryBar, tableEl),
    footerCard,
  );

  return {
    element: container,
    destroy: () => undefined,
  };
}
