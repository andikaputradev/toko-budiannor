import { el } from '../../../shared/dom';
import { icon, type IconName } from '../../../shared/icons';
import { label, message, type LabelKey } from '../../../shared/messages';
import { createButton } from '../../../shared/ui/button';
import { createTextField, type TextField } from '../../../shared/ui/field';
import { openModal } from '../../../shared/ui/modal';
import { showToast } from '../../../shared/ui/toast';
import { isValidEmail, isValidPhone } from '../domain/forms';

export interface ShareReceiptOptions {
  readonly title: string;
  readonly reference: string;
  readonly amountText: string;
  readonly customerName: string;
  readonly phone: string;
  readonly email?: string | undefined;
  readonly sentLabel: LabelKey;
  readonly sentEmailLabel?: LabelKey | undefined;
}

// Pengiriman WhatsApp dan email hanya disimulasikan: tidak ada permintaan jaringan dan tidak ada
// tautan keluar. Satu pengiriman yang berhasil menutup modal.
export function openShareReceipt(options: ShareReceiptOptions): void {
  const phoneField = createTextField({
    labelText: label('nomorWhatsapp'),
    value: options.phone,
    inputMode: 'numeric',
  });
  const emailField = createTextField({
    labelText: label('alamatEmail'),
    value: options.email ?? '',
    inputMode: 'email',
  });
  let close = (): void => undefined;
  const row = (
    iconName: IconName,
    field: TextField,
    actionLabel: LabelKey,
    onSend: () => void,
  ): HTMLElement => {
    const send = createButton({ text: label('kirim'), onClick: onSend });
    send.setAttribute('aria-label', label(actionLabel));
    return el(
      'div',
      { className: 'pos-share__row' },
      el(
        'span',
        { className: 'pos-share__icon', attrs: { 'aria-hidden': 'true' } },
        icon(iconName),
      ),
      field.root,
      send,
    );
  };
  const handle = openModal({
    title: options.title,
    body: el(
      'div',
      { className: 'pos-share' },
      el(
        'p',
        { className: 'pos-share__summary' },
        el('strong', { text: options.reference }),
        el('span', { className: 't-value', text: options.amountText }),
        el('span', { className: 't-label', text: options.customerName }),
      ),
      row('message-circle', phoneField, 'kirimLewatWhatsapp', () => {
        if (!isValidPhone(phoneField.input.value)) {
          phoneField.setError(message('MSG-044'));
          return;
        }
        phoneField.setError(undefined);
        showToast({ kind: 'success', text: label(options.sentLabel) });
        close();
      }),
      row('mail', emailField, 'kirimLewatEmail', () => {
        if (!isValidEmail(emailField.input.value)) {
          emailField.setError(label('emailSalah'));
          return;
        }
        emailField.setError(undefined);
        showToast({ kind: 'success', text: label(options.sentEmailLabel ?? 'strukTerkirimEmail') });
        close();
      }),
    ),
    actions: [],
  });
  close = () => {
    handle.close();
  };
  handle.dialog.append(
    el(
      'div',
      { className: 'pos-cash__actions' },
      createButton({ text: label('tutup'), variant: 'secondary', onClick: close }),
    ),
  );
  phoneField.input.focus();
}
