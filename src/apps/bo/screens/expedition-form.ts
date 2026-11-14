import '../../../styles/bo-trx.css';
import { el, nextId } from '../../../shared/dom';
import { wibDate } from '../../../shared/data/receivable';
import { formatDecimal } from '../../../shared/format';
import { createButton } from '../../../shared/ui/button';
import { showToast } from '../../../shared/ui/toast';
import type { BoSession } from '../bo-session';
import type { ScreenHandle } from './login';
import {
  createExpeditionNote,
  expeditionSeeds,
  removeLine,
  upsertLine,
  validateLine,
  type ExpeditionNote,
} from '../domain/expedition';
import { parseQuantityText } from '../domain/line-detail';
import { createDocHead } from './trx/doc-head';

const TEXT = {
  judul: 'Surat Jalan Ekspedisi & Packing Koli',
  isiFaktur: 'Isi Data Faktur Penjualan',
  noSj: 'No. Surat Jalan',
  faktur: 'Faktur Penjualan',
  tanggal: 'Tanggal',
  sopir: 'No. Polisi / Driver',
  ekspedisi: 'Nama Ekspedisi',
  penerima: 'Penerima & Alamat Kirim',
  jumlah: 'Jumlah',
  satuan: 'Satuan',
  namaKoli: 'Nama Koli Barang',
  namaBarang: 'Nama Barang',
  simpan: 'Simpan',
  batal: 'Batal',
  hapus: 'Hapus',
  daftar: 'Daftar koli surat jalan',
  kosong: 'Belum ada koli. Isi jumlah, satuan, dan nama koli lalu Simpan.',
  tersimpan: 'Baris koli disimpan.',
  terhapus: 'Baris koli dihapus.',
  pilihHapus: 'Pilih baris koli yang akan dihapus.',
  errJumlah: 'Isi jumlah lebih dari 0.',
  errSatuan: 'Isi satuan.',
  errNama: 'Isi nama koli barang.',
  bacaBaris: 'Ubah baris koli {nama}',
} as const;

const KOLI_UNITS = ['KOLI', 'IKAT', 'KRG', 'DUS', 'SAK', 'KARUNG', 'PALET'] as const;

// Contoh gambar klien 13, dipakai saat Surat Jalan dibuka tanpa melewati Faktur Penjualan.
const SAMPLE_LINES = [
  { productName: 'Barang Campuran ( Engsel, Grendel, Hak Angin )', quantity: 2, unit: 'KOLI' },
  { productName: 'Pipa PVC 3/4 @25BTG', quantity: 5, unit: 'IKAT' },
  { productName: 'Baut UNC 3/8 X 7 @50KG', quantity: 20, unit: 'KRG' },
] as const;

// Surat Jalan Ekspedisi dan Packing Koli (gambar klien 13): kepala dokumen, satu baris isian
// Jumlah, Satuan, Nama Koli Barang dengan Simpan, Batal, Hapus, dan tabel datar koli. Klik baris
// memuatnya ke isian untuk diubah atau dihapus. Baris awal berasal dari barang Koli faktur.
export function renderExpeditionForm(
  session: BoSession,
  go: (path: string) => void,
  invoiceNumber?: string,
): ScreenHandle {
  const today = wibDate(session.now());
  const seed = invoiceNumber === undefined ? undefined : expeditionSeeds.get(invoiceNumber);
  let note: ExpeditionNote =
    seed === undefined
      ? createExpeditionNote(
          {
            invoiceNumber: invoiceNumber ?? 'FJ26101237',
            date: today,
            expedition: 'JNE Cargo',
            customerName: 'Bu Sherly Tjoandra',
            customerAddress: 'Jl. Rajawali No 17',
            customerPhone: '0811230988',
          },
          SAMPLE_LINES,
        )
      : createExpeditionNote(seed, seed.koliLines);
  let selectedId: string | undefined;

  // --- Kepala dokumen ---
  const readonlyInput = (value: string): HTMLInputElement =>
    el('input', {
      className: 'input is-readonly',
      attrs: { type: 'text', readonly: 'true', value },
    });
  const textInput = (value: string): HTMLInputElement =>
    el('input', { className: 'input', attrs: { type: 'text', value } });
  const sjEl = readonlyInput(note.noteNumber);
  const invoiceEl = readonlyInput(note.invoiceNumber);
  const dateEl = el('input', { className: 'input', attrs: { type: 'date', value: note.date } });
  const vehicleEl = textInput(note.vehicle);
  const expeditionEl = textInput(note.expeditionName);
  const recipientEl = textInput(note.recipient);
  const head = createDocHead(
    [
      { key: 'sj', label: TEXT.noSj, control: sjEl, col: 1, row: 1 },
      { key: 'invoice', label: TEXT.faktur, control: invoiceEl, col: 2, row: 1 },
      { key: 'date', label: TEXT.tanggal, control: dateEl, col: 3, row: 1 },
      { key: 'vehicle', label: TEXT.sopir, control: vehicleEl, col: 4, row: 1 },
      { key: 'expedition', label: TEXT.ekspedisi, control: expeditionEl, col: 1, row: 2 },
      { key: 'recipient', label: TEXT.penerima, control: recipientEl, col: 2, row: 2, span: 3 },
    ],
    undefined,
    TEXT.judul,
  );

  const titleBar = el(
    'section',
    { className: 'bo-trx-sjhead' },
    el('h1', { className: 'bo-trx-listhead__heading', text: TEXT.judul }),
    createButton({
      text: TEXT.isiFaktur,
      variant: 'secondary',
      icon: 'arrow-left',
      onClick: () => {
        go('/bo/penjualan');
      },
    }),
  );

  // --- Isian satu baris koli ---
  const quantityId = nextId('sj-jumlah');
  const unitId = nextId('sj-satuan');
  const nameId = nextId('sj-nama');
  const unitListId = nextId('sj-satuan-daftar');
  const quantityEl = el('input', {
    className: 'input is-num',
    attrs: { id: quantityId, type: 'text', inputmode: 'decimal', autocomplete: 'off' },
  });
  const unitEl = el('input', {
    className: 'input',
    attrs: { id: unitId, type: 'text', list: unitListId, autocomplete: 'off' },
  });
  const unitList = el(
    'datalist',
    { attrs: { id: unitListId } },
    ...KOLI_UNITS.map((unit) => el('option', { attrs: { value: unit } })),
  );
  const nameEl = el('input', {
    className: 'input',
    attrs: { id: nameId, type: 'text', autocomplete: 'off' },
  });
  const field = (id: string, text: string, control: HTMLElement, className: string): HTMLElement =>
    el(
      'div',
      { className: `bo-trx-koli-field ${className}` },
      el('label', { className: 'bo-trx-head__label', text, attrs: { for: id } }),
      control,
    );

  // --- Tabel koli ---
  const body = el('tbody', {});
  const table = el(
    'div',
    {
      className: 'bo-trx__lines',
      attrs: { tabindex: '0', role: 'region', 'aria-label': TEXT.daftar },
    },
    el(
      'table',
      { className: 'bo-trx-table bo-trx-table--lines bo-trx-table--koli' },
      el(
        'thead',
        {},
        el(
          'tr',
          {},
          el('th', { className: 'is-center', text: TEXT.jumlah }),
          el('th', { className: 'is-center', text: TEXT.satuan }),
          el('th', { text: TEXT.namaBarang }),
        ),
      ),
      body,
    ),
  );

  function clearEntry(): void {
    selectedId = undefined;
    quantityEl.value = '';
    unitEl.value = '';
    nameEl.value = '';
    paint();
  }

  function loadRow(id: string): void {
    const line = note.lines.find((item) => item.id === id);
    if (line === undefined) {
      return;
    }
    selectedId = id;
    quantityEl.value = String(line.quantity).replace('.', ',');
    unitEl.value = line.unit;
    nameEl.value = line.name;
    paint();
    quantityEl.focus();
  }

  function paint(): void {
    if (note.lines.length === 0) {
      body.replaceChildren(
        el(
          'tr',
          { className: 'bo-trx-table__empty' },
          el('td', { text: TEXT.kosong, attrs: { colspan: '3' } }),
        ),
      );
      return;
    }
    body.replaceChildren(
      ...note.lines.map((line) => {
        const selected = line.id === selectedId;
        const pick = el('button', {
          className: 'bo-trx-table__name',
          text: line.name,
          attrs: {
            type: 'button',
            title: line.name,
            'aria-pressed': selected ? 'true' : 'false',
          },
        });
        pick.addEventListener('click', (event) => {
          event.stopPropagation();
          loadRow(line.id);
        });
        const row = el(
          'tr',
          {
            className: selected ? 'is-selected' : '',
            attrs: { 'data-id': line.id },
          },
          el('td', { className: 'is-center is-bold', text: formatDecimal(line.quantity) }),
          el('td', { className: 'is-center is-bold', text: line.unit }),
          el('td', { className: 'bo-trx-table__nameCell' }, pick),
        );
        row.addEventListener('click', () => {
          loadRow(line.id);
        });
        return row;
      }),
    );
  }

  const fail = (text: string, control: HTMLElement): void => {
    showToast({ kind: 'info', text });
    control.focus();
  };

  const saveButton = createButton({
    text: TEXT.simpan,
    variant: 'primary',
    onClick: () => {
      const issue = validateLine({
        quantity: quantityEl.value,
        unit: unitEl.value,
        name: nameEl.value,
      });
      if (issue === 'quantity') {
        fail(TEXT.errJumlah, quantityEl);
        return;
      }
      if (issue === 'unit') {
        fail(TEXT.errSatuan, unitEl);
        return;
      }
      if (issue === 'name') {
        fail(TEXT.errNama, nameEl);
        return;
      }
      note = upsertLine(note, {
        ...(selectedId === undefined ? {} : { id: selectedId }),
        quantity: parseQuantityText(quantityEl.value),
        unit: unitEl.value.trim(),
        name: nameEl.value.trim(),
      });
      showToast({ kind: 'success', text: TEXT.tersimpan });
      clearEntry();
    },
  });
  const cancelButton = createButton({
    text: TEXT.batal,
    variant: 'secondary',
    onClick: clearEntry,
  });
  const deleteButton = createButton({
    text: TEXT.hapus,
    variant: 'danger',
    onClick: () => {
      if (selectedId === undefined) {
        showToast({ kind: 'info', text: TEXT.pilihHapus });
        return;
      }
      note = removeLine(note, selectedId);
      showToast({ kind: 'success', text: TEXT.terhapus });
      clearEntry();
    },
  });

  const entry = el(
    'div',
    { className: 'bo-trx-koli-entry' },
    field(quantityId, TEXT.jumlah, quantityEl, 'is-qty'),
    field(unitId, TEXT.satuan, el('span', {}, unitEl, unitList), 'is-unit'),
    field(nameId, TEXT.namaKoli, nameEl, 'is-name'),
    el('div', { className: 'bo-trx-koli-actions' }, saveButton, cancelButton, deleteButton),
  );

  paint();
  const container = el(
    'div',
    { className: 'bo-form-page bo-trx bo-trx-doc bo-trx-sj' },
    titleBar,
    el('div', { className: 'bo-trx-sjcard' }, head.root, entry),
    el('div', { className: 'bo-trx__body' }, table),
  );
  return { element: container, destroy: () => undefined };
}
