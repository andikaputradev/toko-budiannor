import '../../../../styles/bo-laporan.css';
import { el, nextId } from '../../../../shared/dom';
import { icon } from '../../../../shared/icons';
import { message } from '../../../../shared/messages';
import { createButton } from '../../../../shared/ui/button';
import { openModal } from '../../../../shared/ui/modal';
import { showToast } from '../../../../shared/ui/toast';
import type { ReportTable } from '../../domain/reports';
import { exportReportCsv, openReportPreview } from './preview';

export interface Choice {
  readonly value: string;
  readonly text: string;
}

export type DialogItem =
  | {
      readonly type: 'radios';
      readonly id: string;
      readonly options: readonly Choice[];
      readonly value: string;
    }
  | {
      readonly type: 'select';
      readonly id: string;
      readonly label: string;
      readonly options: readonly Choice[];
      readonly value: string;
    }
  | {
      readonly type: 'text';
      readonly id: string;
      readonly label: string;
      readonly placeholder: string;
      readonly list?: readonly string[];
    }
  | { readonly type: 'period'; readonly id: string; readonly label: string }
  | { readonly type: 'check'; readonly id: string; readonly label: string; readonly value: boolean }
  | {
      readonly type: 'checks';
      readonly items: readonly {
        readonly id: string;
        readonly label: string;
        readonly value: boolean;
      }[];
    };

// Pilihan, isian teks, dan tanggal ('<id>From' dan '<id>To'); kotak centang berupa 'true' atau ''.
export type DialogValues = Readonly<Record<string, string>>;

export interface DialogSpec {
  readonly title: string;
  readonly items: readonly DialogItem[];
  readonly defaultFrom: string;
  readonly defaultTo: string;
  build(values: DialogValues): ReportTable;
}

function row(labelText: string, control: HTMLElement, id: string): HTMLElement {
  return el(
    'div',
    { className: 'field bo-rpt-row' },
    el('label', { className: 'field__label', text: labelText, attrs: { for: id } }),
    control,
  );
}

// Kotak pilihan laporan (gambar klien 29): parameter di kiri-kanan, lalu Print, Export Excel,
// Export PDF, dan Tutup. Kotak tetap terbuka sesudah Print atau ekspor supaya parameter bisa diubah.
export function openReportDialog(spec: DialogSpec): void {
  const controls = new Map<string, HTMLInputElement | HTMLSelectElement>();
  const radioValues = new Map<string, string>();
  const rows: HTMLElement[] = [];

  for (const item of spec.items) {
    if (item.type === 'radios') {
      const group = nextId('rpt');
      rows.push(
        el(
          'div',
          { className: 'bo-rpt-radios', attrs: { role: 'radiogroup' } },
          ...item.options.map((option) => {
            const input = el('input', {
              attrs: { type: 'radio', name: group, value: option.value },
            });
            input.checked = option.value === item.value;
            input.addEventListener('change', () => {
              if (input.checked) {
                radioValues.set(item.id, option.value);
              }
            });
            return el(
              'label',
              { className: 'bo-rpt-radio' },
              input,
              el('span', { text: option.text }),
            );
          }),
        ),
      );
      radioValues.set(item.id, item.value);
    } else if (item.type === 'select') {
      const id = nextId('rpt');
      const select = el(
        'select',
        { className: 'input select__control', attrs: { id } },
        ...item.options.map((option) =>
          el('option', { text: option.text, attrs: { value: option.value } }),
        ),
      );
      select.value = item.value;
      controls.set(item.id, select);
      rows.push(
        row(item.label, el('div', { className: 'select' }, select, icon('chevron-down')), id),
      );
    } else if (item.type === 'text') {
      const id = nextId('rpt');
      const listId = `${id}-list`;
      const input = el('input', {
        className: 'input',
        attrs: {
          id,
          type: 'text',
          autocomplete: 'off',
          placeholder: item.placeholder,
          list: item.list === undefined ? undefined : listId,
        },
      });
      controls.set(item.id, input);
      rows.push(
        row(
          item.label,
          el(
            'div',
            { className: 'bo-rpt-text' },
            input,
            item.list === undefined
              ? false
              : el(
                  'datalist',
                  { attrs: { id: listId } },
                  ...item.list.map((value) => el('option', { attrs: { value } })),
                ),
          ),
          id,
        ),
      );
    } else if (item.type === 'period') {
      const idFrom = nextId('rpt');
      const idTo = nextId('rpt');
      const from = el('input', { className: 'input', attrs: { id: idFrom, type: 'date' } });
      const to = el('input', { className: 'input', attrs: { id: idTo, type: 'date' } });
      from.value = spec.defaultFrom;
      to.value = spec.defaultTo;
      controls.set(`${item.id}From`, from);
      controls.set(`${item.id}To`, to);
      to.setAttribute('aria-label', `${item.label} sampai`);
      rows.push(
        row(
          item.label,
          el('div', { className: 'bo-rpt-period' }, from, el('span', { text: 's/d' }), to),
          idFrom,
        ),
      );
    } else if (item.type === 'check') {
      const id = nextId('rpt');
      const input = el('input', { attrs: { id, type: 'checkbox' } });
      input.checked = item.value;
      controls.set(item.id, input);
      rows.push(row(item.label, el('div', { className: 'bo-rpt-check' }, input), id));
    } else {
      rows.push(
        el(
          'div',
          { className: 'bo-rpt-checks' },
          ...item.items.map((entry) => {
            const input = el('input', { attrs: { type: 'checkbox' } });
            input.checked = entry.value;
            controls.set(entry.id, input);
            return el(
              'label',
              { className: 'bo-rpt-radio' },
              input,
              el('span', { text: entry.label }),
            );
          }),
        ),
      );
    }
  }

  function values(): DialogValues {
    const result: Record<string, string> = {};
    for (const [id, control] of controls) {
      result[id] =
        control instanceof HTMLInputElement && control.type === 'checkbox'
          ? control.checked
            ? 'true'
            : ''
          : control.value;
    }
    for (const [id, value] of radioValues) {
      result[id] = value;
    }
    return result;
  }

  const error = el('p', { className: 'bo-error bo-rpt-error', attrs: { role: 'alert' } });

  // Mengembalikan laporan bila parameter sah dan ada isinya; selain itu menampilkan pesan.
  function report(): ReportTable | undefined {
    const current = values();
    const from = controls.get(`${periodId}From`);
    const to = controls.get(`${periodId}To`);
    if (
      from !== undefined &&
      to !== undefined &&
      from.value !== '' &&
      to.value !== '' &&
      from.value > to.value
    ) {
      error.textContent = 'Tanggal awal tidak boleh melewati tanggal akhir.';
      return undefined;
    }
    error.textContent = '';
    const table = spec.build(current);
    if (table.rows.length === 0) {
      error.textContent = table.emptyText === '' ? message('MSG-069') : table.emptyText;
      return undefined;
    }
    return table;
  }

  const run = (action: (table: ReportTable) => void): (() => void) => {
    return () => {
      const table = report();
      if (table !== undefined) {
        action(table);
      }
    };
  };

  const print = createButton({
    text: 'Print',
    icon: 'printer',
    onClick: run((table) => {
      openReportPreview(table, 'print');
    }),
  });
  const excel = createButton({
    text: 'Export Excel',
    variant: 'secondary',
    icon: 'download',
    onClick: run((table) => {
      exportReportCsv(table);
      showToast({ kind: 'success', text: `${table.fileName}.csv diunduh.` });
    }),
  });
  const pdf = createButton({
    text: 'Export PDF',
    variant: 'secondary',
    icon: 'file-text',
    onClick: run((table) => {
      openReportPreview(table, 'pdf');
    }),
  });
  const periodId = spec.items.find((item) => item.type === 'period')?.id ?? 'period';
  const body = el(
    'div',
    { className: 'bo-rpt' },
    ...rows,
    error,
    el('div', { className: 'bo-rpt-actions' }, print, excel, pdf),
  );
  const handle = openModal({ title: spec.title, body, actions: [] });
  handle.dialog.classList.add('bo-rpt-modal');
  const close = createButton({
    text: 'Tutup',
    variant: 'secondary',
    onClick: () => {
      handle.close();
    },
  });
  body.querySelector('.bo-rpt-actions')?.append(close);
  close.classList.add('bo-rpt-close');
}
