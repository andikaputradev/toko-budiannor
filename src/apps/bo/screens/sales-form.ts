import '../../../styles/bo-trx.css';
import { el } from '../../../shared/dom';
import { formatRupiah } from '../../../shared/format';
import { label } from '../../../shared/messages';
import { createButton } from '../../../shared/ui/button';
import { icon } from '../../../shared/icons';
import { openModal } from '../../../shared/ui/modal';
import { showToast } from '../../../shared/ui/toast';
import type { BoSession } from '../bo-session';
import type { ScreenHandle } from './login';
import {
  buildSalesInvoiceWhatsAppMessage,
  calculateSalesTotals,
  createSalesInvoiceDraft,
  fromDocLine,
  generateWhatsAppUrl,
  getCustomerCreditInfo,
  importedSoNumbers,
  importFromSalesOrder,
  toDocLine,
  type SalesInvoiceDraft,
} from '../domain/sales-transaction';
import { docGrandTotal, docSummary, isPromoExpr, moveLine, type DocLine } from '../domain/doc-line';
import { expeditionSeeds } from '../domain/expedition';
import { createDocHead } from './trx/doc-head';
import { createItemSearch } from './trx/item-search';
import { openLineDialog } from './trx/line-dialog';
import { createLinesTable, createTotalsBox } from './trx/lines-table';
import { itemCountText, TRX_TEXT as T } from './trx/text';

const TEXT = {
  tanggal: 'Tanggal',
  noInvoice: 'No. Invoice',
  kepala: 'Data faktur penjualan',
  noSo: 'No. SO',
  keterangan: 'Keterangan',
  pelanggan: 'Pelanggan',
  alamat: 'Alamat',
  telepon: 'Telepon',
  syaratBayar: 'Syarat Bayar *',
  tempo: 'Tempo',
  metode: 'Metode Pembayaran',
  sales: 'Sales',
  ekspedisi: 'Ekspedisi',
  pilihPelanggan: '-- Pilih Pelanggan --',
  pilihSo: '-- Pilih SO Pending --',
  alamatPengiriman: 'Alamat Pengiriman',
  catatan: 'Catatan pengiriman ...',
  simpan: 'Simpan',
  cetak: 'Cetak',
  isiSj: 'Isi SJ Ekspedisi',
  baru: 'Baru',
  infoPiutang: 'Info Piutang Pelanggan',
  belumBarang: 'Faktur belum memiliki item barang.',
  tandaiKoli: 'Tandai barang pada kolom Koli dahulu.',
  fakturBaru: 'Faktur baru siap diisi.',
} as const;

const EXPEDITIONS = [
  'JNE Cargo',
  'Dakota Cargo',
  'Indah Logistik',
  'Armada Truk Toko',
  'Ambil Sendiri',
] as const;

function option(text: string, value: string): HTMLOptionElement {
  return el('option', { text, attrs: { value } });
}

function selectWith(options: readonly (readonly [string, string])[]): HTMLSelectElement {
  const select = el('select', { className: 'input is-select' });
  for (const [value, text] of options) {
    select.append(option(text, value));
  }
  return select;
}

// Faktur Penjualan (gambar klien 9): kepala berlabel sebaris, kotak cari barang, tabel baris
// dengan kolom Koli, dan kotak total. Barang dipilih lewat dialog Rincian Barang (gambar 12).
export function renderSalesForm(
  session: BoSession,
  go: (path: string) => void,
  initialSoNumber?: string,
): ScreenHandle {
  const store = session.store;
  let dataset = store.getState().data;
  // Dibaca ulang tiap kali: SO bisa dibuat di tab lain selagi formulir ini terbuka.
  const salesOrders = () => store.getState().salesOrders;
  const isOwner = store.getState().role === 'owner';

  let draft: SalesInvoiceDraft = createSalesInvoiceDraft(dataset);
  let lines: DocLine[] = [];
  const productOf = (id: string) => dataset.products.find((item) => item.id === id);
  const codeOf = (id: string): string => productOf(id)?.code ?? '';

  // --- Kepala ---
  const dateEl = el('input', {
    className: 'input',
    attrs: { type: 'date', value: draft.date },
  });
  const invoiceNumEl = el('input', {
    className: 'input is-readonly',
    attrs: { type: 'text', readonly: 'true', value: draft.invoiceNumber },
  });
  const soSelectEl = el('select', { className: 'input is-select' });
  const customerSelectEl = el('select', { className: 'input is-select' });
  const addressEl = el('input', {
    className: 'input',
    attrs: { type: 'text', placeholder: TEXT.alamatPengiriman },
  });
  const phoneEl = el('input', {
    className: 'input',
    attrs: { type: 'tel', placeholder: '0812...' },
  });
  const notesEl = el('input', {
    className: 'input',
    attrs: { type: 'text', placeholder: TEXT.catatan },
  });
  const salesPersonEl = el('input', {
    className: 'input',
    attrs: { type: 'text', value: draft.salesPerson },
  });
  const expeditionEl = selectWith(EXPEDITIONS.map((name) => [name, name] as const));
  const termsEl = selectWith([
    ['piutang', 'PIUTANG'],
    ['tunai', 'TUNAI'],
  ]);
  const tempoEl = selectWith([
    ['30', '30 HARI'],
    ['14', '14 HARI'],
    ['7', '7 HARI'],
    ['0', 'CASH / 0 HARI'],
  ]);
  const channelEl = selectWith([
    ['kas', 'KAS TOKO'],
    ['bank', 'TRANSFER BANK'],
  ]);

  const creditBoxEl = el('div', { className: 'bo-credit-box' });
  const aside = el(
    'aside',
    { className: 'bo-trx-head__aside' },
    el('h2', { className: 'bo-trx-head__asidetitle', text: TEXT.infoPiutang }),
    creditBoxEl,
  );

  const head = createDocHead(
    [
      { key: 'date', label: TEXT.tanggal, control: dateEl, col: 1, row: 1 },
      { key: 'invoice', label: TEXT.noInvoice, control: invoiceNumEl, col: 1, row: 2 },
      { key: 'so', label: TEXT.noSo, control: soSelectEl, col: 1, row: 3 },
      { key: 'customer', label: TEXT.pelanggan, control: customerSelectEl, col: 2, row: 1 },
      { key: 'address', label: TEXT.alamat, control: addressEl, col: 2, row: 2 },
      { key: 'phone', label: TEXT.telepon, control: phoneEl, col: 2, row: 3 },
      { key: 'terms', label: TEXT.syaratBayar, control: termsEl, col: 3, row: 1 },
      { key: 'tempo', label: TEXT.tempo, control: tempoEl, col: 3, row: 2 },
      { key: 'channel', label: TEXT.metode, control: channelEl, col: 3, row: 3 },
      { key: 'sales', label: TEXT.sales, control: salesPersonEl, col: 4, row: 1 },
      { key: 'expedition', label: TEXT.ekspedisi, control: expeditionEl, col: 4, row: 2 },
      { key: 'notes', label: TEXT.keterangan, control: notesEl, col: 1, row: 4, span: 3 },
    ],
    aside,
    TEXT.kepala,
  );

  // --- Barang dan total ---
  const countEl = el('span', { className: 'bo-trx__count', text: itemCountText(0, 0) });
  const totals = createTotalsBox({
    onChange: () => {
      recalc();
    },
  });
  const table = createLinesTable({
    mode: 'penjualan',
    lines: () => lines,
    onEdit: (id) => {
      editLine(id);
    },
    onReorder: (from, to) => {
      lines = moveLine(lines, from, to);
    },
    onKoli: (id, value) => {
      lines = lines.map((line) => (line.id === id ? { ...line, koli: value } : line));
    },
    isPromo: (line) => {
      const product = productOf(line.productId);
      return product !== undefined && isPromoExpr(product, line.discountExpr);
    },
  });
  const search = createItemSearch({
    products: () => store.getState().data.products,
    onPick: (product) => {
      openLineDialog({
        kind: 'jual',
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
      kind: 'jual',
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

  // --- Info piutang ---
  const creditRow = (text: string, value: string, tone = ''): HTMLElement =>
    el(
      'div',
      { className: `bo-credit-stat${tone === '' ? '' : ` ${tone}`}` },
      el('span', { className: 'bo-credit-stat__lbl', text }),
      el('span', { className: 'bo-credit-stat__val', text: value }),
    );

  function syncCustomerInfo(grandTotal: number): void {
    const customer = dataset.customers.find((item) => item.id === customerSelectEl.value);
    if (customer === undefined) {
      creditBoxEl.replaceChildren(
        creditRow(label('labelTotalPiutang'), formatRupiah(0)),
        creditRow(label('labelPiutangJatuhTempo'), formatRupiah(0), 'is-warning'),
        creditRow(label('labelPlafonKredit'), '-'),
        creditRow(label('labelSisaPlafon'), '-'),
      );
      return;
    }
    const credit = getCustomerCreditInfo(customer, grandTotal);
    creditBoxEl.replaceChildren(
      creditRow(label('labelTotalPiutang'), formatRupiah(credit.totalPiutang)),
      creditRow(
        label('labelPiutangJatuhTempo'),
        formatRupiah(credit.piutangJatuhTempo),
        'is-warning',
      ),
      creditRow(label('labelPlafonKredit'), formatRupiah(credit.creditLimit)),
      creditRow(
        label('labelSisaPlafon'),
        credit.isOverlimit
          ? label('labelPeringatanOverlimit')
          : formatRupiah(credit.remainingCredit),
        credit.isOverlimit ? 'is-danger' : 'is-success',
      ),
    );
  }

  function recalc(): void {
    const summary = docSummary(lines);
    const values = totals.values();
    const grand = docGrandTotal(summary.subtotal, values.discount, values.extra);
    totals.setTotals({ subtotal: summary.subtotal, total: grand });
    countEl.textContent = itemCountText(summary.count, summary.quantity);
    table.refresh();
    syncCustomerInfo(grand);
  }

  // Salinan faktur untuk pesan WhatsApp dan benih Surat Jalan.
  function snapshot(): SalesInvoiceDraft {
    const values = totals.values();
    const invoiceLines = lines.map(fromDocLine);
    const sums = calculateSalesTotals(invoiceLines, values.discount, values.extra);
    const customer = dataset.customers.find((item) => item.id === customerSelectEl.value);
    return {
      ...draft,
      date: dateEl.value,
      customerId: customer?.id,
      customerName: customer?.name ?? '',
      customerAddress: addressEl.value,
      customerPhone: phoneEl.value,
      notes: notesEl.value,
      salesPerson: salesPersonEl.value,
      expedition: expeditionEl.value,
      paymentTerms: termsEl.value === 'tunai' ? 'tunai' : 'piutang',
      tempoDays: Number(tempoEl.value),
      paymentChannel: channelEl.value === 'bank' ? 'bank' : 'kas',
      lines: invoiceLines,
      ...sums,
    };
  }

  function fillFromDraft(source: SalesInvoiceDraft): void {
    draft = source;
    invoiceNumEl.value = source.invoiceNumber;
    dateEl.value = source.date;
    customerSelectEl.value = source.customerId ?? '';
    addressEl.value = source.customerAddress;
    phoneEl.value = source.customerPhone;
    notesEl.value = source.notes;
    termsEl.value = source.paymentTerms;
    lines = source.lines.map((line) => toDocLine(line, codeOf(line.productId)));
    recalc();
  }

  function refreshDropdowns(): void {
    dataset = store.getState().data;
    customerSelectEl.replaceChildren(
      option(TEXT.pilihPelanggan, ''),
      ...dataset.customers.map((c) => option(`${c.name} (${c.phone || '-'})`, c.id)),
    );
    refreshSoOptions();
  }

  function refreshSoOptions(): void {
    const chosen = soSelectEl.value;
    soSelectEl.replaceChildren(
      option(TEXT.pilihSo, ''),
      ...salesOrders().map((s) => {
        const customer = dataset.customers.find((c) => c.id === s.customerId);
        return option(
          `${s.number} - ${customer?.name ?? 'Umum'} (${formatRupiah(s.total)})`,
          s.number,
        );
      }),
    );
    soSelectEl.value = chosen;
  }

  // --- Cetak dan WhatsApp ---
  function openPrintWaModal(): void {
    const current = snapshot();
    const check = (id: string, checked: boolean): HTMLInputElement =>
      el('input', { attrs: { type: 'checkbox', checked: checked && 'true', id } });
    const item = (box: HTMLInputElement, text: string): HTMLElement =>
      el('label', { className: 'bo-chk-lbl' }, box, el('span', { text }));
    const preview = buildSalesInvoiceWhatsAppMessage(current, 'Toko Budiannor');
    const body = el(
      'div',
      { className: 'bo-print-modal-content' },
      el('h3', { className: 'bo-modal-sec-title', text: label('labelPilihanDokumen') }),
      el(
        'div',
        { className: 'bo-chk-grid' },
        item(check('chk-faktur', true), label('labelCetakFaktur')),
        item(check('chk-sj', true), label('labelCetakSuratJalan')),
        item(check('chk-so', false), label('labelCetakSuratOrder')),
        item(check('chk-do', false), label('labelCetakDoPengambilan')),
      ),
      el('h3', { className: 'bo-modal-sec-title', text: label('labelOpsiCetak') }),
      el(
        'div',
        { className: 'bo-chk-grid' },
        item(check('opt-kertas', true), label('labelKertasBesar')),
        item(check('opt-noheader', false), label('labelTanpaHeader')),
        item(check('opt-rekening', true), label('labelTampilkanNoRekening')),
      ),
      el('h3', { className: 'bo-modal-sec-title', text: 'Salinan Pesan WhatsApp' }),
      el('textarea', {
        className: 'input is-textarea bo-wa-preview',
        text: preview,
        attrs: { readonly: 'true', rows: '6', 'aria-label': 'Salinan Pesan WhatsApp' },
      }),
    );
    openModal({
      title: label('labelModalCetakWa'),
      body,
      actions: [
        {
          text: label('tombolKirimWa'),
          variant: 'primary',
          onClick: () => {
            const phone = phoneEl.value || current.customerPhone || '0811230988';
            window.open(generateWhatsAppUrl(phone, preview), '_blank');
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
        { text: label('tutup'), variant: 'secondary' },
      ],
    });
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
      showToast({ kind: 'success', text: `Faktur ${draft.invoiceNumber} berhasil disimpan.` });
      openPrintWaModal();
    },
  });
  const printButton = createButton({
    text: TEXT.cetak,
    variant: 'secondary',
    icon: 'printer',
    onClick: () => {
      if (lines.length === 0) {
        showToast({ kind: 'info', text: TEXT.belumBarang });
        return;
      }
      openPrintWaModal();
    },
  });
  const sjButton = createButton({
    text: TEXT.isiSj,
    variant: 'secondary',
    icon: 'package',
    onClick: () => {
      const marked = lines.filter((line) => line.koli);
      if (marked.length === 0) {
        showToast({ kind: 'info', text: TEXT.tandaiKoli });
        return;
      }
      const current = snapshot();
      expeditionSeeds.set(current.invoiceNumber, {
        invoiceNumber: current.invoiceNumber,
        date: current.date,
        expedition: current.expedition,
        customerName: current.customerName,
        customerAddress: current.customerAddress,
        customerPhone: current.customerPhone,
        koliLines: marked.map((line) => ({
          productName: line.productName,
          quantity: line.quantity,
          unit: line.unit,
        })),
      });
      go(`/bo/transaksi/surat-jalan?inv=${current.invoiceNumber}`);
    },
  });
  const newButton = createButton({
    text: TEXT.baru,
    variant: 'secondary',
    icon: 'plus',
    onClick: () => {
      fillFromDraft(createSalesInvoiceDraft(dataset));
      totals.discount.value = '0';
      totals.extra.value = '0';
      soSelectEl.value = '';
      salesPersonEl.value = draft.salesPerson;
      recalc();
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

  // --- Peristiwa kepala ---
  customerSelectEl.addEventListener('change', () => {
    const customer = dataset.customers.find((item) => item.id === customerSelectEl.value);
    addressEl.value = customer?.address ?? '';
    phoneEl.value = customer?.phone ?? '';
    recalc();
  });
  soSelectEl.addEventListener('focus', refreshSoOptions);
  soSelectEl.addEventListener('change', () => {
    const order = salesOrders().find((item) => item.number === soSelectEl.value);
    if (order === undefined) {
      return;
    }
    importedSoNumbers.add(order.number);
    fillFromDraft(importFromSalesOrder(order, dataset));
    showToast({ kind: 'success', text: `Data berhasil diimpor dari ${order.number}.` });
  });

  // --- Susun halaman ---
  refreshDropdowns();
  recalc();
  const bar = el(
    'div',
    { className: 'bo-trx__bar' },
    search.root,
    saveButton,
    printButton,
    sjButton,
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

  if (initialSoNumber !== undefined) {
    const order = salesOrders().find((item) => item.number === initialSoNumber);
    if (order !== undefined) {
      soSelectEl.value = order.number;
      importedSoNumbers.add(order.number);
      fillFromDraft(importFromSalesOrder(order, dataset));
    }
  }

  return { element: container, destroy: () => undefined };
}
