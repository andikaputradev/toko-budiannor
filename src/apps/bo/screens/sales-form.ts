import '../../../styles/bo-trx.css';
import { el } from '../../../shared/dom';
import { formatDecimal, formatRupiah } from '../../../shared/format';
import { label } from '../../../shared/messages';
import { createButton } from '../../../shared/ui/button';
import { showToast } from '../../../shared/ui/toast';
import type { BoSession } from '../bo-session';
import type { ScreenHandle } from './login';
import {
  calculateSalesTotals,
  createSalesInvoiceDraft,
  fromDocLine,
  getCustomerCreditInfo,
  importedSoNumbers,
  importFromSalesOrder,
  salesDraftFromNumber,
  toDocLine,
  type SalesInvoiceDraft,
} from '../domain/sales-transaction';
import { docGrandTotal, docSummary, isPromoExpr, moveLine, type DocLine } from '../domain/doc-line';
import { expeditionSeeds, nextSeedVersion } from '../domain/expedition';
import { createDocHead } from './trx/doc-head';
import { createItemSearch } from './trx/item-search';
import { openLineDialog } from './trx/line-dialog';
import { createLinesTable, createTotalsBox } from './trx/lines-table';
import { createPaymentFields } from './trx/payment-fields';
import { createPartySearch, customerParties } from './trx/party-search';
import { openSalesPrintDialog } from './trx/print-dialog';
import { createSalesSelect } from './trx/sales-select';
import { itemCountText, TRX_TEXT } from './trx/text';

const TEXT = {
  tanggal: 'Tanggal',
  nomor: 'Nomor',
  kepala: 'Data faktur penjualan',
  noSo: 'No. SO',
  keterangan: 'Keterangan',
  pelanggan: 'Pelanggan',
  syaratBayar: 'Cara Bayar',
  tempo: 'Tempo',
  metode: 'Kas / Bank',
  sales: 'Sales',
  ekspedisi: 'Ekspedisi',
  daftarPelanggan: 'Daftar pelanggan',
  pelangganKosong: 'Pelanggan tidak ditemukan.',
  pilihSo: '-- Pilih SO Pending --',
  catatan: 'Catatan pengiriman ...',
  simpan: 'Simpan',
  cetak: 'Cetak',
  isiSj: 'Isi SJ Ekspedisi',
  infoPiutang: 'Info Piutang Pelanggan',
  belumBarang: 'Faktur belum memiliki item barang.',
  tandaiKoli: 'Tandai barang pada kolom Koli dahulu.',
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
  invoiceNumber?: string,
): ScreenHandle {
  const store = session.store;
  let dataset = store.getState().data;
  // Dibaca ulang tiap kali: SO bisa dibuat di tab lain selagi formulir ini terbuka.
  const salesOrders = () => store.getState().salesOrders;
  const isOwner = store.getState().role === 'owner';

  let draft: SalesInvoiceDraft = createSalesInvoiceDraft(dataset);
  let lines: DocLine[] = [];
  // Dibaca dari store tiap kali: barang bisa dibuat di tab lain selagi formulir ini terbuka.
  const productOf = (id: string) => store.getState().data.products.find((item) => item.id === id);
  const codeOf = (id: string): string => productOf(id)?.code ?? '';

  // --- Kepala ---
  // Alamat dan telepon tidak lagi ada di kepala faktur: keduanya diambil dari data pelanggan.
  const contact = { address: '', phone: '' };
  const dateEl = el('input', {
    className: 'input',
    attrs: { type: 'date', value: draft.date },
  });
  // Nomor dibuat otomatis (tidak diketik) dan dilewati papan ketik.
  const invoiceNumEl = el('input', {
    className: 'input is-readonly',
    attrs: { type: 'text', readonly: 'true', tabindex: '-1', value: draft.invoiceNumber },
  });
  const soSelectEl = el('select', { className: 'input is-select' });
  // Pelanggan dicari seperti nama barang; memilih atau mengosongkannya memperbarui info piutang.
  const customerEl = createPartySearch({
    parties: () => customerParties(store.getState().data.customers),
    placeholder: TRX_TEXT.cariPilih,
    emptyText: TEXT.pelangganKosong,
    listLabel: TEXT.daftarPelanggan,
    onChange: () => {
      dataset = store.getState().data;
      const customer = dataset.customers.find((item) => item.id === customerEl.value());
      contact.address = customer?.address ?? '';
      contact.phone = customer?.phone ?? '';
      recalc();
    },
  });
  const notesEl = el('input', {
    className: 'input',
    attrs: { type: 'text', placeholder: TEXT.catatan },
  });
  const salesEl = createSalesSelect(store, draft.salesPerson);
  const expeditionEl = selectWith(EXPEDITIONS.map((name) => [name, name] as const));
  // Cara Bayar menentukan isian lain: piutang membuka Tempo, tunai membuka Kas / Bank.
  const pay = createPaymentFields({ credit: 'piutang', withChannel: true });
  const termsEl = pay.terms;
  const channelEl = pay.channel ?? selectWith([]);

  const creditBoxEl = el('div', { className: 'bo-credit-box' });
  const aside = el(
    'aside',
    { className: 'bo-trx-head__aside' },
    el('h2', { className: 'bo-trx-head__asidetitle', text: TEXT.infoPiutang }),
    creditBoxEl,
  );

  // Urutan fokus: tanggal, No. SO, pelanggan, cara bayar, tempo, kas / bank, sales, ekspedisi,
  // lalu keterangan terakhir.
  const head = createDocHead(
    [
      { key: 'invoice', label: TEXT.nomor, control: invoiceNumEl, col: 1, row: 1 },
      { key: 'date', label: TEXT.tanggal, control: dateEl, col: 1, row: 2 },
      { key: 'so', label: TEXT.noSo, control: soSelectEl, col: 1, row: 3 },
      {
        key: 'customer',
        label: TEXT.pelanggan,
        control: customerEl.root,
        labelFor: customerEl.input,
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
      { key: 'sales', label: TEXT.sales, control: salesEl.select, col: 4, row: 1 },
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
    const customer = dataset.customers.find((item) => item.id === customerEl.value());
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
    const customer = dataset.customers.find((item) => item.id === customerEl.value());
    return {
      ...draft,
      date: dateEl.value,
      customerId: customer?.id,
      customerName: customer?.name ?? customerEl.name(),
      customerAddress: contact.address,
      customerPhone: contact.phone,
      notes: notesEl.value,
      salesPerson: salesEl.select.value,
      expedition: expeditionEl.value,
      paymentTerms: termsEl.value === 'tunai' ? 'tunai' : 'piutang',
      tempoDays: pay.tempoDays(),
      paymentChannel: channelEl.value === 'bank' ? 'bank' : 'kas',
      lines: invoiceLines,
      ...sums,
    };
  }

  function fillFromDraft(source: SalesInvoiceDraft): void {
    draft = source;
    invoiceNumEl.value = source.invoiceNumber;
    dateEl.value = source.date;
    customerEl.set(source.customerId, source.customerName);
    if (source.salesPerson !== '') {
      salesEl.set(source.salesPerson);
    }
    totals.discount.value = formatDecimal(source.invoiceDiscount, 2);
    contact.address = source.customerAddress;
    contact.phone = source.customerPhone;
    notesEl.value = source.notes;
    pay.setTerms(source.paymentTerms);
    pay.tempo.value = source.paymentTerms === 'tunai' ? '0' : String(source.tempoDays);
    channelEl.value = source.paymentChannel;
    lines = source.lines.map((line) => toDocLine(line, codeOf(line.productId)));
    recalc();
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
      // Setelah Simpan tidak ada kotak cetak (revisi final); Cetak tetap lewat tombolnya sendiri.
      showToast({ kind: 'success', text: `Faktur ${draft.invoiceNumber} berhasil disimpan.` });
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
      openSalesPrintDialog({ current: snapshot, lines: () => lines });
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
      go(`/bo/transaksi/surat-jalan?inv=${current.invoiceNumber}&v=${String(nextSeedVersion())}`);
    },
  });

  // --- Peristiwa kepala ---
  customerEl.input.addEventListener('focus', () => {
    dataset = store.getState().data;
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
  refreshSoOptions();
  recalc();
  const bar = el(
    'div',
    { className: 'bo-trx__bar' },
    search.root,
    saveButton,
    printButton,
    sjButton,
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

  if (invoiceNumber !== undefined) {
    const found = salesDraftFromNumber(dataset, invoiceNumber);
    if (found !== undefined) {
      fillFromDraft(found);
    }
  }

  return { element: container, destroy: () => undefined };
}
