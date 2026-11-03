import { el } from '../dom';
import { computeWindow } from '../virtual-window';

export interface TableColumn<T> {
  readonly header: string;
  readonly width: string;
  readonly align?: 'start' | 'end';
  readonly cell: (row: T) => string;
}

export interface VirtualTableOptions<T> {
  readonly label: string;
  readonly columns: readonly TableColumn<T>[];
  readonly rows: readonly T[];
  readonly overscan?: number;
}

const FALLBACK_ROW_HEIGHT = 48;

function cellClass(column: { readonly align?: 'start' | 'end' }): string {
  return column.align === 'end' ? 'vtable__cell is-end' : 'vtable__cell';
}

export function createVirtualTable<T>(options: VirtualTableOptions<T>): HTMLDivElement {
  const { columns, rows } = options;
  const overscan = options.overscan ?? 6;
  let rowHeight = FALLBACK_ROW_HEIGHT;
  let selected = -1;
  let frame = 0;

  const root = el('div', {
    className: 'vtable',
    attrs: {
      role: 'table',
      'aria-label': options.label,
      'aria-rowcount': String(rows.length + 1),
      'aria-colcount': String(columns.length),
    },
  });
  root.style.setProperty('--vtable-columns', columns.map((column) => column.width).join(' '));

  const head = el(
    'div',
    { className: 'vtable__row vtable__head', attrs: { role: 'row', 'aria-rowindex': '1' } },
    ...columns.map((column, index) =>
      el('div', {
        className: cellClass(column),
        text: column.header,
        attrs: { role: 'columnheader', 'aria-colindex': String(index + 1) },
      }),
    ),
  );
  const viewport = el('div', {
    className: 'vtable__viewport',
    attrs: { role: 'rowgroup', tabindex: '0' },
  });
  const spacer = el('div', { className: 'vtable__spacer' });
  const body = el('div', { className: 'vtable__rows' });
  spacer.append(body);
  viewport.append(spacer);
  root.append(head, viewport);

  const createRow = (index: number): HTMLDivElement => {
    const row = rows[index];
    const node = el('div', {
      className: index === selected ? 'vtable__row is-selected' : 'vtable__row',
      attrs: {
        role: 'row',
        'aria-rowindex': String(index + 2),
        'aria-current': index === selected && 'true',
        'data-index': String(index),
      },
    });
    if (row !== undefined) {
      columns.forEach((column, position) => {
        node.append(
          el('div', {
            className: cellClass(column),
            text: column.cell(row),
            attrs: { role: 'cell', 'aria-colindex': String(position + 1) },
          }),
        );
      });
    }
    return node;
  };

  const update = (): void => {
    const result = computeWindow({
      scrollTop: viewport.scrollTop,
      viewportHeight: viewport.clientHeight,
      rowHeight,
      total: rows.length,
      overscan,
    });
    spacer.style.height = `${String(result.totalHeight)}px`;
    body.style.transform = `translateY(${String(result.offset)}px)`;
    const fragment = document.createDocumentFragment();
    for (let index = result.start; index < result.end; index += 1) {
      fragment.append(createRow(index));
    }
    body.replaceChildren(fragment);
  };

  const measure = (): void => {
    const measured = Number.parseFloat(getComputedStyle(viewport).getPropertyValue('--row-height'));
    rowHeight = Number.isFinite(measured) && measured > 0 ? measured : FALLBACK_ROW_HEIGHT;
    update();
  };

  const select = (index: number): void => {
    selected = Math.min(Math.max(index, 0), rows.length - 1);
    const top = selected * rowHeight;
    const bottom = top + rowHeight;
    if (top < viewport.scrollTop) {
      viewport.scrollTop = top;
    } else if (bottom > viewport.scrollTop + viewport.clientHeight) {
      viewport.scrollTop = bottom - viewport.clientHeight;
    }
    update();
  };

  viewport.addEventListener('scroll', () => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(update);
  });
  viewport.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target.closest('[data-index]') : null;
    const index = Number(target?.getAttribute('data-index'));
    if (target !== null && Number.isInteger(index)) {
      select(index);
    }
  });
  viewport.addEventListener('keydown', (event) => {
    const page = Math.max(1, Math.floor(viewport.clientHeight / rowHeight) - 1);
    const moves: Readonly<Record<string, number>> = {
      ArrowDown: selected + 1,
      ArrowUp: selected - 1,
      PageDown: selected + page,
      PageUp: selected - page,
      Home: 0,
      End: rows.length - 1,
    };
    const target = moves[event.key];
    if (target !== undefined && rows.length > 0) {
      event.preventDefault();
      select(target);
    }
  });

  if (typeof ResizeObserver === 'undefined') {
    requestAnimationFrame(measure);
  } else {
    new ResizeObserver(measure).observe(viewport);
  }
  update();
  return root;
}
