import { el, nextId } from '../../../../shared/dom';
import { formatDecimal } from '../../../../shared/format';
import { icon } from '../../../../shared/icons';
import { lineAmount, type DocLine } from '../../domain/doc-line';
import { parsePriceText } from '../../domain/line-detail';
import { fill, TRX_TEXT as T } from './text';

export type LinesMode = 'penjualan' | 'pembelian' | 'order';

export interface LinesTableOptions {
  // penjualan: kolom Koli; pembelian dan order: tanpa Koli.
  readonly mode: LinesMode;
  readonly lines: () => readonly DocLine[];
  readonly onEdit: (id: string) => void;
  readonly onReorder: (from: number, to: number) => void;
  readonly onKoli?: ((id: string, value: boolean) => void) | undefined;
  readonly isPromo?: ((line: DocLine) => boolean) | undefined;
}

export interface LinesTable {
  readonly root: HTMLElement;
  refresh(): void;
}

// Diskon ringkas untuk kolom tabel: "0", persen apa adanya, atau nominal per satuan.
export function discountText(expr: string): string {
  const clean = expr.trim();
  if (clean === '' || clean === '0') {
    return '0';
  }
  const rupiah = /^rp\s*(\d+)$/i.exec(clean);
  if (rupiah?.[1] !== undefined) {
    return formatDecimal(Number(rupiah[1]));
  }
  return clean.includes('+') || clean.endsWith('%') ? clean : `${clean}%`;
}

// Tabel baris dokumen Transaksi (gambar klien 9 dan 11): pegangan urut, Koli (penjualan), nama,
// kode, gudang, kuantitas, satuan, @harga, diskon, total harga. Klik nama atau baris mengubah baris.
export function createLinesTable(options: LinesTableOptions): LinesTable {
  const withKoli = options.mode === 'penjualan';
  const body = el('tbody', {});
  const head = el(
    'tr',
    {},
    el(
      'th',
      { className: 'bo-trx-col-handle' },
      el('span', { className: 'bo-trx-sr', text: T.urut }),
    ),
    withKoli ? el('th', { className: 'bo-trx-col-koli', text: T.koli }) : false,
    el('th', { text: T.kolNama }),
    el('th', { className: 'bo-trx-col-kode', text: T.kolKode }),
    el('th', { className: 'is-center bo-trx-col-gudang', text: T.kolGudang }),
    el('th', { className: 'is-end bo-trx-col-qty', text: T.kolKuantitas }),
    el('th', { className: 'is-center bo-trx-col-satuan', text: T.kolSatuan }),
    el('th', { className: 'is-end bo-trx-col-harga', text: T.kolHarga }),
    el('th', { className: 'is-end bo-trx-col-diskon', text: T.kolDiskon }),
    el('th', { className: 'is-end bo-trx-col-total', text: T.kolTotal }),
  );
  const root = el(
    'div',
    {
      className: 'bo-trx__lines',
      attrs: { tabindex: '0', role: 'region', 'aria-label': T.daftarBarang },
    },
    el('table', { className: 'bo-trx-table bo-trx-table--lines' }, el('thead', {}, head), body),
  );
  const columns = withKoli ? 10 : 9;
  let dragFrom = -1;

  const refresh = (): void => {
    const lines = options.lines();
    if (lines.length === 0) {
      body.replaceChildren(
        el(
          'tr',
          { className: 'bo-trx-table__empty' },
          el('td', { text: T.kosong, attrs: { colspan: String(columns) } }),
        ),
      );
      return;
    }
    body.replaceChildren(
      ...lines.map((line, index) => {
        const handle = el(
          'button',
          {
            className: 'bo-trx-handle',
            attrs: {
              type: 'button',
              'aria-label': fill(T.urutBaris, { nama: line.productName }),
              title: fill(T.urutBaris, { nama: line.productName }),
            },
          },
          icon('menu'),
        );
        handle.addEventListener('keydown', (event) => {
          if (event.altKey && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
            event.preventDefault();
            const target = event.key === 'ArrowUp' ? index - 1 : index + 1;
            if (target >= 0 && target < lines.length) {
              options.onReorder(index, target);
              refresh();
              body.querySelectorAll<HTMLButtonElement>('.bo-trx-handle')[target]?.focus();
            }
          }
        });
        const nameButton = el('button', {
          className: 'bo-trx-table__name',
          text: line.productName,
          attrs: { type: 'button', title: line.productName },
        });
        nameButton.addEventListener('click', (event) => {
          event.stopPropagation();
          options.onEdit(line.id);
        });
        const koli = withKoli
          ? el(
              'td',
              { className: 'bo-trx-col-koli' },
              (() => {
                const box = el('input', {
                  attrs: {
                    type: 'checkbox',
                    'aria-label': fill(T.koliBaris, { nama: line.productName }),
                  },
                });
                box.checked = line.koli;
                box.addEventListener('click', (event) => {
                  event.stopPropagation();
                });
                box.addEventListener('change', () => {
                  options.onKoli?.(line.id, box.checked);
                });
                return box;
              })(),
            )
          : false;
        const row = el(
          'tr',
          { attrs: { 'data-id': line.id, draggable: 'true' } },
          el('td', { className: 'bo-trx-col-handle' }, handle),
          koli,
          el(
            'td',
            { className: 'bo-trx-table__nameCell' },
            nameButton,
            options.isPromo?.(line) === true &&
              el('span', { className: 'bo-trx-badge', text: T.promo }),
          ),
          el('td', { className: 'bo-trx-table__code', text: line.code }),
          el('td', {
            className: 'is-center',
            text: line.warehouse === 'toko' ? T.toko : T.gudangBesar,
          }),
          el('td', { className: 'is-end', text: formatDecimal(line.quantity) }),
          el('td', { className: 'is-center', text: line.unit }),
          el('td', { className: 'is-end', text: formatDecimal(line.unitPrice) }),
          el('td', { className: 'is-end', text: discountText(line.discountExpr) }),
          el('td', { className: 'is-end is-bold', text: formatDecimal(lineAmount(line)) }),
        );
        row.addEventListener('click', () => {
          options.onEdit(line.id);
        });
        row.addEventListener('dragstart', (event) => {
          dragFrom = index;
          event.dataTransfer?.setData('text/plain', line.id);
        });
        row.addEventListener('dragover', (event) => {
          event.preventDefault();
        });
        row.addEventListener('drop', (event) => {
          event.preventDefault();
          if (dragFrom >= 0 && dragFrom !== index) {
            options.onReorder(dragFrom, index);
            refresh();
          }
          dragFrom = -1;
        });
        return row;
      }),
    );
  };

  refresh();
  return { root, refresh };
}

export interface TotalsBoxOptions {
  readonly onChange: () => void;
}

export interface TotalsBox {
  readonly root: HTMLElement;
  readonly discount: HTMLInputElement;
  readonly extra: HTMLInputElement;
  values(): { readonly discount: number; readonly extra: number };
  setTotals(totals: { readonly subtotal: number; readonly total: number }): void;
}

// Kotak total (gambar klien 9): Sub Total, Diskon (Rp), Total Biaya (Rp), Total.
export function createTotalsBox(options: TotalsBoxOptions): TotalsBox {
  const subtotal = el('strong', { className: 'bo-trx-totals__value', text: '0' });
  const total = el('strong', { className: 'bo-trx-totals__value is-total', text: '0' });
  const money = (id: string): HTMLInputElement =>
    el('input', {
      className: 'input is-num',
      attrs: { id, type: 'text', inputmode: 'numeric', autocomplete: 'off', value: '0' },
    });
  const discountId = nextId('trx-diskon');
  const extraId = nextId('trx-biaya');
  const discount = money(discountId);
  const extra = money(extraId);
  const cell = (title: string, content: Node, forId?: string): HTMLElement =>
    el(
      'div',
      { className: 'bo-trx-totals__cell' },
      el('label', {
        className: 'bo-trx-totals__label',
        text: title,
        ...(forId === undefined ? {} : { attrs: { for: forId } }),
      }),
      content,
    );
  const prefixed = (control: HTMLInputElement): HTMLElement =>
    el(
      'span',
      { className: 'bo-trx-dlg__money' },
      el('span', { className: 'bo-trx-dlg__prefix', text: 'Rp' }),
      control,
    );
  for (const input of [discount, extra]) {
    input.addEventListener('input', options.onChange);
    input.addEventListener('blur', () => {
      const value = parsePriceText(input.value);
      input.value = formatDecimal(Number.isFinite(value) && value > 0 ? value : 0, 2);
    });
  }
  const root = el(
    'div',
    { className: 'bo-trx-totals' },
    cell(T.subTotal, subtotal),
    cell(T.diskonNota, prefixed(discount), discountId),
    cell(T.totalBiaya, prefixed(extra), extraId),
    cell(T.total, total),
  );
  const parse = (input: HTMLInputElement): number => {
    const value = parsePriceText(input.value);
    return Number.isFinite(value) && value > 0 ? value : 0;
  };
  return {
    root,
    discount,
    extra,
    values: () => ({ discount: parse(discount), extra: parse(extra) }),
    setTotals: (totals) => {
      subtotal.textContent = `Rp ${formatDecimal(totals.subtotal)}`;
      total.textContent = `Rp ${formatDecimal(totals.total)}`;
    },
  };
}
