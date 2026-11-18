import { el, nextId } from '../../../shared/dom';
import { formatRupiah } from '../../../shared/format';
import { createButton } from '../../../shared/ui/button';
import { openModal, type ModalHandle } from '../../../shared/ui/modal';
import { totalCost, parseCost, parseQuantity, type OpeningDraft } from '../domain/opening-balance';

// Dialog layar Data Barang (gambar klien 38, 39, dan 40 revisi BO putaran 9). Dimuat malas.

const TEXT = {
  judulHarga: 'Isi Harga Jual Barang',
  judulSaldo: 'Isi Saldo Awal Barang',
  kode: 'Kode #',
  nama: 'Nama Barang',
  eceran: 'Eceran Satuan',
  grosir: 'Grosir Satuan',
  hargaBeli: 'Harga Beli Akhir S',
  hpp: 'Hpp Avg Satuan',
  gudang: 'Gudang',
  tanggal: 'Tanggal',
  kuantitas: 'Kuantitas',
  satuan: 'Satuan',
  biaya: 'Biaya Satuan',
  total: 'Total Biaya',
  batal: 'Batal',
  simpan: 'Simpan',
  tutup: 'Tutup',
} as const;

function field(labelText: string, control: HTMLElement, id: string): HTMLElement {
  return el(
    'div',
    { className: 'bo-pd-dlg__row' },
    el('label', { className: 'bo-pd-dlg__label', text: labelText, attrs: { for: id } }),
    control,
  );
}

function readonlyBox(text: string, id: string): HTMLElement {
  return el('output', { className: 'bo-pd-dlg__box', text, attrs: { id } });
}

function textInput(
  id: string,
  label: string,
  mode: 'numeric' | 'decimal' | 'text',
): HTMLInputElement {
  return el('input', {
    className: 'bo-pd-dlg__input',
    attrs: { id, type: 'text', inputmode: mode, autocomplete: 'off', 'aria-label': label },
  });
}

function head(code: string, name: string): HTMLElement {
  const nameId = nextId('bo-pd-dlg');
  return el(
    'div',
    { className: 'bo-pd-dlg__head' },
    el(
      'div',
      { className: 'bo-pd-dlg__row' },
      el('span', { className: 'bo-pd-dlg__label', text: TEXT.kode }),
      el('strong', { className: 'bo-pd-dlg__code', text: code }),
    ),
    field(TEXT.nama, readonlyBox(name, nameId), nameId),
  );
}

function actionRow(
  close: () => void,
  onSave: () => void,
): { readonly root: HTMLElement; readonly error: HTMLElement } {
  const error = el('p', { className: 'bo-pd-dlg__error', attrs: { role: 'alert' } });
  const cancel = createButton({
    text: TEXT.batal,
    variant: 'secondary',
    onClick: close,
  });
  const save = createButton({ text: TEXT.simpan, variant: 'primary', onClick: onSave });
  return {
    error,
    root: el('div', { className: 'bo-pd-dlg__actions' }, cancel, save),
  };
}

export interface PriceDialogInput {
  readonly code: string;
  readonly name: string;
  // Satuan barang (satu sampai tiga); baris tanpa satuan tampil tidak aktif supaya dialog tetap baku.
  readonly units: readonly { readonly code: string; readonly factor: number }[];
  readonly values: readonly { readonly ecer: string; readonly grosir: string }[];
  // Harga beli akhir dan HPP rata-rata per satuan (rupiah), sudah dikali faktor satuan.
  readonly lastBuy: readonly number[];
  readonly hpp: readonly number[];
  // Mengembalikan teks galat, atau undefined bila berhasil (dialog ditutup).
  readonly save: (
    values: readonly { readonly ecer: string; readonly grosir: string }[],
  ) => Promise<string | undefined>;
}

// Isi Harga Jual Barang (gambar 38): harga eceran dan grosir tiga satuan di kiri; harga beli akhir dan
// HPP rata-rata hanya dibaca di kanan. Hanya Owner yang dapat membukanya.
export function openPriceDialog(input: PriceDialogInput): void {
  const holder: { handle: ModalHandle | undefined } = { handle: undefined };
  const slots = [0, 1, 2];
  const ecer = slots.map((index) => {
    const id = nextId('bo-pd-dlg');
    const control = textInput(id, `${TEXT.eceran} ${String(index + 1)}`, 'numeric');
    control.value = input.values[index]?.ecer ?? '';
    control.disabled = input.units[index] === undefined;
    return { id, control };
  });
  const grosir = slots.map((index) => {
    const id = nextId('bo-pd-dlg');
    const control = textInput(id, `${TEXT.grosir} ${String(index + 1)}`, 'numeric');
    control.value = input.values[index]?.grosir ?? '';
    control.disabled = input.units[index] === undefined;
    return { id, control };
  });
  const readonlyRow = (labelText: string, value: number | undefined): HTMLElement => {
    const id = nextId('bo-pd-dlg');
    return field(labelText, readonlyBox(value === undefined ? '-' : formatRupiah(value), id), id);
  };
  const actions = actionRow(
    () => {
      holder.handle?.close();
    },
    () => {
      const next = slots.map((index) => ({
        ecer: ecer[index]?.control.value ?? '',
        grosir: grosir[index]?.control.value ?? '',
      }));
      void input.save(next).then((problem) => {
        if (problem === undefined) {
          holder.handle?.close();
        } else {
          actions.error.textContent = problem;
        }
      });
    },
  );
  const body = el(
    'div',
    { className: 'bo-pd-dlg bo-pd-dlg--harga' },
    head(input.code, input.name),
    el(
      'div',
      { className: 'bo-pd-dlg__cols' },
      el(
        'div',
        { className: 'bo-pd-dlg__col' },
        ...slots.map((index) =>
          field(
            `${TEXT.eceran} ${String(index + 1)}`,
            ecer[index]?.control ?? el('span'),
            ecer[index]?.id ?? '',
          ),
        ),
        ...slots.map((index) =>
          field(
            `${TEXT.grosir} ${String(index + 1)}`,
            grosir[index]?.control ?? el('span'),
            grosir[index]?.id ?? '',
          ),
        ),
      ),
      el(
        'div',
        { className: 'bo-pd-dlg__col' },
        ...slots.map((index) =>
          readonlyRow(
            `${TEXT.hargaBeli}${String(index + 1)}`,
            input.units[index] === undefined ? undefined : input.lastBuy[index],
          ),
        ),
        ...slots.map((index) =>
          readonlyRow(
            `${TEXT.hpp} ${String(index + 1)}`,
            input.units[index] === undefined ? undefined : input.hpp[index],
          ),
        ),
      ),
    ),
    actions.error,
    actions.root,
  );
  holder.handle = openModal({ title: TEXT.judulHarga, body, actions: [] });
  holder.handle.dialog.classList.add('bo-pd-modal', 'bo-pd-modal--harga');
  ecer.find((slot) => !slot.control.disabled)?.control.focus();
}

export interface OpeningDialogInput {
  readonly code: string;
  readonly name: string;
  readonly units: readonly string[];
  readonly warehouses: readonly { readonly value: string; readonly text: string }[];
  readonly defaultUnit: string;
  readonly today: string;
  readonly save: (draft: OpeningDraft) => string | undefined;
}

// Isi Saldo Awal Barang (gambar 39): gudang, tanggal, kuantitas, satuan, dan biaya satuan; total biaya
// dihitung otomatis. Hanya Owner yang dapat membukanya.
export function openOpeningDialog(input: OpeningDialogInput): void {
  const holder: { handle: ModalHandle | undefined } = { handle: undefined };
  const warehouseId = nextId('bo-pd-dlg');
  const dateId = nextId('bo-pd-dlg');
  const quantityId = nextId('bo-pd-dlg');
  const unitId = nextId('bo-pd-dlg');
  const costId = nextId('bo-pd-dlg');
  const totalId = nextId('bo-pd-dlg');
  const warehouse = el(
    'select',
    { className: 'bo-pd-dlg__input', attrs: { id: warehouseId, 'aria-label': TEXT.gudang } },
    ...input.warehouses.map((item) =>
      el('option', { text: item.text, attrs: { value: item.value } }),
    ),
  );
  const date = el('input', {
    className: 'bo-pd-dlg__input',
    attrs: { id: dateId, type: 'date', 'aria-label': TEXT.tanggal },
  });
  date.value = input.today;
  const quantity = textInput(quantityId, TEXT.kuantitas, 'decimal');
  const unit = el(
    'select',
    { className: 'bo-pd-dlg__input', attrs: { id: unitId, 'aria-label': TEXT.satuan } },
    ...input.units.map((code) => el('option', { text: code, attrs: { value: code } })),
  );
  unit.value = input.defaultUnit;
  const cost = textInput(costId, TEXT.biaya, 'numeric');
  const total = readonlyBox(formatRupiah(0), totalId);
  const recalc = (): void => {
    total.textContent = formatRupiah(
      totalCost(parseQuantity(quantity.value), parseCost(cost.value)),
    );
  };
  quantity.addEventListener('input', recalc);
  cost.addEventListener('input', recalc);

  const actions = actionRow(
    () => {
      holder.handle?.close();
    },
    () => {
      const problem = input.save({
        warehouse: warehouse.value,
        date: date.value,
        quantity: quantity.value,
        unit: unit.value,
        cost: cost.value,
      });
      if (problem === undefined) {
        holder.handle?.close();
      } else {
        actions.error.textContent = problem;
      }
    },
  );
  const body = el(
    'div',
    { className: 'bo-pd-dlg bo-pd-dlg--saldo' },
    head(input.code, input.name),
    field(TEXT.gudang, warehouse, warehouseId),
    field(TEXT.tanggal, date, dateId),
    field(TEXT.kuantitas, quantity, quantityId),
    field(TEXT.satuan, unit, unitId),
    field(TEXT.biaya, cost, costId),
    field(TEXT.total, total, totalId),
    actions.error,
    actions.root,
  );
  holder.handle = openModal({ title: TEXT.judulSaldo, body, actions: [] });
  holder.handle.dialog.classList.add('bo-pd-modal', 'bo-pd-modal--saldo');
  warehouse.focus();
}

// Perbesar gambar (gambar 40): kotak di tengah layar seluas kira-kira setengah halaman.
export function openImageViewer(url: string, name: string): void {
  const handle = openModal({
    title: name,
    body: el(
      'div',
      { className: 'bo-pd-zoombox' },
      el('img', { className: 'bo-pd-zoomimg', attrs: { src: url, alt: name } }),
    ),
    actions: [{ text: TEXT.tutup, variant: 'secondary' }],
  });
  handle.dialog.classList.add('bo-pd-modal', 'bo-pd-modal--foto');
}
