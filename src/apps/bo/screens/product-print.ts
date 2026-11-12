import { el, nextId } from '../../../shared/dom';
import { wibDate } from '../../../shared/data/receivable';
import type { Product, Role } from '../../../shared/data/types';
import { formatDate } from '../../../shared/format';
import { label, message, type LabelKey } from '../../../shared/messages';
import { createButton } from '../../../shared/ui/button';
import { openModal } from '../../../shared/ui/modal';
import { showToast } from '../../../shared/ui/toast';
import type { BoSession } from '../bo-session';
import { exportTableToCsv } from '../domain/accounting';
import {
  availableColumns,
  buildExport,
  labelOfColumn,
  type ExportColumnId,
  type ExportParams,
} from '../domain/product-export';
import { openExportPreview } from '../export-preview';

// Kolom yang terpilih saat dialog dibuka; Harga Beli Akhir dan HPP tidak terpilih dari awal.
const DEFAULT_COLUMNS: readonly ExportColumnId[] = [
  'kode',
  'nama',
  'satuan',
  'stokToko',
  'stokGudang',
  'hargaEcer',
  'hargaGrosir',
  'rak',
];

const STATUS_OPTIONS: readonly (readonly [ExportParams['status'], LabelKey])[] = [
  ['semua', 'cetakSemua'],
  ['aktif', 'cetakAktif'],
  ['nonaktif', 'cetakNonaktif'],
];

const STOCK_OPTIONS: readonly (readonly [ExportParams['stock'], LabelKey])[] = [
  ['semua', 'cetakSemua'],
  ['ada', 'cetakStokAda'],
  ['kosong', 'cetakStokKosong'],
  ['dibawah-minimum', 'cetakStokMinimum'],
];

function printArea(title: string, date: string, columns: string[], rows: string[][]): HTMLElement {
  return el(
    'div',
    { className: 'bo-print-area' },
    el('h1', { text: title }),
    el('p', { text: date }),
    el(
      'table',
      {},
      el('thead', {}, el('tr', {}, ...columns.map((column) => el('th', { text: column })))),
      el(
        'tbody',
        {},
        ...rows.map((row) => el('tr', {}, ...row.map((cell) => el('td', { text: cell })))),
      ),
    ),
  );
}

// Cetak info barang: pilih kolom dan filter (kategori, merk, status, stok, teks), lalu Print, Export
// Excel (CSV yang dibuka Excel), atau Export PDF. Kolom HPP dan Harga Beli Akhir hanya untuk Owner.
export function openProductPrint(
  session: BoSession,
  products: readonly Product[],
  role: Role,
): void {
  const chosen = new Set<ExportColumnId>(
    DEFAULT_COLUMNS.filter((column) => availableColumns(role).includes(column)),
  );

  const select = (
    heading: LabelKey,
    options: readonly (readonly [string, string])[],
    onChange: () => void,
  ): { readonly control: HTMLSelectElement; readonly field: HTMLElement } => {
    const id = nextId('bo-cetak');
    const control = el(
      'select',
      { className: 'bo-pd-input', attrs: { id } },
      ...options.map(([value, text]) => el('option', { text, attrs: { value } })),
    );
    control.addEventListener('change', onChange);
    return {
      control,
      field: el(
        'div',
        { className: 'bo-pd-field' },
        el('label', { attrs: { for: id }, text: label(heading) }),
        control,
      ),
    };
  };
  const unique = (pick: (product: Product) => string): readonly (readonly [string, string])[] => [
    ['', label('cetakSemua')],
    ...[...new Set(products.map(pick))]
      .filter((value) => value !== '')
      .sort((first, second) => first.localeCompare(second))
      .map((value): readonly [string, string] => [value, value]),
  ];

  const count = el('p', { className: 'bo-cetak__count', attrs: { 'aria-live': 'polite' } });
  const params = (): ExportParams => ({
    columns: [...chosen],
    category: category.control.value,
    brand: brand.control.value,
    status: status.control.value as ExportParams['status'],
    stock: stock.control.value as ExportParams['stock'],
    text: search.value,
  });
  const result = (): { columns: string[]; rows: string[][] } =>
    buildExport(products, params(), role);
  const update = (): void => {
    count.textContent = label('cetakJumlah', { jumlah: String(result().rows.length) });
  };

  const category = select(
    'cetakKategori',
    unique((product) => product.category),
    update,
  );
  const brand = select(
    'cetakMerk',
    unique((product) => product.brand),
    update,
  );
  const status = select(
    'cetakStatus',
    STATUS_OPTIONS.map(([value, text]) => [value, label(text)] as const),
    update,
  );
  const stock = select(
    'cetakStok',
    STOCK_OPTIONS.map(([value, text]) => [value, label(text)] as const),
    update,
  );
  const searchId = nextId('bo-cetak');
  const search = el('input', {
    className: 'bo-pd-input',
    attrs: { id: searchId, type: 'text', autocomplete: 'off' },
  });
  search.addEventListener('input', update);

  const columnBoxes = availableColumns(role).map((column) => {
    const id = nextId('bo-cetak');
    const box = el('input', { attrs: { id, type: 'checkbox' } });
    box.checked = chosen.has(column);
    box.addEventListener('change', () => {
      if (box.checked) {
        chosen.add(column);
      } else {
        chosen.delete(column);
      }
      update();
    });
    return el(
      'label',
      { className: 'bo-cetak__col', attrs: { for: id } },
      box,
      el('span', { text: labelOfColumn(column) }),
    );
  });

  // Tolak keluaran bila kolom atau hasil kosong; dialog tetap terbuka agar parameter bisa diubah.
  const output = (run: (data: { columns: string[]; rows: string[][] }) => void): void => {
    if (chosen.size === 0) {
      showToast({ kind: 'error', text: label('cetakPilihKolom') });
      return;
    }
    const data = result();
    if (data.rows.length === 0) {
      showToast({ kind: 'error', text: message('MSG-069') });
      return;
    }
    run(data);
  };

  const buttons = el(
    'div',
    { className: 'bo-cetak__actions' },
    createButton({
      text: label('cetakPrint'),
      variant: 'primary',
      icon: 'printer',
      onClick: () => {
        output((data) => {
          const area = printArea(
            label('cetakJudulLaporan'),
            formatDate(session.now()),
            data.columns,
            data.rows,
          );
          document.body.append(area);
          document.body.classList.add('is-printing-barang');
          try {
            window.print();
          } finally {
            document.body.classList.remove('is-printing-barang');
            area.remove();
          }
        });
      },
    }),
    createButton({
      text: label('cetakExcel'),
      variant: 'secondary',
      icon: 'download',
      onClick: () => {
        output((data) => {
          const name = `info-barang-${wibDate(session.now())}`;
          exportTableToCsv(name, data.columns, data.rows);
          showToast({ kind: 'success', text: label('cetakDiunduh', { nama: `${name}.csv` }) });
        });
      },
    }),
    createButton({
      text: label('cetakPdf'),
      variant: 'secondary',
      icon: 'file-text',
      onClick: () => {
        output((data) => {
          openExportPreview({
            kind: 'pdf',
            title: label('cetakJudulLaporan'),
            columns: data.columns,
            rows: data.rows,
          });
        });
      },
    }),
  );

  update();
  openModal({
    title: label('cetakJudul'),
    body: el(
      'div',
      { className: 'bo-cetak' },
      el(
        'fieldset',
        { className: 'bo-cetak__group' },
        el('legend', { text: label('cetakKolom') }),
        el('div', { className: 'bo-cetak__cols' }, ...columnBoxes),
      ),
      el(
        'fieldset',
        { className: 'bo-cetak__group' },
        el('legend', { text: label('cetakFilter') }),
        category.field,
        brand.field,
        status.field,
        stock.field,
        el(
          'div',
          { className: 'bo-pd-field' },
          el('label', { attrs: { for: searchId }, text: label('cetakCari') }),
          search,
        ),
      ),
      count,
      buttons,
    ),
    actions: [{ text: label('tutup'), variant: 'secondary' }],
  });
}
