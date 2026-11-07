import { el } from '../../../shared/dom';
import { label, message, type LabelKey } from '../../../shared/messages';
import { createButton } from '../../../shared/ui/button';
import { createTextField } from '../../../shared/ui/field';
import { openModal } from '../../../shared/ui/modal';
import { showToast } from '../../../shared/ui/toast';
import { isValidPhone } from '../domain/forms';

export interface ShareReceiptOptions {
  readonly title: string;
  readonly reference: string;
  readonly amountText: string;
  readonly customerName: string;
  readonly phone: string;
  readonly sentLabel: LabelKey;
}

// Pengiriman WhatsApp hanya disimulasikan: tidak ada permintaan jaringan dan tidak ada tautan keluar.
export function openShareReceipt(options: ShareReceiptOptions): void {
  const field = createTextField({
    labelText: label('nomorWhatsapp'),
    value: options.phone,
    inputMode: 'numeric',
  });
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
      field.root,
    ),
    actions: [],
  });
  handle.dialog.append(
    el(
      'div',
      { className: 'pos-cash__actions' },
      createButton({
        text: label('batal'),
        variant: 'secondary',
        onClick: () => {
          handle.close();
        },
      }),
      createButton({
        text: label('kirim'),
        onClick: () => {
          if (!isValidPhone(field.input.value)) {
            field.setError(message('MSG-044'));
            return;
          }
          field.setError(undefined);
          showToast({ kind: 'success', text: label(options.sentLabel) });
          handle.close();
        },
      }),
    ),
  );
  field.input.focus();
}
