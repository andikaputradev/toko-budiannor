import { el } from '../../../shared/dom';
import { formatRupiah } from '../../../shared/format';
import { icon } from '../../../shared/icons';
import { label } from '../../../shared/messages';
import { remainingLimit } from '../../../shared/data/receivable';
import type { Customer, Tier } from '../../../shared/data/types';
import { createButton } from '../../../shared/ui/button';
import { openModal } from '../../../shared/ui/modal';
import { initialsOf, proposalFirst } from '../domain/catalog-view';
import type { PosSession } from '../pos-session';

const TIER_KEYS = {
  eceran: 'tierEceran',
  grosir: 'tierGrosir',
  kontraktor: 'tierKontraktor',
} as const satisfies Record<Tier, string>;

export function openCustomerPicker(
  session: PosSession,
  onPicked: () => void,
  go: (path: string) => void,
): void {
  let query = '';
  const input = el('input', {
    className: 'input',
    attrs: {
      type: 'search',
      'aria-label': label('cariPelanggan'),
      placeholder: label('cariPelanggan'),
    },
  });
  const list = el('div', { className: 'pos-customers__list' });
  const all = proposalFirst(session.store.getState().data.customers);

  const row = (customer: Customer | undefined): HTMLButtonElement => {
    const name = customer === undefined ? label('pelangganUmum') : customer.name;
    const detail =
      customer === undefined
        ? ''
        : `${customer.code} - ${label(TIER_KEYS[customer.tier])} - ${customer.phone === '' ? '-' : customer.phone}`;
    const button = el(
      'button',
      { className: 'pos-customers__row', attrs: { type: 'button' } },
      el(
        'span',
        { className: 'pos-customers__avatar', attrs: { 'aria-hidden': 'true' } },
        customer === undefined ? icon('user-round') : initialsOf(customer.name),
      ),
      el(
        'span',
        { className: 'pos-customers__who' },
        el('strong', { text: name }),
        el('span', { className: 't-label', text: detail }),
      ),
      el('span', {
        className: 'pos-customers__limit t-label',
        text: customer === undefined ? '' : formatRupiah(Math.max(0, remainingLimit(customer))),
      }),
    );
    button.addEventListener('click', () => {
      session.setCustomer(customer?.id);
      handle.close();
      onPicked();
    });
    return button;
  };

  const fill = (): void => {
    const needle = query.trim().toLowerCase();
    const shown = all.filter(
      (customer) =>
        needle === '' ||
        customer.name.toLowerCase().includes(needle) ||
        customer.code.toLowerCase().includes(needle),
    );
    list.replaceChildren(row(undefined), ...shown.map(row));
  };
  input.addEventListener('input', () => {
    query = input.value;
    fill();
  });

  const handle = openModal({
    title: label('pilihPelanggan'),
    body: el('div', { className: 'pos-customers' }, input, list),
    actions: [],
  });
  handle.dialog.append(
    el(
      'div',
      { className: 'pos-customers__footer' },
      createButton({
        text: label('tambahPelanggan'),
        icon: 'plus',
        onClick: () => {
          handle.close();
          go('/pos/pelanggan-baru');
        },
      }),
    ),
  );
  fill();
  input.focus();
}
