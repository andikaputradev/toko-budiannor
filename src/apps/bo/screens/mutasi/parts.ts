import '../../../../styles/bo-stok.css';
import '../../../../styles/bo-mutasi.css';
import { el, nextId } from '../../../../shared/dom';
import { label, message } from '../../../../shared/messages';
import { createButton } from '../../../../shared/ui/button';
import { openModal } from '../../../../shared/ui/modal';
import { showToast } from '../../../../shared/ui/toast';
import type { Store } from '../../../../shared/store/store';
import { exportTableToCsv } from '../../domain/accounting';
import { DEFAULT_STORE_PROFILE } from '../../domain/settings-rbac';
import { openExportPreview } from '../../export-preview';
import { MUT_TEXT } from './text';

export function userName(store: Store, id: string | undefined): string {
  if (id === undefined) {
    return '';
  }
  return store.getState().data.users.find((user) => user.id === id)?.name ?? id;
}

// Tombol tambah di atas kartu daftar: "+ Buat Do Transfer", "+ Koreksi Stok", "+ Perintah Opname".
export function createCreateBar(text: string, onClick: () => void): HTMLElement {
  const button = createButton({ text, variant: 'primary', icon: 'plus', onClick });
  button.classList.add('bo-mut-create');
  return el('div', { className: 'bo-mut-bar' }, button);
}

// Area tabel yang menggulir di dalam kartunya (halaman tetap satu layar).
export function createScrollRegion(ariaLabel: string, ...children: HTMLElement[]): HTMLElement {
  return el(
    'div',
    {
      className: 'bo-mut-scroll',
      attrs: { tabindex: '0', role: 'region', 'aria-label': ariaLabel },
    },
    ...children,
  );
}

export interface ListCardOptions {
  readonly title: string;
  readonly content: HTMLElement;
  // Kartu dengan judul yang dapat dilipat (Riwayat koreksi pada gambar 16).
  readonly collapsible?: boolean;
}

export function createListCard(options: ListCardOptions): HTMLElement {
  if (options.collapsible === true) {
    const bodyId = nextId('mut-kartu');
    options.content.id = bodyId;
    const toggle = el('button', {
      className: 'bo-mut-card__toggle',
      text: options.title,
      attrs: { type: 'button', 'aria-expanded': 'true', 'aria-controls': bodyId },
    });
    const card = el(
      'section',
      { className: 'bo-mut-card bo-mut-card--fold' },
      el('h2', { className: 'bo-mut-card__title' }, toggle),
      options.content,
    );
    toggle.addEventListener('click', () => {
      const open = toggle.getAttribute('aria-expanded') !== 'true';
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
      options.content.hidden = !open;
      card.classList.toggle('is-folded', !open);
    });
    return card;
  }
  return el(
    'section',
    { className: 'bo-mut-card' },
    el('h2', { className: 'bo-mut-card__title', text: options.title }),
    options.content,
  );
}

export interface PreviewColumn {
  readonly text: string;
  readonly end?: boolean;
}

export interface PreviewSign {
  readonly role: string;
  readonly name: string;
}

export interface DocumentPreview {
  readonly modalTitle: string;
  readonly heading: string;
  readonly number: string;
  readonly intro: string;
  readonly columns: readonly PreviewColumn[];
  readonly rows: readonly (readonly string[])[];
  readonly note?: string | undefined;
  readonly signs: readonly PreviewSign[];
  readonly onPrint: () => void;
}

// Pratinjau dokumen cetak (Bukti Transfer Stok): rupa yang sama dengan Berita Acara Koreksi.
export function openDocumentPreview(options: DocumentPreview): void {
  const profile = DEFAULT_STORE_PROFILE;
  const table = el(
    'table',
    { className: 'pos-table bo-stok-table' },
    el(
      'thead',
      {},
      el(
        'tr',
        {},
        ...options.columns.map((column) =>
          el('th', { className: column.end === true ? 'is-end' : '', text: column.text }),
        ),
      ),
    ),
    el(
      'tbody',
      {},
      ...options.rows.map((row) =>
        el(
          'tr',
          {},
          ...row.map((cell, index) =>
            el('td', {
              className: options.columns[index]?.end === true ? 'is-end' : '',
              text: cell,
            }),
          ),
        ),
      ),
    ),
  );
  const body = el(
    'div',
    { className: 'bo-print-modal-content bo-korek-ba' },
    el(
      'div',
      { className: 'bo-korek-ba__head' },
      el('p', { className: 'bo-korek-ba__store', text: profile.name }),
      el('p', {
        className: 'bo-korek-ba__address',
        text: `${profile.tagline}. ${profile.address}`,
      }),
      el('h3', { className: 'bo-korek-ba__title', text: options.heading }),
      el('p', { className: 'bo-korek-ba__number', text: options.number }),
    ),
    el('p', { text: options.intro }),
    el('div', { className: 'bo-stok-scroll' }, table),
    options.note === undefined
      ? false
      : el('p', { className: 'bo-korek-ba__reason', text: options.note }),
    el(
      'div',
      { className: 'bo-korek-ba__signs' },
      ...options.signs.map((sign) =>
        el(
          'div',
          { className: 'bo-korek-ba__sign' },
          el('span', { className: 'bo-korek-ba__sign-role', text: sign.role }),
          el('span', { className: 'bo-korek-ba__sign-line' }),
          el('span', { className: 'bo-korek-ba__sign-name', text: sign.name }),
        ),
      ),
    ),
  );
  const handle = openModal({
    title: options.modalTitle,
    body,
    actions: [
      { text: label('tutup'), variant: 'secondary' },
      {
        text: label('cetak'),
        variant: 'primary',
        icon: 'printer',
        onClick: options.onPrint,
      },
    ],
  });
  handle.dialog.classList.add('bo-stok-modal');
}

export interface PrintChooserOptions {
  readonly title: string;
  readonly dateText: string;
  readonly fileName: string;
  readonly columns: readonly string[];
  readonly rows: readonly (readonly string[])[];
}

// Cetak tabel lewat jendela cetak peramban: hanya area ini yang tampil di kertas.
export function printTable(options: PrintChooserOptions): void {
  const area = el(
    'div',
    { className: 'bo-mut-print' },
    el('h1', { text: options.title }),
    el('p', { text: options.dateText }),
    el(
      'table',
      {},
      el('thead', {}, el('tr', {}, ...options.columns.map((column) => el('th', { text: column })))),
      el(
        'tbody',
        {},
        ...options.rows.map((row) => el('tr', {}, ...row.map((cell) => el('td', { text: cell })))),
      ),
    ),
  );
  document.body.append(area);
  document.body.classList.add('is-printing-mutasi');
  try {
    window.print();
  } finally {
    document.body.classList.remove('is-printing-mutasi');
    area.remove();
  }
}

// Kotak pilihan tombol Cetak (Print, Ekspor Excel, Ekspor PDF), seperti Cetak pada Data Barang.
export function openPrintChooser(options: PrintChooserOptions): void {
  const guard = (run: () => void): (() => void) => {
    return () => {
      if (options.rows.length === 0) {
        showToast({ kind: 'error', text: message('MSG-069') });
        return;
      }
      run();
    };
  };
  openModal({
    title: label('cetak'),
    body: el('p', { text: MUT_TEXT.pilihCetak }),
    actions: [
      { text: label('tutup'), variant: 'secondary' },
      {
        text: MUT_TEXT.cetakLangsung,
        variant: 'primary',
        icon: 'printer',
        onClick: guard(() => {
          printTable(options);
        }),
      },
      {
        text: label('eksporExcel'),
        variant: 'secondary',
        icon: 'download',
        onClick: guard(() => {
          exportTableToCsv(
            options.fileName,
            [...options.columns],
            options.rows.map((row) => [...row]),
          );
          showToast({
            kind: 'success',
            text: label('cetakDiunduh', { nama: `${options.fileName}.csv` }),
          });
        }),
      },
      {
        text: label('eksporPdf'),
        variant: 'secondary',
        icon: 'file-text',
        onClick: guard(() => {
          openExportPreview({
            kind: 'pdf',
            title: options.title,
            columns: options.columns,
            rows: options.rows,
          });
        }),
      },
    ],
  });
}
