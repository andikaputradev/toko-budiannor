import '../../../../styles/bo-trx.css';
import { el } from '../../../../shared/dom';
import { icon } from '../../../../shared/icons';
import { label } from '../../../../shared/messages';
import { createButton } from '../../../../shared/ui/button';
import { openModal } from '../../../../shared/ui/modal';
import { showToast } from '../../../../shared/ui/toast';
import { BO_DEVICE, BO_IP, type BoSession } from '../../bo-session';
import { requestCloseTab } from '../../screen-active';

export interface Kpi {
  readonly root: HTMLElement;
  set(text: string): void;
}

// Kotak angka pada kartu daftar (gambar klien 8): judul kecil di atas, angka tebal di bawah.
export function createKpi(label: string, tone?: 'warn' | 'danger'): Kpi {
  const value = el('strong', {
    className: `bo-trx-kpi__value${tone === undefined ? '' : ` is-${tone}`}`,
    text: '0',
  });
  return {
    root: el(
      'div',
      { className: 'bo-trx-kpi' },
      el('span', { className: 'bo-trx-kpi__label', text: label }),
      value,
    ),
    set: (text) => {
      value.textContent = text;
    },
  };
}

export function createFilterSelect(
  ariaLabel: string,
  options: readonly { readonly value: string; readonly text: string }[],
): HTMLSelectElement {
  const select = el('select', {
    className: 'input is-select bo-trx-filter',
    attrs: { 'aria-label': ariaLabel },
  });
  for (const option of options) {
    select.append(el('option', { text: option.text, attrs: { value: option.value } }));
  }
  return select;
}

const DATE_FILTER: readonly { readonly value: string; readonly text: string }[] = [
  { value: 'semua', text: 'Semua' },
  { value: 'hari-ini', text: 'Hari Ini' },
  { value: 'tujuh-hari', text: '7 Hari Terakhir' },
  { value: 'bulan-ini', text: 'Bulan Ini' },
];

// Filter "Tanggal: Semua / Hari Ini / 7 Hari Terakhir / Bulan Ini" yang sama di semua daftar.
export function createDateFilter(): HTMLSelectElement {
  return createFilterSelect(
    'Tanggal',
    DATE_FILTER.map((option) => ({ value: option.value, text: `Tanggal: ${option.text}` })),
  );
}

export function createSearchBox(
  ariaLabel: string,
  placeholder: string,
): { readonly root: HTMLElement; readonly input: HTMLInputElement } {
  const input = el('input', {
    className: 'input bo-trx-searchbox__input',
    attrs: { type: 'search', 'aria-label': ariaLabel, placeholder, autocomplete: 'off' },
  });
  return {
    input,
    root: el(
      'div',
      { className: 'bo-trx-searchbox' },
      input,
      el('span', { className: 'bo-trx-search__icon' }, icon('search')),
    ),
  };
}

export function createRefreshButton(label: string, onClick: () => void): HTMLButtonElement {
  const button = el(
    'button',
    {
      className: 'bo-trx-iconbtn',
      attrs: { type: 'button', 'aria-label': label, title: label },
    },
    icon('refresh-cw'),
  );
  button.addEventListener('click', onClick);
  return button;
}

// Baris terpilih pada daftar: klik memilih, klik dua kali atau Enter membuka. Tombol Ubah dan Hapus
// bekerja pada baris terpilih (gambar klien 32), nomor dokumen tetap membuka dokumennya langsung.
export interface RowSelection {
  attach(row: HTMLElement, key: string): void;
  select(key: string): void;
  selected(): string | undefined;
  clear(): void;
  onOpen(handler: (key: string) => void): void;
}

export function createRowSelection(): RowSelection {
  let current: string | undefined;
  let opener: ((key: string) => void) | undefined;
  const rows = new Set<HTMLElement>();

  const paint = (): void => {
    for (const row of rows) {
      if (!row.isConnected) {
        rows.delete(row);
        continue;
      }
      const on = row.dataset['key'] === current;
      row.classList.toggle('is-selected', on);
      if (on) {
        row.setAttribute('aria-current', 'true');
      } else {
        row.removeAttribute('aria-current');
      }
    }
  };
  const choose = (key: string): void => {
    current = key;
    paint();
  };

  return {
    attach: (row, key) => {
      row.dataset['key'] = key;
      row.tabIndex = 0;
      row.classList.add('bo-trx-row');
      rows.add(row);
      if (key === current) {
        row.classList.add('is-selected');
        row.setAttribute('aria-current', 'true');
      }
      row.addEventListener('click', () => {
        choose(key);
      });
      row.addEventListener('dblclick', () => {
        choose(key);
        opener?.(key);
      });
      row.addEventListener('keydown', (event) => {
        if (event.target !== row) {
          return;
        }
        if (event.key === 'Enter') {
          event.preventDefault();
          choose(key);
          opener?.(key);
        } else if (event.key === ' ') {
          event.preventDefault();
          choose(key);
        }
      });
    },
    select: choose,
    selected: () => current,
    clear: () => {
      current = undefined;
      paint();
    },
    onOpen: (handler) => {
      opener = handler;
    },
  };
}

// Konfirmasi hapus dokumen yang boleh dihapus; dokumen yang sudah diposting ditolak lewat toast.
export function confirmDelete(subject: string, onConfirm: () => void): void {
  openModal({
    title: label('hapus'),
    body: el('p', { text: `Hapus ${subject}? Tindakan ini tidak dapat dibatalkan.` }),
    actions: [
      { text: label('batal'), variant: 'secondary' },
      { text: label('hapus'), variant: 'danger', icon: 'trash-2', onClick: onConfirm },
    ],
  });
}

export function refuseDelete(reason: string): void {
  showToast({ kind: 'error', text: reason });
}

// Catatan aktivitas untuk dokumen yang dihapus dari daftar.
export function logDeleted(session: BoSession, detail: string): void {
  const { store } = session;
  store.logActivity({
    at: session.now().toISOString(),
    userId: session.state().user?.id ?? store.getState().userId,
    device: BO_DEVICE,
    ip: BO_IP,
    kind: 'koreksi',
    detail,
  });
}

// Isi tabel yang sedang tampil menjadi bahan Cetak: judul kolom dan baris data (kolom aksi dan baris
// kosong dilewati). Kotak pilihan Print, Excel, dan PDF dimuat saat dibutuhkan.
export function printList(title: string, table: HTMLElement, dateText: string): void {
  const heads = [...table.querySelectorAll<HTMLElement>('thead th')];
  const keep = heads.map((head) => head.querySelector('.visually-hidden') === null);
  const columns = heads
    .filter((_, index) => keep[index] === true)
    .map((head) => head.textContent.trim());
  const rows = [...table.querySelectorAll<HTMLTableRowElement>('tbody tr')]
    .filter(
      (row) => !row.classList.contains('bo-trx-table__empty') && row.dataset['key'] !== undefined,
    )
    .map((row) =>
      [...row.cells]
        .filter((_, index) => keep[index] === true)
        .map((cell) => cell.textContent.trim()),
    );
  void import('../mutasi/parts').then(({ openPrintChooser }) => {
    openPrintChooser({
      title,
      dateText,
      fileName: title.toLowerCase().replaceAll(/[^a-z0-9]+/g, '-'),
      columns,
      rows,
    });
  });
}

export interface ListPageParts {
  // Judul daftar untuk pembaca layar; judul tampak sudah ada di header halaman.
  readonly title: string;
  readonly kpis: readonly Kpi[];
  readonly selection: RowSelection;
  readonly onCreate: () => void;
  // Ubah membuka dokumen terpilih; Hapus menghapusnya atau menolak dengan alasan.
  readonly onEdit?: ((key: string) => void) | undefined;
  readonly onDelete?: ((key: string) => void) | undefined;
  // Tanpa isian: Cetak memakai tabel yang tampil, Keluar menutup tab.
  readonly onPrint?: (() => void) | undefined;
  readonly onExit?: (() => void) | undefined;
  readonly dateText?: string | undefined;
  readonly refresh: HTMLElement;
  readonly filters: readonly HTMLElement[];
  readonly search: HTMLElement;
  readonly table: HTMLElement;
}

// Kerangka halaman daftar (gambar klien 32): satu kartu bilah (Tambah, Ubah, Hapus, Cetak, Keluar,
// segarkan, filter, pencarian), kotak angka bila ada, lalu tabel yang menggulir di dalam panelnya.
// Susunannya sama untuk semua daftar dokumen.
export function createListPage(parts: ListPageParts): HTMLElement {
  const { selection } = parts;
  const needRow = (run: (key: string) => void) => (): void => {
    const key = selection.selected();
    if (key === undefined) {
      showToast({ kind: 'info', text: label('masterPilihDulu') });
      return;
    }
    run(key);
  };

  const create = createButton({
    text: label('masterTambah'),
    variant: 'primary',
    icon: 'plus',
    onClick: parts.onCreate,
  });
  create.classList.add('bo-trx-create');
  const edit = createButton({
    text: label('masterUbah'),
    variant: 'secondary',
    icon: 'pencil',
    disabled: parts.onEdit === undefined,
    ...(parts.onEdit === undefined ? {} : { onClick: needRow(parts.onEdit) }),
  });
  const remove = createButton({
    text: label('hapus'),
    variant: 'danger',
    icon: 'trash-2',
    disabled: parts.onDelete === undefined,
    ...(parts.onDelete === undefined ? {} : { onClick: needRow(parts.onDelete) }),
  });
  const print = createButton({
    text: label('cetak'),
    variant: 'secondary',
    icon: 'printer',
    onClick:
      parts.onPrint ??
      ((): void => {
        printList(parts.title, parts.table, parts.dateText ?? '');
      }),
  });
  const exit = createButton({
    text: label('keluar'),
    variant: 'secondary',
    icon: 'log-out',
    onClick:
      parts.onExit ??
      ((): void => {
        requestCloseTab(root);
      }),
  });
  if (parts.onEdit !== undefined) {
    selection.onOpen(parts.onEdit);
  }
  selection.clear();

  const root = el(
    'div',
    { className: 'bo-form-page bo-trx bo-trx-list' },
    el('h2', { className: 'visually-hidden', text: parts.title }),
    el(
      'section',
      { className: 'bo-trx-listbar bo-actionbar' },
      el(
        'div',
        {
          className: 'bo-trx-listbar__actions',
          attrs: { role: 'toolbar', 'aria-label': parts.title },
        },
        create,
        edit,
        remove,
        print,
        exit,
      ),
      el('span', { className: 'bo-trx-listbar__divider', attrs: { 'aria-hidden': 'true' } }),
      parts.refresh,
      el('div', { className: 'bo-trx-filters' }, ...parts.filters),
      parts.search,
    ),
    parts.kpis.length === 0
      ? false
      : el('div', { className: 'bo-trx-kpis' }, ...parts.kpis.map((kpi) => kpi.root)),
    el('div', { className: 'bo-trx__body' }, parts.table),
  );
  return root;
}
