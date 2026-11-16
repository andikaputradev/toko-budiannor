import { el } from '../../../../shared/dom';
import { openModal } from '../../../../shared/ui/modal';
import { exportTableToCsv } from '../../domain/accounting';
import type { ReportTable } from '../../domain/reports';
import { DEFAULT_STORE_PROFILE } from '../../domain/settings-rbac';
import { printTable } from '../mutasi/parts';

// Pratinjau di layar dibatasi supaya laporan stok seluruh barang (ribuan baris) tetap ringan;
// Print dan ekspor selalu memuat semua baris.
export const PREVIEW_LIMIT = 300;

function allRows(report: ReportTable): string[][] {
  return [
    ...report.rows.map((row) => [...row]),
    ...(report.totals === undefined ? [] : [[...report.totals]]),
  ];
}

export function exportReportCsv(report: ReportTable): void {
  exportTableToCsv(
    report.fileName,
    report.columns.map((column) => column.text),
    allRows(report),
  );
}

// Pratinjau laporan: kop toko, parameter, tabel, dan total. Print membuka jendela cetak peramban
// (area ini saja yang tercetak); Export PDF memakai jalur yang sama (pilih "Simpan sebagai PDF").
export function openReportPreview(report: ReportTable, mode: 'print' | 'pdf'): void {
  const profile = DEFAULT_STORE_PROFILE;
  const shown = report.rows.slice(0, PREVIEW_LIMIT);
  const table = el(
    'table',
    { className: 'pos-table is-compact bo-rpt-table' },
    el(
      'thead',
      {},
      el(
        'tr',
        {},
        ...report.columns.map((column) =>
          el('th', { className: column.end === true ? 'is-end' : '', text: column.text }),
        ),
      ),
    ),
    el(
      'tbody',
      {},
      ...shown.map((row) =>
        el(
          'tr',
          {},
          ...row.map((cell, index) =>
            el('td', {
              className: report.columns[index]?.end === true ? 'is-end' : '',
              text: cell,
            }),
          ),
        ),
      ),
    ),
    report.totals === undefined
      ? false
      : el(
          'tfoot',
          {},
          el(
            'tr',
            {},
            ...report.totals.map((cell, index) =>
              el('th', {
                className: report.columns[index]?.end === true ? 'is-end' : '',
                text: cell,
              }),
            ),
          ),
        ),
  );
  const body = el(
    'div',
    { className: 'bo-print-modal-content bo-rpt-preview' },
    el(
      'div',
      { className: 'bo-rpt-preview__head' },
      el('p', { className: 'bo-rpt-preview__store', text: profile.name }),
      el('h3', { className: 'bo-rpt-preview__title', text: report.title }),
      ...report.params.map((line) => el('p', { className: 'bo-rpt-preview__param', text: line })),
    ),
    el(
      'div',
      {
        className: 'bo-rpt-preview__scroll',
        attrs: { tabindex: '0', role: 'region', 'aria-label': report.title },
      },
      table,
    ),
    report.rows.length > shown.length
      ? el('p', {
          className: 'bo-rpt-preview__note',
          text: `Menampilkan ${String(shown.length)} dari ${String(report.rows.length)} baris. Print dan ekspor memuat semua baris.`,
        })
      : false,
    mode === 'pdf'
      ? el('p', {
          className: 'bo-rpt-preview__note',
          text: 'Pada jendela cetak, pilih Simpan sebagai PDF untuk menyimpan laporan ini.',
        })
      : false,
  );
  const handle = openModal({
    title: report.title,
    body,
    actions: [
      { text: 'Tutup', variant: 'secondary' },
      {
        text: mode === 'pdf' ? 'Simpan PDF' : 'Cetak',
        variant: 'primary',
        icon: 'printer',
        onClick: () => {
          printTable({
            title: report.title,
            dateText: report.params.join(' | '),
            fileName: report.fileName,
            columns: report.columns.map((column) => column.text),
            rows: allRows(report),
          });
        },
      },
    ],
  });
  handle.dialog.classList.add('bo-rpt-preview-modal');
}
