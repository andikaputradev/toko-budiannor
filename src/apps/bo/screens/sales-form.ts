import { el, nextId } from '../../../shared/dom';
import { formatDecimal, formatRupiah } from '../../../shared/format';
import { label } from '../../../shared/messages';
import { createButton } from '../../../shared/ui/button';
import { openModal } from '../../../shared/ui/modal';
import { showToast } from '../../../shared/ui/toast';
import type { BoSession } from '../bo-session';
import type { ScreenHandle } from './login';
import {
  calculateSalesTotals,
  createSalesInvoiceDraft,
  getCustomerCreditInfo,
  importFromSalesOrder,
  buildSalesInvoiceWhatsAppMessage,
  generateWhatsAppUrl,
  type SalesInvoiceDraft,
  type SalesInvoiceLine,
} from '../domain/sales-transaction';
import { promoDiscountExpr } from '../../../shared/domain/promo';
import { calculateTieredDiscount } from '../domain/discount';

export function renderSalesForm(
  session: BoSession,
  go: (path: string) => void,
  initialSoNumber?: string,
): ScreenHandle {
  const store = session.store;
  let dataset = store.getState().data;
  const salesOrders = store.getState().salesOrders;

  let draft: SalesInvoiceDraft = createSalesInvoiceDraft(dataset);

  // Jika ada SO number awal atau SO pending di state, bisa langsung diimpor
  if (initialSoNumber) {
    const foundSo = salesOrders.find((s) => s.number === initialSoNumber);
    if (foundSo) {
      draft = importFromSalesOrder(foundSo, dataset);
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
  const soSelectEl = el('select', { className: 'input is-select' });

  // Customer elements
  const customerSelectEl = el('select', { className: 'input is-select' });
  const addressEl = el('input', {
    className: 'input',
    attrs: { type: 'text', placeholder: 'Alamat Pengiriman' },
  });
  const phoneEl = el('input', {
    className: 'input',
    attrs: { type: 'tel', placeholder: '0812...' },
  });
  const notesEl = el('textarea', {
    className: 'input is-textarea',
    attrs: { rows: '2', placeholder: 'Catatan pengiriman / hubungi tukang...' },
  });
  const salesPersonEl = el('input', {
    className: 'input',
    attrs: { type: 'text', value: draft.salesPerson },
  });
  const expeditionEl = el('select', { className: 'input is-select' });

  // Payment elements
  const termsSelectEl = el('select', { className: 'input is-select' });
  const tempoSelectEl = el('select', { className: 'input is-select' });
  const channelSelectEl = el('select', { className: 'input is-select' });

  // Piutang Info Card
  const creditBoxEl = el('div', { className: 'bo-credit-box' });

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
  const itemWarehouseSelect = el('select', { className: 'input is-select' });
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
    attrs: { type: 'text', placeholder: '5+5 / 10% / Rp' },
  });
  const itemLastPriceInfo = el('span', { className: 'bo-hint-sub', text: '-' });

  // Populate expedition options
  ['JNE Cargo', 'Dakota Cargo', 'Indah Logistik', 'Armada Truk Toko', 'Ambil Sendiri'].forEach(
    (opt) => {
      expeditionEl.appendChild(el('option', { text: opt, attrs: { value: opt } }));
    },
  );

  // Populate Payment options
  [
    { value: 'piutang', text: 'PIUTANG / TEMPO' },
    { value: 'tunai', text: 'TUNAI / LUNAS' },
  ].forEach((opt) => {
    termsSelectEl.appendChild(el('option', { text: opt.text, attrs: { value: opt.value } }));
  });

  [
    { value: '30', text: '30 HARI' },
    { value: '14', text: '14 HARI' },
    { value: '7', text: '7 HARI' },
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
    { value: 'toko', text: 'TOKO' },
    { value: 'gudang', text: 'GUDANG BESAR' },
  ].forEach((opt) => {
    itemWarehouseSelect.appendChild(el('option', { text: opt.text, attrs: { value: opt.value } }));
  });

  function refreshDropdowns(): void {
    dataset = store.getState().data;

    // Customer dropdown
    customerSelectEl.replaceChildren(
      el('option', { text: '-- Pilih Pelanggan --', attrs: { value: '' } }),
      ...dataset.customers.map((c) =>
        el('option', { text: `${c.name} (${c.phone || '-'})`, attrs: { value: c.id } }),
      ),
    );

    // SO pending dropdown
    const pendingSos = salesOrders;
    soSelectEl.replaceChildren(
      el('option', { text: '-- Pilih SO Pending --', attrs: { value: '' } }),
      ...pendingSos.map((s) => {
        const cust = dataset.customers.find((c) => c.id === s.customerId);
        return el('option', {
          text: `${s.number} - ${cust?.name ?? 'Umum'} (${formatRupiah(s.total)})`,
          attrs: { value: s.number },
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

  function syncCustomerInfo(): void {
    const custId = customerSelectEl.value;
    const cust = dataset.customers.find((c) => c.id === custId);
    if (cust) {
      addressEl.value = cust.address ?? '';
      phoneEl.value = cust.phone;
      const credit = getCustomerCreditInfo(cust, draft.grandTotal);
      creditBoxEl.replaceChildren(
        el(
          'div',
          { className: 'bo-credit-stat' },
          el('span', { className: 'bo-credit-stat__lbl', text: label('labelTotalPiutang') }),
          el('span', { className: 'bo-credit-stat__val', text: formatRupiah(credit.totalPiutang) }),
        ),
        el(
          'div',
          { className: 'bo-credit-stat is-warning' },
          el('span', { className: 'bo-credit-stat__lbl', text: label('labelPiutangJatuhTempo') }),
          el('span', {
            className: 'bo-credit-stat__val',
            text: formatRupiah(credit.piutangJatuhTempo),
          }),
        ),
        el(
          'div',
          { className: 'bo-credit-stat' },
          el('span', { className: 'bo-credit-stat__lbl', text: label('labelPlafonKredit') }),
          el('span', { className: 'bo-credit-stat__val', text: formatRupiah(credit.creditLimit) }),
        ),
        el(
          'div',
          { className: `bo-credit-stat ${credit.isOverlimit ? 'is-danger' : 'is-success'}` },
          el('span', { className: 'bo-credit-stat__lbl', text: label('labelSisaPlafon') }),
          el('span', {
            className: 'bo-credit-stat__val',
            text: credit.isOverlimit
              ? label('labelPeringatanOverlimit')
              : formatRupiah(credit.remainingCredit),
          }),
        ),
      );
    } else {
      addressEl.value = '';
      phoneEl.value = '';
      creditBoxEl.replaceChildren(
        el('span', { className: 't-label', text: 'Pilih pelanggan untuk melihat status kredit.' }),
      );
    }
  }

  function updateItemUnitOptions(): void {
    const prodId = itemProductSelect.value;
    const prod = dataset.products.find((p) => p.id === prodId);
    if (!prod) {
      itemUnitSelect.replaceChildren(el('option', { text: '-', attrs: { value: '' } }));
      itemPriceInput.value = '0';
      itemDiscountInput.value = '';
      itemLastPriceInfo.textContent = '-';
      return;
    }
    const units = [prod.baseUnit, ...prod.units.map((u) => u.name)];
    itemUnitSelect.replaceChildren(
      ...units.map((u) => el('option', { text: u, attrs: { value: u } })),
    );

    const unitTier = prod.prices[prod.baseUnit] ?? Object.values(prod.prices)[0];
    const price: number = unitTier?.eceran ?? 100000;
    itemPriceInput.value = String(price);
    itemLastPriceInfo.textContent = `${label('labelHargaTerakhir')}: ${formatRupiah(price)}`;
    // Barang berpromo otomatis berlaku: diskon promo terisi dahulu, tetap bisa diubah.
    itemDiscountInput.value = promoDiscountExpr(prod);
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
            text: 'Belum ada item barang. Tambahkan item di atas.',
          }),
        ),
      );
    } else {
      draft.lines.forEach((l, idx) => {
        const lineProduct = dataset.products.find((item) => item.id === l.productId);
        const onPromo =
          lineProduct !== undefined &&
          l.discountExpr !== '' &&
          l.discountExpr === promoDiscountExpr(lineProduct);
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
              onPromo && el('span', { className: 'bo-badge is-promo', text: label('promoTanda') }),
              l.aliasName && l.aliasName !== l.productName
                ? el('div', { className: 't-label', text: `Alias: ${l.aliasName}` })
                : el('span', {}),
            ),
            el(
              'td',
              {},
              el('span', {
                className: `bo-badge ${l.warehouse === 'toko' ? 'is-toko' : 'is-gudang'}`,
                text: l.warehouse === 'toko' ? 'TOKO' : 'GUDANG',
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
    const totals = calculateSalesTotals(draft.lines, discNota, ongkir);
    draft = {
      ...draft,
      subtotal: totals.subtotal,
      invoiceDiscount: totals.invoiceDiscount,
      expeditionFee: totals.expeditionFee,
      grandTotal: totals.grandTotal,
    };
    subtotalEl.textContent = formatRupiah(totals.subtotal);
    grandTotalEl.textContent = formatRupiah(totals.grandTotal);
    syncCustomerInfo();
  }

  function openPrintWaModal(): void {
    const checkFaktur = el('input', {
      attrs: { type: 'checkbox', checked: 'true', id: 'chk-faktur' },
    });
    const checkSj = el('input', {
      attrs: { type: 'checkbox', checked: 'true', id: 'chk-sj' },
    });
    const checkSo = el('input', { attrs: { type: 'checkbox', id: 'chk-so' } });
    const checkDo = el('input', { attrs: { type: 'checkbox', id: 'chk-do' } });

    const optKertasBesar = el('input', {
      attrs: { type: 'checkbox', checked: 'true', id: 'opt-kertas' },
    });
    const optTanpaHeader = el('input', {
      attrs: { type: 'checkbox', id: 'opt-noheader' },
    });
    const optRekening = el('input', {
      attrs: { type: 'checkbox', checked: 'true', id: 'opt-rekening' },
    });

    const previewMsg = buildSalesInvoiceWhatsAppMessage(draft, 'Toko Budiannor');
    const waPreviewArea = el('textarea', {
      className: 'input is-textarea bo-wa-preview',
      attrs: { readonly: 'true', rows: '6' },
      text: previewMsg,
    });

    const modalBody = el(
      'div',
      { className: 'bo-print-modal-content' },
      el('h3', { className: 'bo-modal-sec-title', text: label('labelPilihanDokumen') }),
      el(
        'div',
        { className: 'bo-chk-grid' },
        el(
          'label',
          { className: 'bo-chk-lbl' },
          checkFaktur,
          el('span', { text: label('labelCetakFaktur') }),
        ),
        el(
          'label',
          { className: 'bo-chk-lbl' },
          checkSj,
          el('span', { text: label('labelCetakSuratJalan') }),
        ),
        el(
          'label',
          { className: 'bo-chk-lbl' },
          checkSo,
          el('span', { text: label('labelCetakSuratOrder') }),
        ),
        el(
          'label',
          { className: 'bo-chk-lbl' },
          checkDo,
          el('span', { text: label('labelCetakDoPengambilan') }),
        ),
      ),
      el('h3', { className: 'bo-modal-sec-title', text: label('labelOpsiCetak') }),
      el(
        'div',
        { className: 'bo-chk-grid' },
        el(
          'label',
          { className: 'bo-chk-lbl' },
          optKertasBesar,
          el('span', { text: label('labelKertasBesar') }),
        ),
        el(
          'label',
          { className: 'bo-chk-lbl' },
          optTanpaHeader,
          el('span', { text: label('labelTanpaHeader') }),
        ),
        el(
          'label',
          { className: 'bo-chk-lbl' },
          optRekening,
          el('span', { text: label('labelTampilkanNoRekening') }),
        ),
      ),
      el('h3', { className: 'bo-modal-sec-title', text: 'Salinan Pesan WhatsApp' }),
      waPreviewArea,
    );

    openModal({
      title: label('labelModalCetakWa'),
      body: modalBody,
      actions: [
        {
          text: label('tombolKirimWa'),
          variant: 'primary',
          onClick: () => {
            const phone = phoneEl.value || draft.customerPhone || '0811230988';
            const url = generateWhatsAppUrl(phone, previewMsg);
            window.open(url, '_blank');
            showToast({ kind: 'success', text: 'Tautan WhatsApp telah dibuka.' });
          },
        },
        {
          text: 'Cetak Dokumen',
          variant: 'secondary',
          onClick: () => {
            window.print();
          },
        },
        {
          text: label('tutup'),
          variant: 'secondary',
        },
      ],
    });
  }

  // Event Handlers
  customerSelectEl.addEventListener('change', () => {
    const custId = customerSelectEl.value;
    const cust = dataset.customers.find((c) => c.id === custId);
    draft = {
      ...draft,
      customerId: custId || undefined,
      customerName: cust?.name ?? '',
      customerAddress: cust?.address ?? '',
      customerPhone: cust?.phone ?? '',
    };
    syncCustomerInfo();
  });

  soSelectEl.addEventListener('change', () => {
    const soNum = soSelectEl.value;
    if (!soNum) return;
    const foundSo = salesOrders.find((s) => s.number === soNum);
    if (foundSo) {
      draft = importFromSalesOrder(foundSo, dataset);
      customerSelectEl.value = draft.customerId ?? '';
      addressEl.value = draft.customerAddress;
      phoneEl.value = draft.customerPhone;
      notesEl.value = draft.notes;
      recalcTotals();
      renderTableLines();
      showToast({ kind: 'success', text: `Data berhasil diimpor dari ${soNum}.` });
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
      const unitTier = prod
        ? (prod.prices[prod.baseUnit] ?? Object.values(prod.prices)[0])
        : undefined;
      const defaultPrice = unitTier?.eceran ?? 100000;
      const price: number = parseFloat(itemPriceInput.value) || defaultPrice;
      const disc = itemDiscountInput.value.trim();
      const unit =
        (itemUnitSelect.value !== '' ? itemUnitSelect.value : undefined) ?? prod?.baseUnit ?? 'PCS';
      const wh = itemWarehouseSelect.value === 'gudang' ? 'gudang' : 'toko';

      const newLine: SalesInvoiceLine = {
        id: nextId('line'),
        productId: prodId,
        productName: prod?.name ?? prodId,
        aliasName: prod?.name ?? '',
        warehouse: wh,
        unit,
        quantity: qty,
        unitPrice: price,
        discountExpr: disc,
        lastSalePrice: price,
      };

      draft = {
        ...draft,
        lines: [...draft.lines, newLine],
      };
      recalcTotals();
      renderTableLines();

      // Reset item inputs
      itemProductSelect.value = '';
      itemQtyInput.value = '1';
      itemPriceInput.value = '0';
      itemDiscountInput.value = '';
      itemLastPriceInfo.textContent = '-';
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
      draft = createSalesInvoiceDraft(dataset);
      invoiceNumEl.value = draft.invoiceNumber;
      customerSelectEl.value = '';
      addressEl.value = '';
      phoneEl.value = '';
      notesEl.value = '';
      discountNotaEl.value = '0';
      ongkirEl.value = '0';
      recalcTotals();
      renderTableLines();
      showToast({ kind: 'info', text: 'Faktur baru siap diisi.' });
    },
  });

  const btnSimpan = createButton({
    text: label('tombolSimpanFaktur'),
    variant: 'primary',
    icon: 'check',
    onClick: () => {
      if (draft.lines.length === 0) {
        showToast({ kind: 'info', text: 'Faktur belum memiliki item barang.' });
        return;
      }
      showToast({ kind: 'success', text: `Faktur ${draft.invoiceNumber} berhasil disimpan.` });
      openPrintWaModal();
    },
  });

  const btnIsiSj = createButton({
    text: label('tombolIsiSjEkspedisi'),
    variant: 'secondary',
    icon: 'package',
    onClick: () => {
      if (draft.lines.length === 0) {
        showToast({ kind: 'info', text: 'Isi item barang sebelum membuat Surat Jalan.' });
        return;
      }
      go(`/bo/transaksi/surat-jalan?inv=${draft.invoiceNumber}`);
    },
  });

  const btnDaftar = createButton({
    text: label('tombolDaftarNota'),
    variant: 'secondary',
    icon: 'list',
    onClick: () => {
      go('/bo/transaksi/daftar-nota?tab=penjualan');
    },
  });

  const btnCetakWa = createButton({
    text: label('tombolCetakWa'),
    variant: 'secondary',
    icon: 'printer',
    onClick: openPrintWaModal,
  });

  // Top action bar
  const topBar = el(
    'div',
    { className: 'bo-toolbar' },
    el(
      'div',
      { className: 'bo-toolbar__left' },
      el('h1', { className: 'bo-page-title', text: label('formPenjualanJudul') }),
      el('span', { className: 'bo-status-pill is-info', text: 'DRAF AKTIF' }),
    ),
    el(
      'div',
      { className: 'bo-toolbar__right' },
      btnBaru,
      btnSimpan,
      btnIsiSj,
      btnDaftar,
      btnCetakWa,
    ),
  );

  // Form Metadata 3 Kolom
  const col1 = el(
    'div',
    { className: 'bo-form-col' },
    el('h3', { className: 'bo-form-sec-title', text: 'Identitas Faktur' }),
    el(
      'div',
      { className: 'field' },
      el('label', { className: 'field__label', text: label('tanggal') }),
      dateEl,
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
      el('label', { className: 'field__label', text: label('labelNoSoPending') }),
      soSelectEl,
    ),
  );

  const col2 = el(
    'div',
    { className: 'bo-form-col' },
    el('h3', { className: 'bo-form-sec-title', text: 'Pelanggan & Pengiriman' }),
    el(
      'div',
      { className: 'field' },
      el('label', { className: 'field__label', text: label('pelanggan') }),
      customerSelectEl,
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
      el('label', { className: 'field__label', text: label('labelCatatanBarang') }),
      notesEl,
    ),
    el(
      'div',
      { className: 'bo-form-row-2' },
      el(
        'div',
        { className: 'field' },
        el('label', { className: 'field__label', text: 'Sales' }),
        salesPersonEl,
      ),
      el(
        'div',
        { className: 'field' },
        el('label', { className: 'field__label', text: label('labelNamaEkspedisi') }),
        expeditionEl,
      ),
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
      el('label', { className: 'field__label', text: label('labelInfoPiutangPelanggan') }),
      creditBoxEl,
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
      el('label', { className: 'field__label', text: label('labelAmbilDariStok') }),
      itemWarehouseSelect,
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
      el('label', { className: 'field__label', text: label('hargaSatuan') }),
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
        el('th', { attrs: { style: 'width: 40px;' }, text: 'No' }),
        el('th', { text: label('namaBarang') }),
        el('th', { text: label('labelAmbilDariStok') }),
        el('th', { text: label('satuanDasar') }),
        el('th', { className: 'is-end', text: label('kolomKuantitas') }),
        el('th', { className: 'is-end', text: label('hargaSatuan') }),
        el('th', { className: 'is-center', text: label('labelDiskonBertingkat') }),
        el('th', { className: 'is-end', text: label('kolomTotal') }),
        el('th', { className: 'is-center', attrs: { style: 'width: 50px;' }, text: 'Hapus' }),
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
        el('label', { className: 'field__label', text: label('labelBiayaEkspedisi') }),
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
  syncCustomerInfo();
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
