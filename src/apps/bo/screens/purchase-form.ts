import '../../../styles/bo-trx.css';
import { el } from '../../../shared/dom';
import { formatDecimal, formatRupiah } from '../../../shared/format';
import { label } from '../../../shared/messages';
import { createButton } from '../../../shared/ui/button';
import { showToast } from '../../../shared/ui/toast';
import type { BoSession } from '../bo-session';
import type { ScreenHandle } from './login';
import {
  createPurchaseInvoiceDraft,
  getSupplierDebtInfo,
  importFromPurchaseOrder,
  purchaseDraftFromNumber,
  purchaseToDocLine,
  type PurchaseInvoiceDraft,
} from '../domain/purchase-transaction';
import { docGrandTotal, docSummary, moveLine, type DocLine } from '../domain/doc-line';
import { purchaseCostUpdates } from '../domain/landed-cost';
import { createDocHead } from './trx/doc-head';
import { createItemSearch } from './trx/item-search';
import { openLineDialog } from './trx/line-dialog';
import { createLinesTable, createTotalsBox } from './trx/lines-table';
import { createPaymentFields } from './trx/payment-fields';
import { createPartySearch, supplierParties } from './trx/party-search';
import { itemCountText, TRX_TEXT } from './trx/text';

const EXPEDITIONS = [
  'JNE Cargo',
  'Dakota Cargo',
  'Indah Logistik',
  'Armada Truk Toko',
  'Ambil Sendiri',
] as const;

const TEXT = {
  tanggal: 'Tanggal',
  nomor: 'Nomor',
  noPo: 'No. PO',
  noFaktur: 'No. Faktur',
  pemasok: 'Pemasok',
  syaratBayar: 'Cara Bayar',
  tempo: 'Tempo',
  metode: 'Kas / Bank',
  ekspedisi: 'Ekspedisi',
  keterangan: 'Keterangan',
  kepala: 'Data faktur pembelian',
  daftarPemasok: 'Daftar pemasok',
  pemasokKosong: 'Pemasok tidak ditemukan.',
  pilihPo: '-- Pilih PO Pending --',
  nomorSuratJalan: 'Nomor Surat Jalan / Faktur Supplier',
  catatan: 'Catatan penerimaan barang ...',
  simpan: 'Simpan',
  cetak: 'Cetak',
  belumCetak: 'Belum ada barang untuk dicetak.',
  infoHutang: 'Info Hutang Pemasok',
  belumBarang: 'Faktur pembelian belum memiliki item barang.',
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
  invoiceNumber?: string,
): ScreenHandle {
  const store = session.store;
  let dataset = store.getState().data;
  // Dibaca ulang tiap kali: PO bisa dibuat di tab lain selagi formulir ini terbuka.
  const purchaseOrders = () => store.getState().purchaseOrders;
  const isOwner = store.getState().role === 'owner';

  let draft: PurchaseInvoiceDraft = createPurchaseInvoiceDraft(dataset);
  let lines: DocLine[] = [];
  // Faktur yang sudah disimpan tidak menghitung ulang HPP bila disimpan lagi.
  const costedInvoices = new Set<string>();
  // Dibaca dari store tiap kali: barang bisa dibuat di tab lain selagi formulir ini terbuka.
  const productOf = (id: string) => store.getState().data.products.find((item) => item.id === id);

  // --- Kepala ---
  const dateEl = el('input', { className: 'input', attrs: { type: 'date', value: draft.date } });
  // Nomor dibuat otomatis (tidak diketik) dan dilewati papan ketik.
  const invoiceNumEl = el('input', {
    className: 'input is-readonly',
    attrs: { type: 'text', readonly: 'true', tabindex: '-1', value: draft.invoiceNumber },
  });
  const poSelectEl = el('select', { className: 'input is-select' });
  // Pemasok dicari seperti nama barang; memilih atau mengosongkannya memperbarui info hutang.
  const supplierEl = createPartySearch({
    parties: () => supplierParties(store.getState().data.suppliers),
    placeholder: TRX_TEXT.cariPilih,
    emptyText: TEXT.pemasokKosong,
    listLabel: TEXT.daftarPemasok,
    onChange: () => {
      dataset = store.getState().data;
      syncSupplierInfo();
    },
  });
  const supplierInvNoEl = el('input', {
    className: 'input',
    attrs: { type: 'text', placeholder: TEXT.nomorSuratJalan },
  });
  const notesEl = el('input', {
    className: 'input',
    attrs: { type: 'text', placeholder: TEXT.catatan },
  });
  const expeditionEl = selectWith(EXPEDITIONS.map((name) => [name, name] as const));
  // Cara Bayar menentukan isian lain: hutang membuka Tempo, tunai membuka Kas / Bank.
  const pay = createPaymentFields({ credit: 'hutang', withChannel: true });
  const termsEl = pay.terms;
  const channelEl = pay.channel ?? selectWith([]);
  const debtBoxEl = el('div', { className: 'bo-credit-box' });
  const aside = el(
    'aside',
    { className: 'bo-trx-head__aside' },
    el('h2', { className: 'bo-trx-head__asidetitle', text: TEXT.infoHutang }),
    debtBoxEl,
  );

  // Urutan fokus: tanggal, No. PO, pemasok, cara bayar, tempo, kas / bank, lalu keterangan terakhir.
  const head = createDocHead(
    [
      { key: 'invoice', label: TEXT.nomor, control: invoiceNumEl, col: 1, row: 1 },
      { key: 'date', label: TEXT.tanggal, control: dateEl, col: 1, row: 2 },
      { key: 'po', label: TEXT.noPo, control: poSelectEl, col: 1, row: 3 },
      {
        key: 'supplier',
        label: TEXT.pemasok,
        control: supplierEl.root,
        labelFor: supplierEl.input,
        col: 2,
        row: 1,
      },
      { key: 'terms', label: TEXT.syaratBayar, control: termsEl, col: 2, row: 2 },
      {
        key: 'tempo',
        label: TEXT.tempo,
        control: pay.tempoBox,
        labelFor: pay.tempo,
        col: 3,
        row: 1,
      },
      { key: 'channel', label: TEXT.metode, control: channelEl, col: 3, row: 2 },
      { key: 'supplierInv', label: TEXT.noFaktur, control: supplierInvNoEl, col: 4, row: 1 },
      { key: 'expedition', label: TEXT.ekspedisi, control: expeditionEl, col: 4, row: 2 },
      { key: 'notes', label: TEXT.keterangan, control: notesEl, col: 2, row: 3, span: 3 },
    ],
    aside,
    TEXT.kepala,
    [1.05, 1.3, 0.85, 1.3],
  );

  // --- Barang dan total ---
  const countEl = el('span', { className: 'bo-trx__count', text: itemCountText(0, 0) });
  const totals = createTotalsBox({
    withExtra: false,
    onChange: () => {
      recalc();
    },
  });
  const table = createLinesTable({
    mode: 'pembelian',
    shipping: true,
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
    const supplier = dataset.suppliers.find((item) => item.id === supplierEl.value());
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
    // Ongkos kirim tidak masuk total nota; ia hanya menambah HPP barang saat faktur disimpan.
    const summary = docSummary(lines);
    const values = totals.values();
    totals.setTotals({
      subtotal: summary.subtotal,
      total: docGrandTotal(summary.subtotal, values.discount, 0),
    });
    countEl.textContent = itemCountText(summary.count, summary.quantity);
    table.refresh();
  }

  function fillFromDraft(source: PurchaseInvoiceDraft): void {
    draft = source;
    invoiceNumEl.value = source.invoiceNumber;
    dateEl.value = source.date;
    supplierEl.set(source.supplierId, source.supplierName);
    totals.discount.value = formatDecimal(source.invoiceDiscount, 2);
    supplierInvNoEl.value = source.supplierInvoiceNumber;
    notesEl.value = source.notes;
    pay.setTerms(source.paymentTerms);
    pay.tempo.value = source.paymentTerms === 'tunai' ? '0' : String(source.tempoDays);
    channelEl.value = source.paymentChannel;
    lines = source.lines.map(purchaseToDocLine);
    syncSupplierInfo();
    recalc();
  }

  function refreshPoOptions(): void {
    const chosen = poSelectEl.value;
    poSelectEl.replaceChildren(
      option(TEXT.pilihPo, ''),
      ...purchaseOrders().map((p) => {
        const supplier = dataset.suppliers.find((s) => s.id === p.supplierId);
        return option(
          `${p.number} - ${supplier?.name ?? 'Pemasok'} (${formatRupiah(p.total)})`,
          p.number,
        );
      }),
    );
    poSelectEl.value = chosen;
  }

  // Simpan memperbarui HPP rata-rata dan Harga Beli Akhir: ongkos kirim per satuan ikut menjadi
  // biaya barang. Satu faktur dihitung sekali supaya Simpan berulang tidak menggeser HPP.
  function applyPurchaseCost(): void {
    if (costedInvoices.has(draft.invoiceNumber)) {
      return;
    }
    costedInvoices.add(draft.invoiceNumber);
    for (const update of purchaseCostUpdates(lines, productOf)) {
      store.saveProduct({
        ...update.product,
        hppAvg: update.hppAvg,
        lastPurchasePrice: update.lastPurchasePrice,
        lastPurchaseDate: dateEl.value,
      });
    }
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
      applyPurchaseCost();
      showToast({
        kind: 'success',
        text: `Faktur Pembelian ${draft.invoiceNumber} berhasil disimpan.`,
      });
    },
  });
  const printButton = createButton({
    text: TEXT.cetak,
    variant: 'secondary',
    icon: 'printer',
    onClick: () => {
      if (lines.length === 0) {
        showToast({ kind: 'info', text: TEXT.belumCetak });
        return;
      }
      window.print();
    },
  });

  supplierEl.input.addEventListener('focus', () => {
    dataset = store.getState().data;
  });
  poSelectEl.addEventListener('focus', refreshPoOptions);
  poSelectEl.addEventListener('change', () => {
    const order = purchaseOrders().find((item) => item.number === poSelectEl.value);
    if (order === undefined) {
      return;
    }
    fillFromDraft(importFromPurchaseOrder(order, dataset));
    showToast({ kind: 'success', text: `Data berhasil diimpor dari ${order.number}.` });
  });

  // --- Susun halaman ---
  refreshPoOptions();
  syncSupplierInfo();
  recalc();
  const bar = el(
    'div',
    { className: 'bo-trx__bar' },
    search.root,
    saveButton,
    printButton,
    countEl,
  );
  const container = el(
    'div',
    { className: 'bo-form-page bo-trx bo-trx-doc' },
    head.root,
    el('div', { className: 'bo-trx__body' }, bar, table.root, totals.root),
  );

  if (initialPoNumber !== undefined) {
    const order = purchaseOrders().find((item) => item.number === initialPoNumber);
    if (order !== undefined) {
      poSelectEl.value = order.number;
      fillFromDraft(importFromPurchaseOrder(order, dataset));
    }
  }

  if (invoiceNumber !== undefined) {
    const found = purchaseDraftFromNumber(dataset, invoiceNumber);
    if (found !== undefined) {
      fillFromDraft(found);
    }
  }

  return { element: container, destroy: () => undefined };
}
