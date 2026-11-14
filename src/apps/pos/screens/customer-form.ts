import { el } from '../../../shared/dom';
import { formatRupiah } from '../../../shared/format';
import type { Tier } from '../../../shared/data/types';
import { label, message, type LabelKey } from '../../../shared/messages';
import { createButton } from '../../../shared/ui/button';
import { createTextField } from '../../../shared/ui/field';
import { openModal } from '../../../shared/ui/modal';
import { showToast } from '../../../shared/ui/toast';
import { takeCustomerFormReturn } from '../customer-return';
import { isValidPhone, MAX_NAME_LENGTH, parseDueDays, parseRupiahInput } from '../domain/forms';
import type { PosSession } from '../pos-session';
import { createTopbar } from '../topbar';
import type { ScreenHandle } from './login';

const TIERS: readonly (readonly [Tier, LabelKey])[] = [
  ['eceran', 'tierEceran'],
  ['grosir', 'tierGrosir'],
];

function isPc(): boolean {
  return (
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(hover: hover) and (pointer: fine)').matches
  );
}

export function renderCustomerForm(session: PosSession, go: (path: string) => void): ScreenHandle {
  // Tujuan setelah simpan atau batal: layar jual, atau daftar Pelanggan bila dibuka dari sana.
  const back = takeCustomerFormReturn();
  const topbar = createTopbar(session, 'judulPelangganBaru');
  let tier: Tier = 'eceran';
  let limit = 0;

  const name = createTextField({ labelText: label('namaPelanggan') });
  const phone = createTextField({ labelText: label('teleponPelanggan'), inputMode: 'numeric' });
  const address = createTextField({ labelText: label('alamat') });
  const limitField = createTextField({
    labelText: label('limitPiutangDasar'),
    inputMode: 'numeric',
  });
  const due = createTextField({ labelText: label('jatuhTempoHari'), inputMode: 'numeric' });
  name.input.maxLength = MAX_NAME_LENGTH;
  const tierGroup = el('div', {
    className: 'pos-customer-form__tiers',
    attrs: { role: 'radiogroup', 'aria-label': label('kategoriHarga') },
  });
  const tierButtons = new Map<Tier, HTMLButtonElement>();
  for (const [value, key] of TIERS) {
    const button = el('button', {
      className: 'pos-unit__unit',
      text: label(key),
      attrs: { type: 'button', role: 'radio', 'aria-checked': 'false' },
    });
    button.addEventListener('click', () => {
      tier = value;
      paintTier();
    });
    tierButtons.set(value, button);
    tierGroup.append(button);
  }
  function paintTier(): void {
    for (const [value, button] of tierButtons) {
      button.setAttribute('aria-checked', value === tier ? 'true' : 'false');
    }
  }

  const dirty = (): boolean =>
    [name, phone, address, due].some((field) => field.input.value.trim() !== '') || limit > 0;

  const cancel = (): void => {
    if (!dirty()) {
      go(back);
      return;
    }
    openModal({
      title: label('batalkanJudul'),
      body: label('batalkanTeks'),
      actions: [
        { text: label('lanjutMengisi'), variant: 'secondary' },
        {
          text: label('tutupTanpaSimpan'),
          variant: 'danger',
          onClick: () => {
            go(back);
          },
        },
      ],
    });
  };

  const submit = (): void => {
    for (const field of [name, phone, limitField, due]) {
      field.setError(undefined);
    }
    if (name.input.value.trim() === '') {
      name.setError(message('MSG-043'));
      name.input.focus();
      return;
    }
    if (!isValidPhone(phone.input.value)) {
      phone.setError(message('MSG-044'));
      phone.input.focus();
      return;
    }
    const dueDays = parseDueDays(due.input.value);
    if (dueDays === undefined) {
      due.setError(label('jatuhTempoSalah'));
      due.input.focus();
      return;
    }
    const result = session.registerCustomer({
      name: name.input.value,
      phone: phone.input.value,
      address: address.input.value,
      tier,
      limit,
      dueDays,
    });
    if (result.ok) {
      showToast({ kind: 'success', text: message('MSG-010') });
      go(back);
      return;
    }
    const target = result.field === 'limit' ? limitField : result.field === 'name' ? name : phone;
    target.setError(message(result.messageId));
    target.input.focus();
  };

  limitField.input.addEventListener('input', () => {
    limit = parseRupiahInput(limitField.input.value);
    limitField.input.value = limit === 0 ? '' : formatRupiah(limit).replace('Rp ', '');
    limitField.setError(undefined);
  });
  const onKey = (event: KeyboardEvent): void => {
    if (document.querySelector('.modal-overlay') !== null) {
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      cancel();
    } else if (isPc() && event.ctrlKey && event.key.toLowerCase() === 's') {
      event.preventDefault();
      submit();
    }
  };
  document.addEventListener('keydown', onKey);

  const element = el(
    'div',
    { className: 'pos' },
    topbar.element,
    el(
      'main',
      { className: 'pos-customer-form' },
      el(
        'div',
        { className: 'pos-customer-form__grid' },
        name.root,
        phone.root,
        el('div', { className: 'pos-customer-form__wide' }, address.root),
        el(
          'div',
          { className: 'pos-customer-form__wide' },
          el('p', { className: 'field__label', text: label('kategoriHarga') }),
          tierGroup,
        ),
        limitField.root,
        due.root,
      ),
      el(
        'div',
        { className: 'pos-customer-form__actions' },
        createButton({ text: label('batal'), variant: 'secondary', onClick: cancel }),
        createButton({ text: label('simpanPelanggan'), icon: 'save', onClick: submit }),
      ),
    ),
  );
  paintTier();
  name.input.focus();
  return {
    element,
    destroy: () => {
      document.removeEventListener('keydown', onKey);
      topbar.destroy();
    },
  };
}
