import '../../../styles/bo-trx.css';
import { el } from '../../../shared/dom';
import { wibDate } from '../../../shared/data/receivable';
import type { Dataset, PurchaseOrder, SalesOrder } from '../../../shared/data/types';
import { formatDecimal } from '../../../shared/format';
import { icon } from '../../../shared/icons';
import { createButton } from '../../../shared/ui/button';
import { showToast } from '../../../shared/ui/toast';
import type { BoSession } from '../bo-session';
import type { ScreenHandle } from './login';
import {
  docGrandTotal,
  docSummary,
  lineAmount,
  moveLine,
  nextLineId,
  type DocLine,
} from '../domain/doc-line';
import { nextOrderNumber, validateOrderDraft, type OrderKind } from '../domain/order-list';
import { createDocHead } from './trx/doc-head';
import { createItemSearch } from './trx/item-search';
import { openLineDialog } from './trx/line-dialog';
import { createLinesTable, createTotalsBox } from './trx/lines-table';
import { itemCountText, TRX_TEXT as T } from './trx/text';
import { ORDER_PATH } from './order-list';

const EXPEDITIONS = [
  'JNE Cargo',
  'Dakota Cargo',
  'Indah Logistik',
  'Armada Truk Toko',
  'Ambil Sendiri',
] as const;

const COPY = {
  po: {
    judul: 'Data pesanan pembelian',
    nomor: 'No PO',
    pihak: 'Pemasok',
    pilihPihak: '-- Pilih Pemasok --',
    petugas: 'Pemesan',
    pilihDulu: 'Pilih pemasok dahulu.',
    kosong: 'PO belum memiliki item barang.',
    simpan: (number: string) => `PO ${number} berhasil disimpan.`,
    ubah: (number: string) => `PO ${number} diperbarui.`,
    terms: [
      ['hutang', 'HUTANG'],
      ['tunai', 'TUNAI'],
    ] as const,
  },
  so: {
    judul: 'Data pesanan penjualan',
    nomor: 'No SO',
    pihak: 'Pelanggan',
    pilihPihak: '-- Pilih Pelanggan --',
    petugas: 'Sales',
    pilihDulu: 'Pilih pelanggan dahulu.',
    kosong: 'SO belum memiliki item barang.',
    simpan: (number: string) => `SO ${number} berhasil disimpan.`,
    ubah: (number: string) => `SO ${number} diperbarui.`,
    terms: [
      ['piutang', 'PIUTANG'],
      ['tunai', 'TUNAI'],
    ] as const,
  },
} as const;

const TEXT = {
  tanggal: 'Tanggal',
  syaratBayar: 'Syarat Bayar *',
  tempo: 'Tempo',
  ekspedisi: 'Ekspedisi',
  keterangan: 'Keterangan',
  simpan: 'Simpan',
  cetak: 'Cetak',
  belumCetak: 'Belum ada barang untuk dicetak.',
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

const netUnitPrice = (line: DocLine): number =>
  line.quantity === 0 ? 0 : Math.round(lineAmount(line) / line.quantity);

function linesOfPurchaseOrder(order: PurchaseOrder, dataset: Dataset): DocLine[] {
  return order.lines.map((line) => {
    const product = dataset.products.find((item) => item.id === line.productId);
    return {
      id: nextLineId(),
      productId: line.productId,
      productName: product?.name ?? line.productId,
      code: product?.code ?? '',
      warehouse: order.warehouse === 'display' ? 'toko' : 'gudang',
      unit: line.unit,
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      discountExpr: '',
      shipping: 0,
      koli: false,
    };
  });
}

function linesOfSalesOrder(order: SalesOrder, dataset: Dataset): DocLine[] {
  return order.lines.map((line) => {
    const product = dataset.products.find((item) => item.id === line.productId);
    return {
      id: nextLineId(),
      productId: line.productId,
      productName: product?.name ?? line.productId,
      code: product?.code ?? '',
      warehouse: 'toko',
      unit: line.unit,
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      discountExpr: '',
      shipping: 0,
      koli: false,
    };
  });
}

// Formulir PO atau SO (gambar klien 11): kepala berlabel sebaris, kotak cari barang, tabel baris
// tanpa Koli, kotak total, dan tombol Simpan dan Cetak. Simpan memasukkan pesanan ke store sesi
// sehingga muncul di daftar; membuka pesanan yang sudah ada menampilkannya tanpa menggandakan.
export function renderOrderForm(
  session: BoSession,
  go: (path: string) => void,
  kind: OrderKind,
  existingNumber?: string,
): ScreenHandle {
  const store = session.store;
  const copy = COPY[kind];
  const buy = kind === 'po';
  const dataset = store.getState().data;
  const isOwner = store.getState().role === 'owner';
  const today = wibDate(session.now());
  const existingNumbers = (): string[] =>
    buy
      ? store.getState().purchaseOrders.map((order) => order.number)
      : store.getState().salesOrders.map((order) => order.number);

  const existing =
    existingNumber === undefined
      ? undefined
      : buy
        ? store.getState().purchaseOrders.find((order) => order.number === existingNumber)
        : store.getState().salesOrders.find((order) => order.number === existingNumber);
  const number = existing?.number ?? nextOrderNumber(kind, existingNumbers(), today);

  let lines: DocLine[] = [];
  let extraTouched = false;
  const productOf = (id: string) => dataset.products.find((item) => item.id === id);

  // --- Kepala ---
  const dateEl = el('input', { className: 'input', attrs: { type: 'date', value: today } });
  const numberEl = el('input', {
    className: 'input is-readonly',
    attrs: { type: 'text', readonly: 'true', value: number },
  });
  const partyEl = el('select', { className: 'input is-select' });
  partyEl.append(
    option(copy.pilihPihak, ''),
    ...(buy ? dataset.suppliers : dataset.customers).map((party) =>
      option(`${party.name} (${party.phone || '-'})`, party.id),
    ),
  );
  const staffEl = el('input', {
    className: 'input',
    attrs: {
      type: 'text',
      value: buy ? (session.state().user?.name ?? '') : 'Salahudin',
    },
  });
  const termsEl = selectWith(copy.terms);
  const tempoEl = selectWith([
    ['30', '30 HARI'],
    ['14', '14 HARI'],
    ['7', '7 HARI'],
    ['0', 'CASH / 0 HARI'],
  ]);
  const expeditionEl = selectWith(EXPEDITIONS.map((name) => [name, name] as const));
  const notesEl = el('input', {
    className: 'input',
    attrs: { type: 'text', placeholder: 'Catatan pesanan ...' },
  });

  const head = createDocHead(
    [
      { key: 'date', label: TEXT.tanggal, control: dateEl, col: 1, row: 1 },
      { key: 'number', label: copy.nomor, control: numberEl, col: 1, row: 2 },
      { key: 'party', label: copy.pihak, control: partyEl, col: 2, row: 1 },
      { key: 'staff', label: copy.petugas, control: staffEl, col: 2, row: 2 },
      { key: 'terms', label: TEXT.syaratBayar, control: termsEl, col: 3, row: 1 },
      { key: 'tempo', label: TEXT.tempo, control: tempoEl, col: 3, row: 2 },
      { key: 'expedition', label: TEXT.ekspedisi, control: expeditionEl, col: 4, row: 1 },
      { key: 'notes', label: TEXT.keterangan, control: notesEl, col: 4, row: 2 },
    ],
    undefined,
    copy.judul,
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
    mode: 'order',
    lines: () => lines,
    onEdit: (id) => {
      editLine(id);
    },
    onReorder: (from, to) => {
      lines = moveLine(lines, from, to);
    },
  });
  const dialogKind = buy ? 'beli' : 'jual';
  const search = createItemSearch({
    products: () => store.getState().data.products,
    onPick: (product) => {
      openLineDialog({
        kind: dialogKind,
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
      kind: dialogKind,
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

  function grandTotal(): number {
    const summary = docSummary(lines);
    const values = totals.values();
    return docGrandTotal(summary.subtotal, values.discount, values.extra);
  }

  function recalc(): void {
    if (buy && !extraTouched) {
      totals.extra.value = formatDecimal(
        lines.reduce((sum, line) => sum + line.shipping, 0),
        2,
      );
    }
    const summary = docSummary(lines);
    totals.setTotals({ subtotal: summary.subtotal, total: grandTotal() });
    countEl.textContent = itemCountText(summary.count, summary.quantity);
    table.refresh();
  }

  // --- Simpan dan Cetak ---
  function save(): void {
    const issue = validateOrderDraft({ partyId: partyEl.value, lines: lines.length });
    if (issue === 'party') {
      showToast({ kind: 'info', text: copy.pilihDulu });
      return;
    }
    if (issue === 'lines') {
      showToast({ kind: 'info', text: copy.kosong });
      return;
    }
    if (existing !== undefined) {
      showToast({ kind: 'success', text: copy.ubah(existing.number) });
      go(ORDER_PATH[kind]);
      return;
    }
    // Nomor dibuat ulang bila sudah dipakai formulir lain yang disimpan lebih dulu.
    const saved = existingNumbers().includes(number)
      ? nextOrderNumber(kind, existingNumbers(), today)
      : number;
    const createdAt = session.now().toISOString();
    const createdBy = session.state().user?.id ?? '';
    const total = grandTotal();
    const notes = notesEl.value;
    if (buy) {
      store.addPurchaseOrder({
        id: `PO-${saved}`,
        number: saved,
        createdAt,
        createdBy,
        supplierId: partyEl.value,
        warehouse: lines[0]?.warehouse === 'toko' ? 'display' : 'besar',
        lines: lines.map((line) => ({
          productId: line.productId,
          unit: line.unit,
          quantity: line.quantity,
          unitPrice: netUnitPrice(line),
        })),
        total,
        status: 'dipesan',
        notes,
      });
    } else {
      store.addSalesOrder({
        id: `SO-${saved}`,
        number: saved,
        createdAt,
        createdBy,
        customerId: partyEl.value,
        lines: lines.map((line) => ({
          productId: line.productId,
          unit: line.unit,
          quantity: line.quantity,
          unitPrice: netUnitPrice(line),
        })),
        total,
        payment: termsEl.value === 'tunai' ? 'tunai' : 'piutang',
        downPayment: 0,
        status: 'draf',
        source: 'owner',
        notes,
      });
    }
    showToast({ kind: 'success', text: copy.simpan(saved) });
    go(ORDER_PATH[kind]);
  }

  const saveButton = createButton({
    text: TEXT.simpan,
    variant: 'primary',
    icon: 'save',
    onClick: save,
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

  // --- Isi awal untuk pesanan yang sudah ada ---
  if (existing !== undefined) {
    dateEl.value = wibDate(new Date(existing.createdAt));
    notesEl.value = existing.notes ?? '';
    if ('supplierId' in existing) {
      partyEl.value = existing.supplierId;
      lines = linesOfPurchaseOrder(existing, dataset);
    } else {
      partyEl.value = existing.customerId ?? '';
      termsEl.value = existing.payment === 'tunai' ? 'tunai' : 'piutang';
      lines = linesOfSalesOrder(existing, dataset);
    }
  }

  recalc();
  const container = el(
    'div',
    { className: 'bo-form-page bo-trx bo-trx-doc' },
    head.root,
    el(
      'div',
      { className: 'bo-trx__body' },
      el(
        'div',
        { className: 'bo-trx__bar' },
        search.root,
        saveButton,
        printButton,
        findButton,
        countEl,
      ),
      table.root,
      totals.root,
    ),
  );
  return { element: container, destroy: () => undefined };
}
