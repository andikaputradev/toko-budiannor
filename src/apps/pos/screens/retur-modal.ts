import { el } from '../../../shared/dom';
import { formatDecimal } from '../../../shared/format';
import type { Sale } from '../../../shared/data/types';
import { label } from '../../../shared/messages';
import { failureText } from '../failure';
import { createButton } from '../../../shared/ui/button';
import { openModal } from '../../../shared/ui/modal';
import { showToast } from '../../../shared/ui/toast';
import { formatRupiah } from '../../../shared/format';
import type { PosSession } from '../pos-session';

export function openReturnModal(session: PosSession, sale: Sale, onDone: () => void): void {
  const picks = new Map<number, { box: HTMLInputElement; quantity: HTMLInputElement }>();
  const body = el('tbody');
  sale.lines.forEach((line, index) => {
    const box = el('input', {
      attrs: {
        type: 'checkbox',
        'aria-label': `${label('kolomPilih')} ${session.product(line.productId)?.name ?? ''}`,
      },
    });
    const quantity = el('input', {
      className: 'input pos-return__qty',
      attrs: {
        inputmode: 'decimal',
        autocomplete: 'off',
        'aria-label': `${label('kolomJumlahRetur')} ${session.product(line.productId)?.name ?? ''}`,
      },
    });
    quantity.value = formatDecimal(line.quantity - session.returnedQuantity(sale.number, index));
    picks.set(index, { box, quantity });
    body.append(
      el(
        'tr',
        {},
        el('td', {}, box),
        el('td', { text: session.product(line.productId)?.name ?? line.productId }),
        el('td', { className: 'is-end', text: formatDecimal(line.quantity) }),
        el('td', {
          className: 'is-end',
          text: formatDecimal(session.returnedQuantity(sale.number, index)),
        }),
        el('td', {}, quantity),
        el('td', { text: line.unit }),
      ),
    );
  });
  const reason = el('textarea', {
    className: 'input pos-return__reason',
    attrs: { rows: '2', 'aria-label': label('alasanRetur') },
  });
  const error = el('p', { className: 'pos-return__error', attrs: { role: 'alert' } });

  const handle = openModal({
    title: `${label('returPenjualan')} ${sale.number}`,
    body: el(
      'div',
      { className: 'pos-return' },
      el(
        'table',
        { className: 'pos-table' },
        el(
          'thead',
          {},
          el(
            'tr',
            {},
            el('th', { text: label('kolomPilih') }),
            el('th', { text: label('kolomBarang') }),
            el('th', { className: 'is-end', text: label('kolomDibeli') }),
            el('th', { className: 'is-end', text: label('kolomSudahDiretur') }),
            el('th', { text: label('kolomJumlahRetur') }),
            el('th', { text: label('kolomSatuan') }),
          ),
        ),
        body,
      ),
      el('label', { className: 'field__label', text: label('alasanRetur') }),
      reason,
      error,
    ),
    actions: [],
  });
  handle.dialog.append(
    el(
      'div',
      { className: 'pos-return__actions' },
      createButton({
        text: label('batal'),
        variant: 'secondary',
        onClick: () => {
          handle.close();
        },
      }),
      createButton({
        text: label('simpanRetur'),
        onClick: () => {
          const items = [...picks]
            .filter(([, pick]) => pick.box.checked)
            .map(([index, pick]) => ({
              index,
              quantity: Number(pick.quantity.value.trim().replace(',', '.')),
            }));
          const result = session.returnSale(sale.number, items, reason.value);
          if (result.ok) {
            showToast({
              kind: 'success',
              text: label('returTersimpan', {
                nomor: result.number,
                nilai: formatRupiah(result.value),
              }),
            });
            handle.close();
            onDone();
            return;
          }
          error.textContent = failureText(result);
        },
      }),
    ),
  );
  picks.values().next().value?.box.focus();
}
