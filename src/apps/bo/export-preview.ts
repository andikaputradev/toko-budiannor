import { el } from '../../shared/dom';
import { label, message } from '../../shared/messages';
import { openModal } from '../../shared/ui/modal';
import { showToast } from '../../shared/ui/toast';

export type ExportKind = 'pdf' | 'excel';

export interface ExportOptions {
  readonly kind: ExportKind;
  readonly title: string;
  readonly columns: readonly string[];
  readonly rows: readonly (readonly string[])[];
}

const PREVIEW_ROWS = 12;

export function openExportPreview(options: ExportOptions): void {
  if (options.rows.length === 0) {
    showToast({ kind: 'error', text: message('MSG-069') });
    return;
  }
  const shown = options.rows.slice(0, PREVIEW_ROWS);
  openModal({
    title: label(options.kind === 'pdf' ? 'pratinjauPdf' : 'pratinjauExcel'),
    body: el(
      'div',
      { className: 'bo-export' },
      el('p', { className: 't-label', text: label('simulasiEkspor') }),
      el('p', {
        text: label('ringkasEkspor', {
          judul: options.title,
          baris: String(options.rows.length),
        }),
      }),
      el(
        'div',
        { className: 'bo-export__scroll', attrs: { tabindex: '0', 'aria-label': options.title } },
        el(
          'table',
          { className: 'pos-table pos-table--dense' },
          el(
            'thead',
            {},
            el('tr', {}, ...options.columns.map((column) => el('th', { text: column }))),
          ),
          el(
            'tbody',
            {},
            ...shown.map((row) => el('tr', {}, ...row.map((cell) => el('td', { text: cell })))),
          ),
        ),
      ),
    ),
    actions: [{ text: label('tutup'), variant: 'secondary' }],
  });
}
