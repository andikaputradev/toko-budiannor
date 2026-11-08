import { el, nextId } from '../../../shared/dom';
import { formatRupiah } from '../../../shared/format';
import { icon } from '../../../shared/icons';
import { label } from '../../../shared/messages';
import { billTotal, lineSubtotal } from '../domain/bill';
import { customerLabel, initialsOf } from '../domain/catalog-view';
import type { PosSession } from '../pos-session';

export interface PaySummary {
  readonly element: HTMLElement;
  paint(): void;
}

// Kolom kiri layar bayar: chip pelanggan, daftar pesanan, dan bar Subtotal yang dapat dibuka.
// Di bawah 900 px seluruh ringkasan terlipat sampai bar Subtotal diketuk.
export function createPaySummary(session: PosSession): PaySummary {
  const detailId = nextId('rincian-bayar');
  const chip = el('p', { className: 'pos-pay__customer' });
  const heading = el('h2', { className: 't-section-title' });
  const list = el('ul', { className: 'pos-pay__items' });
  const barAmount = el('output', { className: 'pos-pay__subtotal-amount' });
  const subtotalRow = el('output', { className: 'is-end' });
  const totalRow = el('output', { className: 'is-end' });
  const toggle = el(
    'button',
    {
      className: 'pos-pay__subtotal-bar',
      attrs: { type: 'button', 'aria-expanded': 'false', 'aria-controls': detailId },
    },
    el('span', { text: label('kolomSubtotal') }),
    barAmount,
    icon('chevron-down'),
  );
  const detail = el(
    'dl',
    { className: 'pos-pay__breakdown', attrs: { id: detailId, hidden: '' } },
    el('div', {}, el('dt', { text: label('kolomSubtotal') }), el('dd', {}, subtotalRow)),
    el(
      'div',
      { className: 'pos-pay__breakdown-total' },
      el('dt', { text: label('kolomTotal') }),
      el('dd', {}, totalRow),
    ),
  );
  const element = el(
    'section',
    {
      className: 'pos-pay__summary',
      attrs: { 'aria-label': label('totalTagihan'), 'data-open': 'false' },
    },
    chip,
    heading,
    list,
    toggle,
    detail,
  );
  toggle.addEventListener('click', () => {
    const open = toggle.getAttribute('aria-expanded') !== 'true';
    toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    element.dataset['open'] = open ? 'true' : 'false';
    detail.hidden = !open;
  });
  const paint = (): void => {
    const state = session.state();
    const current = session.customer();
    chip.replaceChildren(
      el(
        'span',
        { className: 'pos-pay__avatar', attrs: { 'aria-hidden': 'true' } },
        current === undefined ? icon('user-round') : initialsOf(current.name),
      ),
      el('span', { text: customerLabel(current) }),
    );
    heading.textContent = label('pesananJumlah', { jumlah: state.lines.length });
    list.replaceChildren(
      ...state.lines.map((line) =>
        el(
          'li',
          { className: 'pos-pay__item' },
          el('span', { text: session.product(line.productId)?.name ?? line.productId }),
          el('span', {
            className: 't-label',
            text: `${String(line.quantity).replace('.', ',')} ${line.unit}`,
          }),
          el('span', { className: 'is-end', text: formatRupiah(lineSubtotal(line)) }),
        ),
      ),
    );
    const subtotal = billTotal(state.lines);
    barAmount.textContent = formatRupiah(subtotal);
    subtotalRow.textContent = formatRupiah(subtotal);
    totalRow.textContent = formatRupiah(session.summary().total);
  };
  return { element, paint };
}
