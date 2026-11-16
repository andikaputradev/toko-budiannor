import { el, nextId } from '../../../shared/dom';
import { formatDate, formatDecimal, formatTime } from '../../../shared/format';
import { matchesPhrase } from '../../../shared/data/search-index';
import { wibDate } from '../../../shared/data/receivable';
import { label, message } from '../../../shared/messages';
import type { Product, WarehouseId } from '../../../shared/data/types';
import { fromBase } from '../../../shared/data/units';
import { createButton } from '../../../shared/ui/button';
import { createSelectField } from '../../../shared/ui/field';
import { openModal } from '../../../shared/ui/modal';
import { showToast } from '../../../shared/ui/toast';
import { BO_DEVICE, BO_IP, type BoSession, type TransferDoc } from '../bo-session';
import { type TransferLineDraft } from '../domain/transfer';
import { dateRangeFor, type DateRangeKind } from '../domain/transaction-list';
import { createProductPicker } from '../picker';
import type { ScreenHandle } from './login';
import { screenActive } from '../screen-active';
import { createScrollRegion, openDocumentPreview, userName } from './mutasi/parts';
import {
  createDateFilter,
  createListPage,
  createRefreshButton,
  createRowSelection,
  createSearchBox,
  refuseDelete,
} from './trx/list-page';
import { MUT_TEXT, mut } from './mutasi/text';

const LIST_PATH = '/bo/mutasi';
const FORM_PATH = '/bo/mutasi?baru=1';

// Nomor mutasi yang baru disimpan pada sesi ini: barisnya diberi warna sorot di daftar.
let justSaved: string | undefined;

function isPc(): boolean {
  return (
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(hover: hover) and (pointer: fine)').matches
  );
}

export function preferredUnit(product: Product): string {
  const packaged = product.units[1];
  return (
    product.defaultUnit ??
    (product.baseUnit === 'Kg' && packaged !== undefined ? packaged.code : product.baseUnit)
  );
}

function warehouseName(warehouse: WarehouseId): string {
  return label(warehouse === 'besar' ? 'namaGudangBesar' : 'namaGudangDisplay');
}

function stamp(iso: string): string {
  const date = new Date(iso);
  return `${formatDate(date)} ${formatTime(date)}`;
}

// Transfer Stok: daftar mutasi (gambar klien 14) dan, lewat "Buat Do Transfer", formulir input
// (gambar 15) pada tab yang sama.
export function renderTransfer(
  session: BoSession,
  go: (path: string) => void,
  creating = false,
): ScreenHandle {
  return creating ? renderTransferForm(session, go) : renderTransferList(session, go);
}

const LIST_TEXT = {
  segarkan: 'Segarkan',
  cari: 'Cari mutasi...',
  cariNama: 'Cari nomor mutasi, gudang, atau keterangan',
  kolomBarang: 'Jumlah Barang',
  kolomItem: 'Jumlah Item',
  tidakCocok: 'Tidak ada mutasi yang sesuai filter.',
  ditolak: 'Mutasi stok yang sudah tersimpan tidak dapat dihapus karena sudah memindahkan stok.',
} as const;

// Daftar Transfer Stok (gambar klien 14 dan 32): Tambah, Ubah, Hapus, Cetak, Keluar, filter Tanggal,
// pencarian, dan tabel mutasi. Ubah membuka bukti transfer dokumen terpilih.
function renderTransferList(session: BoSession, go: (path: string) => void): ScreenHandle {
  const store = session.store;
  const today = wibDate(session.now());
  const selection = createRowSelection();
  const dateSelect = createDateFilter();
  const search = createSearchBox(LIST_TEXT.cariNama, LIST_TEXT.cari);
  const body = el('tbody');
  const table = el(
    'div',
    {
      className: 'bo-trx__lines',
      attrs: { tabindex: '0', role: 'region', 'aria-label': MUT_TEXT.daftarMutasi },
    },
    el(
      'table',
      { className: 'bo-trx-table bo-trx-table--list' },
      el(
        'thead',
        {},
        el(
          'tr',
          {},
          el('th', { text: label('noMutasi') }),
          el('th', { text: label('kolomWaktu') }),
          el('th', { text: label('gudangAsal') }),
          el('th', { text: label('gudangTujuan') }),
          el('th', { className: 'is-end', text: LIST_TEXT.kolomBarang }),
          el('th', { className: 'is-end', text: LIST_TEXT.kolomItem }),
          el('th', { text: MUT_TEXT.kolomUser }),
          el('th', { text: MUT_TEXT.kolomKeterangan }),
        ),
      ),
      body,
    ),
  );

  const docs = (): TransferDoc[] => [...session.state().transfers].reverse();

  const paint = (): void => {
    const all = docs();
    const range = dateRangeFor(dateSelect.value as DateRangeKind, today);
    const rows = all.filter((doc) => {
      const day = wibDate(new Date(doc.at));
      if (range.startDate !== undefined && day < range.startDate) {
        return false;
      }
      if (range.endDate !== undefined && day > range.endDate) {
        return false;
      }
      return matchesPhrase(
        `${doc.number} ${warehouseName(doc.from)} ${warehouseName(doc.to)} ${doc.note} ${userName(store, doc.userId)}`,
        search.input.value,
      );
    });
    if (rows.length === 0) {
      body.replaceChildren(
        el(
          'tr',
          { className: 'bo-trx-table__empty' },
          el('td', {
            text: all.length === 0 ? MUT_TEXT.mutasiKosong : LIST_TEXT.tidakCocok,
            attrs: { colspan: '8' },
          }),
        ),
      );
      return;
    }
    body.replaceChildren(
      ...rows.map((doc) => {
        const tr = el(
          'tr',
          { attrs: { 'data-number': doc.number } },
          el('td', {}, el('strong', { className: 'bo-trx-link', text: doc.number })),
          el('td', { className: 'bo-nowrap', text: stamp(doc.at) }),
          el('td', { text: warehouseName(doc.from) }),
          el('td', { text: warehouseName(doc.to) }),
          el('td', { className: 'is-end', text: String(doc.lines.length) }),
          el('td', {
            className: 'is-end',
            text: formatDecimal(doc.lines.reduce((sum, line) => sum + line.quantity, 0)),
          }),
          el('td', { text: userName(store, doc.userId) }),
          el('td', { className: 'bo-trx-notes', text: doc.note, attrs: { title: doc.note } }),
        );
        selection.attach(tr, doc.number);
        return tr;
      }),
    );
  };

  const open = (number: string): void => {
    const doc = docs().find((item) => item.number === number);
    if (doc !== undefined) {
      openSavedTransfer(session, doc);
    }
  };

  dateSelect.addEventListener('change', paint);
  search.input.addEventListener('input', paint);
  const stop = session.subscribe(paint);
  const element = createListPage({
    title: label('riwayatMutasi'),
    kpis: [],
    selection,
    onCreate: () => {
      go(FORM_PATH);
    },
    onEdit: open,
    onDelete: () => {
      refuseDelete(LIST_TEXT.ditolak);
    },
    refresh: createRefreshButton(LIST_TEXT.segarkan, paint),
    filters: [dateSelect],
    search: search.root,
    table,
  });
  paint();
  if (justSaved !== undefined) {
    selection.select(justSaved);
  }
  return { element, destroy: stop };
}

// Bukti transfer dari dokumen yang sudah tersimpan.
function openSavedTransfer(session: BoSession, doc: TransferDoc): void {
  openDocumentPreview({
    modalTitle: MUT_TEXT.buktiTransfer,
    heading: MUT_TEXT.buktiTransfer,
    number: doc.number,
    intro: mut('buktiPembuka', {
      asal: warehouseName(doc.from),
      tujuan: warehouseName(doc.to),
      tanggal: formatDate(new Date(doc.at)),
    }),
    columns: [
      { text: 'No' },
      { text: label('kolomKode') },
      { text: label('kolomNama') },
      { text: label('jumlahMutasi'), end: true },
      { text: label('kolomSatuan') },
    ],
    rows: doc.lines.map((line, index) => [
      String(index + 1),
      line.code,
      line.name,
      formatDecimal(line.quantity),
      line.unit,
    ]),
    note:
      doc.note.trim() === ''
        ? MUT_TEXT.buktiTanpaKeterangan
        : mut('buktiKeterangan', { teks: doc.note.trim() }),
    signs: [
      { role: MUT_TEXT.dibuatOleh, name: userName(session.store, doc.userId) },
      { role: MUT_TEXT.disetujuiOleh, name: '' },
      { role: MUT_TEXT.diterimaOleh, name: '' },
    ],
    onPrint: () => {
      window.print();
    },
  });
}

function renderTransferForm(session: BoSession, go: (path: string) => void): ScreenHandle {
  const store = session.store;
  let from: WarehouseId = 'besar';
  let to: WarehouseId = 'display';
  let lines: TransferLineDraft[] = [];

  const options = [
    { value: 'display', text: label('namaGudangDisplay') },
    { value: 'besar', text: label('namaGudangBesar') },
  ];
  const fromField = createSelectField({ labelText: label('gudangAsal'), options, value: from });
  const toField = createSelectField({ labelText: label('gudangTujuan'), options, value: to });
  const dateOutput = el('output', { className: 'bo-mut-fact__value' });
  const numberOutput = el('output', { className: 'bo-mut-fact__value' });
  const noteId = nextId('mutasi-keterangan');
  const note = el('input', {
    className: 'input',
    attrs: {
      id: noteId,
      type: 'text',
      maxlength: '120',
      autocomplete: 'off',
    },
  });
  const error = el('p', { className: 'bo-error bo-mut-error', attrs: { role: 'alert' } });
  const tableBox = el('section', {
    className: 'bo-mut-card bo-mut-card--lines',
    attrs: { 'aria-label': MUT_TEXT.tabelMutasi },
  });

  const lookup = (id: string): Product | undefined =>
    store.getState().data.products.find((item) => item.id === id);
  const actorName = (): string => {
    const current = session.state().user;
    return current?.name ?? userName(store, store.getState().userId);
  };

  const picker = createProductPicker({
    labelText: label('cariBarang'),
    products: () => store.getState().data.products,
    onPick: (product) => {
      const unit = preferredUnit(product);
      const existing = lines.findIndex(
        (line) => line.productId === product.id && line.unit === unit,
      );
      if (existing >= 0) {
        lines = lines.map((line, index) =>
          index === existing
            ? {
                ...line,
                quantity: String(Number(line.quantity.replace(',', '.') || '0') + 1).replace(
                  '.',
                  ',',
                ),
              }
            : line,
        );
      } else {
        lines = [...lines, { productId: product.id, unit, quantity: '1' }];
      }
      error.textContent = '';
      renderTable();
    },
  });
  picker.root.classList.add('bo-mut-picker');

  const renderTable = (): void => {
    const body = el('tbody');
    lines.forEach((line, index) => {
      const product = lookup(line.productId);
      if (product === undefined) {
        return;
      }
      const quantity = el('input', {
        className: 'input bo-mut-input',
        attrs: {
          inputmode: 'decimal',
          autocomplete: 'off',
          'aria-label': `${label('jumlahMutasi')} ${product.name}`,
          'data-line': String(index),
        },
      });
      quantity.value = line.quantity;
      quantity.addEventListener('input', () => {
        lines = lines.map((item, position) =>
          position === index ? { ...item, quantity: quantity.value } : item,
        );
        error.textContent = '';
        quantity.removeAttribute('aria-invalid');
      });
      const unit = el(
        'select',
        {
          className: 'input bo-mut-input',
          attrs: { 'aria-label': `${label('kolomSatuan')} ${product.name}` },
        },
        ...product.units.map((item) =>
          el('option', { text: item.code, attrs: { value: item.code } }),
        ),
      );
      unit.value = line.unit;
      unit.addEventListener('change', () => {
        lines = lines.map((item, position) =>
          position === index ? { ...item, unit: unit.value } : item,
        );
        renderTable();
      });
      const remove = createButton({
        text: label('hapus'),
        variant: 'secondary',
        onClick: () => {
          lines = lines.filter((_, position) => position !== index);
          renderTable();
        },
      });
      remove.setAttribute('aria-label', `${label('hapus')} ${product.name}`);
      body.append(
        el(
          'tr',
          {},
          el('td', { text: product.code }),
          el('td', { text: product.name }),
          el('td', {
            className: 'is-end',
            text: formatDecimal(fromBase(product, line.unit, product.stock[from]), 3, 1),
          }),
          el('td', {}, quantity),
          el('td', {}, unit),
          el('td', { className: 'is-action' }, remove),
        ),
      );
    });
    tableBox.replaceChildren(
      lines.length === 0
        ? el('p', { className: 'bo-mut-empty', text: label('mutasiKosong') })
        : createScrollRegion(
            MUT_TEXT.tabelMutasi,
            el(
              'table',
              { className: 'bo-mut-table bo-mut-table--lines' },
              el(
                'thead',
                {},
                el(
                  'tr',
                  {},
                  el('th', { text: label('kolomKode') }),
                  el('th', { text: label('kolomNama') }),
                  el('th', { className: 'is-end', text: label('stokAsal') }),
                  el('th', { text: label('jumlahMutasi') }),
                  el('th', { text: label('kolomSatuan') }),
                  el('th', {}, el('span', { className: 'visually-hidden', text: label('hapus') })),
                ),
              ),
              body,
            ),
          ),
    );
  };

  const header = (): void => {
    dateOutput.textContent = formatDate(session.now());
    numberOutput.textContent = store.peekNumber('M');
  };

  const log = (detail: string): void => {
    store.logActivity({
      at: session.now().toISOString(),
      userId: session.state().user?.id ?? store.getState().userId,
      device: BO_DEVICE,
      ip: BO_IP,
      kind: 'cetak',
      detail,
    });
  };

  const save = createButton({
    text: label('simpanMutasi'),
    icon: 'save',
    onClick: () => {
      if (!store.getState().online) {
        return;
      }
      const result = session.saveTransfer(from, to, lines, note.value);
      if (result.ok) {
        showToast({ kind: 'success', text: message('MSG-012', { nomor: result.number }) });
        justSaved = result.number;
        lines = [];
        note.value = '';
        error.textContent = '';
        go(LIST_PATH);
        return;
      }
      error.textContent = message(result.messageId, result.values);
      if (result.line !== undefined) {
        const target = document.querySelector<HTMLElement>(`[data-line="${String(result.line)}"]`);
        target?.setAttribute('aria-invalid', 'true');
        target?.focus();
      } else if (result.messageId === 'MSG-071') {
        toField.select.focus();
      } else {
        picker.input.focus();
      }
    },
  });
  const cancel = createButton({
    text: label('batal'),
    variant: 'secondary',
    onClick: () => {
      if (lines.length === 0 && note.value.trim() === '') {
        error.textContent = '';
        go(LIST_PATH);
        return;
      }
      openModal({
        title: label('kosongkanFormJudul'),
        body: label('kosongkanFormTeks'),
        actions: [
          { text: label('lanjutMengisi'), variant: 'secondary' },
          {
            text: label('kosongkan'),
            variant: 'danger',
            onClick: () => {
              lines = [];
              note.value = '';
              error.textContent = '';
              go(LIST_PATH);
            },
          },
        ],
      });
    },
  });
  const print = createButton({
    text: MUT_TEXT.cetak,
    variant: 'secondary',
    icon: 'printer',
    onClick: () => {
      if (lines.length === 0) {
        error.textContent = MUT_TEXT.isiBarangDulu;
        picker.input.focus();
        return;
      }
      error.textContent = '';
      const nomor = numberOutput.textContent;
      openDocumentPreview({
        modalTitle: MUT_TEXT.buktiTransferDraf,
        heading: MUT_TEXT.buktiTransfer,
        number: nomor,
        intro: mut('buktiPembuka', {
          asal: warehouseName(from),
          tujuan: warehouseName(to),
          tanggal: formatDate(session.now()),
        }),
        columns: [
          { text: 'No' },
          { text: label('kolomKode') },
          { text: label('kolomNama') },
          { text: label('jumlahMutasi'), end: true },
          { text: label('kolomSatuan') },
        ],
        rows: lines.flatMap((line, index) => {
          const product = lookup(line.productId);
          return product === undefined
            ? []
            : [[String(index + 1), product.code, product.name, line.quantity || '0', line.unit]];
        }),
        note:
          note.value.trim() === ''
            ? MUT_TEXT.buktiTanpaKeterangan
            : mut('buktiKeterangan', { teks: note.value.trim() }),
        signs: [
          { role: MUT_TEXT.dibuatOleh, name: actorName() },
          { role: MUT_TEXT.disetujuiOleh, name: '' },
          { role: MUT_TEXT.diterimaOleh, name: '' },
        ],
        onPrint: () => {
          log(mut('logCetakMutasi', { nomor }));
          window.print();
        },
      });
    },
  });

  fromField.select.addEventListener('change', () => {
    from = fromField.select.value as WarehouseId;
    error.textContent = '';
    renderTable();
  });
  toField.select.addEventListener('change', () => {
    to = toField.select.value as WarehouseId;
    error.textContent = '';
  });
  toField.select.value = to;

  const onKey = (event: KeyboardEvent): void => {
    if (!screenActive(element)) {
      return;
    }
    if (document.querySelector('.modal-overlay') !== null) {
      return;
    }
    if (event.key === 'Escape') {
      cancel.click();
    } else if (isPc() && event.ctrlKey && event.key.toLowerCase() === 's') {
      event.preventDefault();
      save.click();
    }
  };
  document.addEventListener('keydown', onKey);
  const stop = store.subscribe(() => {
    const online = store.getState().online;
    save.toggleAttribute('data-inactive', !online);
    save.setAttribute('aria-disabled', online ? 'false' : 'true');
  });

  const fact = (text: string, output: HTMLElement): HTMLElement =>
    el(
      'div',
      { className: 'bo-mut-fact' },
      el('span', { className: 'bo-mut-fact__label', text }),
      output,
    );
  const element = el(
    'div',
    { className: 'bo-mut bo-mut--form' },
    el(
      'section',
      { className: 'bo-mut-head', attrs: { 'aria-label': MUT_TEXT.formMutasi } },
      fact(label('tanggal'), dateOutput),
      fact(label('noMutasi'), numberOutput),
      fromField.root,
      toField.root,
      el(
        'div',
        { className: 'field bo-mut-head__note' },
        el('label', {
          className: 'field__label',
          text: MUT_TEXT.kolomKeterangan,
          attrs: { for: noteId },
        }),
        note,
      ),
    ),
    el(
      'div',
      { className: 'bo-mut-toolbar' },
      picker.root,
      el('div', { className: 'bo-mut-toolbar__actions' }, save, cancel, print),
    ),
    error,
    tableBox,
  );
  header();
  renderTable();
  return {
    element,
    destroy: () => {
      stop();
      document.removeEventListener('keydown', onKey);
    },
  };
}
