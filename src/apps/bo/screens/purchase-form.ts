import '../../../styles/bo-trx.css';
import { el } from '../../../shared/dom';
import { formatDecimal, formatRupiah } from '../../../shared/format';
import { icon } from '../../../shared/icons';
import { label } from '../../../shared/messages';
import { createButton } from '../../../shared/ui/button';
import { showToast } from '../../../shared/ui/toast';
import type { BoSession } from '../bo-session';
import type { ScreenHandle } from './login';
import {
  createPurchaseInvoiceDraft,
  getSupplierDebtInfo,
  importFromPurchaseOrder,
  purchaseToDocLine,
  type PurchaseInvoiceDraft,
} from '../domain/purchase-transaction';
import { docGrandTotal, docSummary, moveLine, type DocLine } from '../domain/doc-line';
import { createDocHead } from './trx/doc-head';
import { createItemSearch } from './trx/item-search';
import { openLineDialog } from './trx/line-dialog';
import { createLinesTable, createTotalsBox } from './trx/lines-table';
import { itemCountText, TRX_TEXT as T } from './trx/text';

const TEXT = {
  tanggal: 'Tanggal',
  tglTerima: 'Tgl Terima',
  noInvoice: 'No. Invoice',
  noPo: 'No. PO',
  noFakturPemasok: 'No. Faktur Pemasok',
  pemasok: 'Pemasok',
  alamat: 'Alamat',
  telepon: 'Telepon',
  syaratBayar: 'Syarat Bayar *',
  tempo: 'Tempo',
  metode: 'Metode Pembayaran',
  keterangan: 'Keterangan',
  kepala: 'Data faktur pembelian',
  pilihPemasok: '-- Pilih Pemasok --',
  pilihPo: '-- Pilih PO Pending --',
  alamatPemasok: 'Alamat Pemasok',
  nomorSuratJalan: 'Nomor Surat Jalan / Faktur Supplier',
  catatan: 'Catatan penerimaan barang ...',
  simpan: 'Simpan',
  baru: 'Baru',
  infoHutang: 'Info Hutang Pemasok',
  belumBarang: 'Faktur pembelian belum memiliki item barang.',
  fakturBaru: 'Faktur pembelian baru siap diisi.',
} as const;

const option = (text: string, value: string): HTMLOptionElement =>
  el('option', { text, attrs: { value } });

function selectWith(options: readonly (readonly [string, string])[]): HTMLSelectElement {
  const select = el('select', { className: 'input is-select' });
  for (const [value, text] of options) {
    select.append(option(text, value));
  }
  return select;
}

// Faktur Pembelian (gambar klien 9, varian pembelian): kepala berlabel sebaris, kotak cari barang,
// tabel baris tanpa kolom Koli, dan kotak total. Kolom Gudang berarti tujuan masuk stok.
export function renderPurchaseForm(
  session: BoSession,
  _go: (path: string) => void,
  initialPoNumber?: string,
): ScreenHandle {
  const store = session.store;
  let dataset = store.getState().data;
  const purchaseOrders = store.getState().purchaseOrders;
  const isOwner = store.getState().role === 'owner';

  let draft: PurchaseInvoiceDraft = createPurchaseInvoiceDraft(dataset);
  let lines: DocLine[] = [];
  // Total Biaya mengikuti jumlah ongkos kirim baris sampai pengguna mengetikkan nilainya sendiri.
  let extraTouched = false;
  const productOf = (id: string) => dataset.products.find((item) => item.id === id);

  // --- Kepala ---
  const dateEl = el('input', { className: 'input', attrs: { type: 'date', value: draft.date } });
  const receivedEl = el('input', {
    className: 'input',
    attrs: { type: 'date', value: draft.receivedDate },
  });
  const invoiceNumEl = el('input', {
    className: 'input is-readonly',
    attrs: { type: 'text', readonly: 'true', value: draft.invoiceNumber },
  });
  const poSelectEl = el('select', { className: 'input is-select' });
  const supplierSelectEl = el('select', { className: 'input is-select' });
  const addressEl = el('input', {
    className: 'input',
    attrs: { type: 'text', placeholder: TEXT.alamatPemasok },
  });
  const phoneEl = el('input', {
    className: 'input',
    attrs: { type: 'tel', placeholder: '0811...' },
  });
  const supplierInvNoEl = el('input', {
    className: 'input',
    attrs: { type: 'text', placeholder: TEXT.nomorSuratJalan },
  });
  const notesEl = el('input', {
    className: 'input',
    attrs: { type: 'text', placeholder: TEXT.catatan },
  });
  const termsEl = selectWith([
    ['hutang', 'HUTANG'],
    ['tunai', 'TUNAI'],
  ]);
  const tempoEl = selectWith([
    ['30', '30 HARI'],
    ['60', '60 HARI'],
    ['14', '14 HARI'],
    ['0', 'CASH / 0 HARI'],
  ]);
  const channelEl = selectWith([
    ['kas', 'KAS TOKO'],
    ['bank', 'TRANSFER BANK'],
  ]);
  const debtBoxEl = el('div', { className: 'bo-credit-box' });
  const aside = el(
    'aside',
    { className: 'bo-trx-head__aside' },
    el('h2', { className: 'bo-trx-head__asidetitle', text: TEXT.infoHutang }),
    debtBoxEl,
  );

  const head = createDocHead(
    [
      { key: 'date', label: TEXT.tanggal, control: dateEl, col: 1, row: 1 },
      { key: 'received', label: TEXT.tglTerima, control: receivedEl, col: 1, row: 2 },
      { key: 'invoice', label: TEXT.noInvoice, control: invoiceNumEl, col: 1, row: 3 },
      { key: 'supplier', label: TEXT.pemasok, control: supplierSelectEl, col: 2, row: 1 },
      { key: 'address', label: TEXT.alamat, control: addressEl, col: 2, row: 2 },
      { key: 'phone', label: TEXT.telepon, control: phoneEl, col: 2, row: 3 },
      { key: 'terms', label: TEXT.syaratBayar, control: termsEl, col: 3, row: 1 },
      { key: 'tempo', label: TEXT.tempo, control: tempoEl, col: 3, row: 2 },
      { key: 'channel', label: TEXT.metode, control: channelEl, col: 3, row: 3 },
      { key: 'po', label: TEXT.noPo, control: poSelectEl, col: 4, row: 1 },
      { key: 'supplierInv', label: TEXT.noFakturPemasok, control: supplierInvNoEl, col: 4, row: 2 },
      { key: 'notes', label: TEXT.keterangan, control: notesEl, col: 1, row: 4, span: 3 },
    ],
    aside,
    TEXT.kepala,
  );

  // --- Barang dan total ---
  const countEl = el('span', { className: 'bo-trx__count', text: itemCountText(0, 0) });
  const totals = createTotalsBox({
    onChange: (source) => {
      if (source === 'extra') {
        extraTouched = true;
      }
      recalc();
    },
  });
  const table = createLinesTable({
    mode: 'pembelian',
    lines: () => lines,
    onEdit: (id) => {
      editLine(id);
    },
    onReorder: (from, to) => {
      lines = moveLine(lines, from, to);
    },
  });
  const search = createItemSearch({
    products: () => store.getState().data.products,
    onPick: (product) => {
      openLineDialog({
        kind: 'beli',
        product,
        session,
        canSeeCost: isOwner,
        onCommit: (line) => {
          lines = [...lines, line];
          recalc();
        },
      });
    },
  });

  function editLine(id: string): void {
    const line = lines.find((item) => item.id === id);
    const product = line === undefined ? undefined : productOf(line.productId);
    if (line === undefined || product === undefined) {
      return;
    }
    openLineDialog({
      kind: 'beli',
      product,
      session,
      line,
      canSeeCost: isOwner,
      onCommit: (updated) => {
        lines = lines.map((item) => (item.id === id ? updated : item));
        recalc();
      },
      onDelete: () => {
        lines = lines.filter((item) => item.id !== id);
        recalc();
      },
    });
  }

  const debtRow = (text: string, value: string, tone = ''): HTMLElement =>
    el(
      'div',
      { className: `bo-credit-stat${tone === '' ? '' : ` ${tone}`}` },
      el('span', { className: 'bo-credit-stat__lbl', text }),
      el('span', { className: 'bo-credit-stat__val', text: value }),
    );

  function syncSupplierInfo(): void {
    const supplier = dataset.suppliers.find((item) => item.id === supplierSelectEl.value);
    if (supplier === undefined) {
      debtBoxEl.replaceChildren(
        debtRow(label('labelTotalHutang'), formatRupiah(0)),
        debtRow(label('labelHutangJatuhTempo'), formatRupiah(0), 'is-warning'),
      );
      return;
    }
    const debt = getSupplierDebtInfo(supplier);
    debtBoxEl.replaceChildren(
      debtRow(label('labelTotalHutang'), formatRupiah(debt.totalHutang)),
      debtRow(
        label('labelHutangJatuhTempo'),
        formatRupiah(debt.hutangJatuhTempo),
        debt.hutangJatuhTempo > 0 ? 'is-warning' : 'is-success',
      ),
    );
  }

  function recalc(): void {
    if (!extraTouched) {
      const shipping = lines.reduce((sum, line) => sum + line.shipping, 0);
      totals.extra.value = formatDecimal(shipping, 2);
    }
    const summary = docSummary(lines);
    const values = totals.values();
    totals.setTotals({
      subtotal: summary.subtotal,
      total: docGrandTotal(summary.subtotal, values.discount, values.extra),
    });
    countEl.textContent = itemCountText(summary.count, summary.quantity);
    table.refresh();
  }

  function fillFromDraft(source: PurchaseInvoiceDraft): void {
    draft = source;
    invoiceNumEl.value = source.invoiceNumber;
    dateEl.value = source.date;
    receivedEl.value = source.receivedDate;
    supplierSelectEl.value = source.supplierId ?? '';
    addressEl.value = source.supplierAddress;
    phoneEl.value = source.supplierPhone;
    supplierInvNoEl.value = source.supplierInvoiceNumber;
    notesEl.value = source.notes;
    termsEl.value = source.paymentTerms;
    channelEl.value = source.paymentChannel;
    lines = source.lines.map(purchaseToDocLine);
    syncSupplierInfo();
    recalc();
  }

  function refreshDropdowns(): void {
    dataset = store.getState().data;
    supplierSelectEl.replaceChildren(
      option(TEXT.pilihPemasok, ''),
      ...dataset.suppliers.map((s) => option(`${s.name} (${s.phone || '-'})`, s.id)),
    );
    poSelectEl.replaceChildren(
      option(TEXT.pilihPo, ''),
      ...purchaseOrders.map((p) => {
        const supplier = dataset.suppliers.find((s) => s.id === p.supplierId);
        return option(
          `${p.number} - ${supplier?.name ?? 'Pemasok'} (${formatRupiah(p.total)})`,
          p.number,
        );
      }),
    );
  }

  // --- Tombol bilah ---
  const saveButton = createButton({
    text: TEXT.simpan,
    variant: 'primary',
    icon: 'save',
    onClick: () => {
      if (lines.length === 0) {
        showToast({ kind: 'info', text: TEXT.belumBarang });
        return;
      }
      showToast({
        kind: 'success',
        text: `Faktur Pembelian ${draft.invoiceNumber} berhasil disimpan.`,
      });
    },
  });
  const newButton = createButton({
    text: TEXT.baru,
    variant: 'secondary',
    icon: 'plus',
    onClick: () => {
      extraTouched = false;
      totals.discount.value = '0';
      poSelectEl.value = '';
      fillFromDraft(createPurchaseInvoiceDraft(dataset));
      showToast({ kind: 'info', text: TEXT.fakturBaru });
    },
  });
  const findButton = el(
    'button',
    {
      className: 'bo-trx-iconbtn',
      attrs: { type: 'button', 'aria-label': T.tombolCariBarang, title: T.tombolCariBarang },
    },
    icon('search'),
  );
  findButton.addEventListener('click', () => {
    search.focus();
  });

  supplierSelectEl.addEventListener('change', () => {
    const supplier = dataset.suppliers.find((item) => item.id === supplierSelectEl.value);
    addressEl.value = supplier === undefined ? '' : 'Jl. Pergudangan Industri No. 8';
    phoneEl.value = supplier?.phone ?? '';
    syncSupplierInfo();
  });
  poSelectEl.addEventListener('change', () => {
    const order = purchaseOrders.find((item) => item.number === poSelectEl.value);
    if (order === undefined) {
      return;
    }
    fillFromDraft(importFromPurchaseOrder(order, dataset));
    showToast({ kind: 'success', text: `Data berhasil diimpor dari ${order.number}.` });
  });

  // --- Susun halaman ---
  refreshDropdowns();
  syncSupplierInfo();
  recalc();
  const bar = el(
    'div',
    { className: 'bo-trx__bar' },
    search.root,
    saveButton,
    newButton,
    findButton,
    countEl,
  );
  const container = el(
    'div',
    { className: 'bo-form-page bo-trx bo-trx-doc' },
    head.root,
    el('div', { className: 'bo-trx__body' }, bar, table.root, totals.root),
  );

  if (initialPoNumber !== undefined) {
    const order = purchaseOrders.find((item) => item.number === initialPoNumber);
    if (order !== undefined) {
      poSelectEl.value = order.number;
      fillFromDraft(importFromPurchaseOrder(order, dataset));
    }
  }

  return { element: container, destroy: () => undefined };
}
