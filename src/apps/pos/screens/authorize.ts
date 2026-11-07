import { el, nextId } from '../../../shared/dom';
import { formatRupiah } from '../../../shared/format';
import { icon } from '../../../shared/icons';
import { label } from '../../../shared/messages';
import { failureText } from '../failure';
import { formatDocumentNumber } from '../../../shared/format';
import { createButton } from '../../../shared/ui/button';
import { openModal } from '../../../shared/ui/modal';
import type { AuthorizePurpose, PosSession } from '../pos-session';

export interface AuthorizeOptions {
  readonly session: PosSession;
  readonly purpose?: AuthorizePurpose | undefined;
  readonly reference?: { readonly number: string; readonly total: number } | undefined;
  readonly onApproved?: (() => void) | undefined;
}

export function openAuthorizeModal(options: AuthorizeOptions): void {
  const { session } = options;
  const purpose = options.purpose ?? 'limit';
  const summary = session.summary();
  const reasonId = nextId('alasan');
  const pinId = nextId('pin-owner');
  const reason = el('textarea', {
    className: 'input pos-auth__reason',
    attrs: { id: reasonId, rows: '3', maxlength: '200' },
  });
  const pin = el('input', {
    className: 'input pos-auth__pin',
    attrs: {
      id: pinId,
      type: 'password',
      inputmode: 'numeric',
      maxlength: '6',
      autocomplete: 'off',
    },
  });
  const error = el('p', { className: 'pos-auth__error', attrs: { role: 'alert' } });
  const billNumber =
    options.reference?.number ?? formatDocumentNumber('B', session.state().heldBills.length + 1);
  const totalText = formatRupiah(options.reference?.total ?? session.total());
  const overdue = summary.decision?.ok === false && summary.decision.reason === 'overdue';

  const approve = createButton({
    text: label('setujui'),
    onClick: () => {
      const result = session.authorizeOwner(reason.value, pin.value, purpose, billNumber);
      if (result.ok) {
        handle.close();
        options.onApproved?.();
        return;
      }
      error.replaceChildren(icon('circle-x'), el('span', { text: failureText(result) }));
      pin.value = '';
      refresh();
    },
  });
  const refresh = (): void => {
    const ready = reason.value.trim() !== '' && pin.value !== '';
    approve.toggleAttribute('data-inactive', !ready);
    approve.setAttribute('aria-disabled', ready ? 'false' : 'true');
  };
  const handle = openModal({
    title: label('otorisasiJudul'),
    body: el(
      'div',
      { className: 'pos-auth' },
      el('p', {
        text: label(
          purpose === 'koreksi'
            ? 'otorisasiTindakanKoreksi'
            : overdue
              ? 'otorisasiTindakanTerlambat'
              : 'otorisasiTindakan',
        ),
      }),
      el('p', {
        text:
          purpose === 'koreksi'
            ? label('otorisasiTransaksiNomor', { nomor: billNumber, jumlah: totalText })
            : label('otorisasiTransaksi', { nomor: billNumber, jumlah: totalText }),
      }),
      ...(session.store.getState().online
        ? []
        : [el('p', { className: 't-label', text: label('otorisasiOffline') })]),
      el('label', { className: 'field__label', text: label('alasan'), attrs: { for: reasonId } }),
      reason,
      el('label', { className: 'field__label', text: label('pinOwner'), attrs: { for: pinId } }),
      el('div', { className: 'pos-auth__row' }, pin, error),
    ),
    actions: [{ text: label('batal'), variant: 'secondary' }],
  });
  approve.addEventListener(
    'click',
    (event) => {
      if (approve.getAttribute('aria-disabled') === 'true') {
        event.stopImmediatePropagation();
      }
    },
    true,
  );
  handle.dialog.querySelector('.modal__actions')?.append(approve);
  for (const field of [reason, pin]) {
    field.addEventListener('input', refresh);
  }
  pin.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      approve.click();
    }
  });
  refresh();
  reason.focus();
}
