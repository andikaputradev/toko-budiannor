import { el } from '../../../shared/dom';
import { label } from '../../../shared/messages';
import type {
  ColumnDef,
  MasterCell,
  MasterConfig,
  MasterRow,
  MasterTone,
} from '../domain/master-types';

export interface MasterTable {
  readonly element: HTMLElement;
  /** Membangun ulang baris (data berubah atau pencarian). */
  render(rows: readonly MasterRow[], selectedId: string | undefined): void;
  /** Memindahkan sorotan tanpa membangun ulang, supaya fokus papan ketik tetap di baris. */
  select(selectedId: string | undefined, reveal: boolean): void;
}

function badge(text: string, tone: MasterTone): HTMLSpanElement {
  return el('span', { className: `badge badge--${tone} bo-master__badge`, text });
}

function renderCell(column: ColumnDef, cell: MasterCell | undefined): HTMLTableCellElement {
  const td = el('td', {
    className:
      column.align === 'end'
        ? 'is-end bo-master__num'
        : column.key === 'name'
          ? 'bo-master__name'
          : '',
  });
  if (cell === undefined) {
    return td;
  }
  if (column.badge === true) {
    td.append(badge(cell.text, cell.tone ?? 'neutral'));
    return td;
  }
  const main = el(
    'div',
    { className: 'bo-master__main' },
    el('span', { className: 'bo-master__text', text: cell.text }),
  );
  if (cell.flag !== undefined) {
    main.append(badge(cell.flag.text, cell.flag.tone));
  }
  td.append(main);
  if (cell.sub !== undefined) {
    td.append(el('div', { className: 'bo-master__sub', text: cell.sub }));
  }
  return td;
}

export function createMasterTable(
  config: MasterConfig,
  onSelect: (id: string) => void,
): MasterTable {
  const body = el('tbody');
  const head = el(
    'tr',
    {},
    ...config.columns.map((column) =>
      el('th', {
        className: column.align === 'end' ? 'is-end' : '',
        text: label(column.label),
        attrs: { scope: 'col' },
      }),
    ),
  );
  const table = el(
    'table',
    { className: 'pos-table bo-master__table' },
    el('thead', {}, head),
    body,
  );
  const element = el(
    'div',
    {
      className: 'bo-master__tablewrap',
      attrs: { tabindex: '0', role: 'region', 'aria-label': label(config.menu) },
    },
    table,
  );

  const rowsById = new Map<string, HTMLTableRowElement>();

  const mark = (tr: HTMLTableRowElement, selected: boolean): void => {
    tr.classList.toggle('is-selected', selected);
    if (selected) {
      tr.setAttribute('aria-current', 'true');
    } else {
      tr.removeAttribute('aria-current');
    }
  };

  return {
    element,
    render: (rows, selectedId) => {
      rowsById.clear();
      body.replaceChildren(
        ...rows.map((row) => {
          const tr = el(
            'tr',
            {
              className: row.inactive ? 'bo-master__row is-inactive' : 'bo-master__row',
              attrs: { tabindex: '0' },
            },
            ...config.columns.map((column) => renderCell(column, row.cells[column.key])),
          );
          mark(tr, row.id === selectedId);
          tr.addEventListener('click', () => {
            onSelect(row.id);
          });
          tr.addEventListener('keydown', (event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              onSelect(row.id);
            }
          });
          rowsById.set(row.id, tr);
          return tr;
        }),
      );
    },
    select: (selectedId, reveal) => {
      for (const [id, tr] of rowsById) {
        mark(tr, id === selectedId);
      }
      if (reveal && selectedId !== undefined) {
        rowsById.get(selectedId)?.scrollIntoView({ block: 'nearest' });
      }
    },
  };
}
