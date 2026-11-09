import { el, type Child } from '../../../shared/dom';
import { formatDate } from '../../../shared/format';
import { icon, type IconName } from '../../../shared/icons';

// Bagian kecil yang dipakai bersama oleh Dashboard dan Laporan Owner.

export interface Toggle<T extends string> {
  readonly element: HTMLElement;
  set(value: T): void;
}

export interface ToggleOptions<T extends string> {
  readonly name: string;
  readonly items: readonly (readonly [T, string])[];
  readonly value: T;
  readonly onChange: (value: T) => void;
}

// Saklar dua pilihan (segmen) dengan tombol 48 px. Tombol tidak dibuat ulang saat nilai berubah,
// sehingga fokus papan ketik tetap.
export function createToggle<T extends string>(options: ToggleOptions<T>): Toggle<T> {
  const buttons = new Map<T, HTMLButtonElement>();
  const element = el('div', {
    className: 'own-segment dash-toggle',
    attrs: { role: 'group', 'aria-label': options.name },
  });
  const set = (value: T): void => {
    for (const [key, button] of buttons) {
      button.setAttribute('aria-pressed', key === value ? 'true' : 'false');
    }
  };
  for (const [value, text] of options.items) {
    const button = el('button', {
      className: 'own-segment__button',
      text,
      attrs: { type: 'button', 'aria-pressed': 'false' },
    });
    button.addEventListener('click', () => {
      set(value);
      options.onChange(value);
    });
    buttons.set(value, button);
    element.append(button);
  }
  set(options.value);
  return { element, set };
}

export interface Panel<T> {
  readonly element: HTMLElement;
  update(model: T): void;
}

// Panel yang hanya menggambar ulang isinya bila model (data biasa) berubah. Pembaruan berkala
// tanpa perubahan data tidak mengganggu fokus atau posisi gulir.
export function createPanel<T>(
  className: string,
  render: (model: T) => readonly Child[],
  tag: 'div' | 'section' = 'div',
): Panel<T> {
  const element = el(tag, { className });
  let last: string | undefined;
  return {
    element,
    update: (model) => {
      const key = JSON.stringify(model);
      if (key === last) {
        return;
      }
      last = key;
      element.replaceChildren(...render(model).filter((child): child is Node | string => !!child));
    },
  };
}

export function dayText(day: string): string {
  return formatDate(new Date(`${day}T12:00:00+07:00`));
}

export function dayShort(day: string): string {
  return dayText(day).split(' ').slice(0, 2).join(' ');
}

export function navLink(path: string, className: string, ...children: Child[]): HTMLAnchorElement {
  return el('a', { className, attrs: { href: `#${path}` } }, ...children);
}

export interface TableColumn {
  readonly header: string;
  readonly numeric?: boolean;
}

export interface TableRow {
  readonly cells: readonly Child[];
  readonly strong?: boolean;
}

export interface TableOptions {
  readonly caption: string;
  readonly columns: readonly TableColumn[];
  readonly rows: readonly TableRow[];
  /** Sembunyikan judul kolom secara visual (tetap dibaca pembaca layar). */
  readonly hideHeader?: boolean;
}

// Tabel angka ringkas: kolom pertama judul baris, kolom angka rata kanan.
export function createTable(options: TableOptions): HTMLElement {
  const head = el(
    'tr',
    {},
    ...options.columns.map((column) =>
      el('th', {
        className: column.numeric === true ? 'is-num' : '',
        text: column.header,
        attrs: { scope: 'col' },
      }),
    ),
  );
  const body = options.rows.map((row) =>
    el(
      'tr',
      { className: row.strong === true ? 'is-strong' : '' },
      ...row.cells.map((cell, index) => {
        const numeric = options.columns[index]?.numeric === true;
        return index === 0
          ? el('th', { attrs: { scope: 'row' } }, cell)
          : el('td', { className: numeric ? 'is-num' : '' }, cell);
      }),
    ),
  );
  return el(
    'div',
    { className: 'dash-table-wrap' },
    el(
      'table',
      { className: 'dash-table' },
      el('caption', { className: 'visually-hidden', text: options.caption }),
      el('thead', { className: options.hideHeader === true ? 'visually-hidden' : '' }, head),
      el('tbody', {}, ...body),
    ),
  );
}

export function titleRow(text: string, iconName?: IconName): HTMLElement {
  return el(
    'div',
    { className: 'mob-card__head' },
    el(
      'h2',
      { className: 'mob-card__title' },
      iconName === undefined ? false : icon(iconName),
      el('span', { text }),
    ),
  );
}

export function emptyNote(text: string): HTMLElement {
  return el('p', { className: 'dash-note', text });
}
