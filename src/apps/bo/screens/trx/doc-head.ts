import { el, nextId } from '../../../../shared/dom';

export interface HeadField {
  readonly key: string;
  readonly label: string;
  readonly control: HTMLElement;
  // Pasangan label dan isian ke berapa dari kiri (mulai 1) dan baris ke berapa (mulai 1).
  readonly col: number;
  readonly row: number;
  // Berapa pasangan lebar isian membentang (bawaan 1), mis. Keterangan melebar tiga pasangan.
  readonly span?: number;
}

export interface DocHead {
  readonly root: HTMLElement;
  readonly controls: Readonly<Record<string, HTMLElement>>;
}

// Kepala dokumen Transaksi dengan label di kiri isian (gambar klien 9 dan 11). Penempatan grid
// lewat CSSOM karena CSP melarang atribut style. `aside` (mis. Info Piutang) ada di kolom kanan.
export function createDocHead(
  fields: readonly HeadField[],
  aside?: HTMLElement,
  title?: string,
): DocHead {
  const columns = Math.max(1, ...fields.map((item) => item.col + (item.span ?? 1) - 1));
  const grid = el('div', { className: 'bo-trx-head__grid' });
  grid.style.setProperty('--head-cols', String(columns));
  const controls: Record<string, HTMLElement> = {};
  for (const item of fields) {
    if (item.control.id === '') {
      item.control.id = nextId('trx-fld');
    }
    const caption = el('label', {
      className: 'bo-trx-head__label',
      text: item.label,
      attrs: { for: item.control.id },
    });
    caption.style.setProperty('grid-column', String(item.col * 2 - 1));
    caption.style.setProperty('grid-row', String(item.row));
    item.control.classList.add('bo-trx-head__control');
    item.control.style.setProperty(
      'grid-column',
      `${String(item.col * 2)} / span ${String((item.span ?? 1) * 2 - 1)}`,
    );
    item.control.style.setProperty('grid-row', String(item.row));
    grid.append(caption, item.control);
    controls[item.key] = item.control;
  }
  const root = el(
    'section',
    {
      className: 'bo-trx-head',
      attrs: { 'aria-label': title },
    },
    grid,
    aside,
  );
  return { root, controls };
}
