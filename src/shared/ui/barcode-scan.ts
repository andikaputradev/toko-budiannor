import '../../styles/mobile-stock.css';
import type { Product } from '../data/types';
import { el, nextId } from '../dom';
import { icon } from '../icons';
import { mt } from '../mobile-text';
import { createButton } from './button';
import type { ModalHandle } from './modal';
import { openSheet } from './sheet';

export interface BarcodeScanOptions {
  /** Daftar barang untuk contoh pindai (simulasi). */
  readonly products: () => readonly Product[];
  /** Dipanggil dengan kode barcode yang dipindai atau diketik. */
  readonly onResult: (code: string) => void;
}

let sample = 0;

// Lembar pindai barcode. Mockup ini tidak membuka kamera: kode diketik, dikirim pemindai Bluetooth
// (berperilaku seperti papan ketik, diakhiri Enter), atau diambil dari tombol simulasi.
export function openBarcodeScan(options: BarcodeScanOptions): ModalHandle {
  const inputId = nextId('scn-kode');
  const input = el('input', {
    className: 'input',
    attrs: {
      id: inputId,
      type: 'text',
      inputmode: 'numeric',
      autocomplete: 'off',
      placeholder: mt('scnPlaceholder'),
    },
  });
  const simulate = createButton({
    text: mt('scnSimulasi'),
    variant: 'secondary',
    icon: 'scan-barcode',
    onClick: () => {
      const rows = options.products().filter((product) => product.barcode !== '');
      const picked = rows[(sample * 7) % Math.max(1, rows.length)];
      sample += 1;
      if (picked !== undefined) {
        input.value = picked.barcode;
      }
      input.focus();
    },
  });
  const body = el(
    'div',
    { className: 'own-form scn' },
    el(
      'div',
      { className: 'scn-view', attrs: { 'aria-hidden': 'true' } },
      el('span', { className: 'scn-view__frame' }, icon('scan-barcode')),
    ),
    el('p', { className: 't-label', text: mt('scnPetunjuk') }),
    el(
      'div',
      { className: 'field' },
      el('label', { className: 'field__label', text: mt('scnKode'), attrs: { for: inputId } }),
      input,
    ),
    simulate,
    el('p', { className: 't-label', text: mt('scnSimulasiKet') }),
  );
  const handle = openSheet({
    title: mt('scnJudul'),
    body,
    submitText: mt('scnCari'),
    onSubmit: () => {
      const code = input.value.trim();
      if (code === '') {
        return mt('scnKodeKosong');
      }
      options.onResult(code);
      return undefined;
    },
  });
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      const buttons = handle.dialog.querySelectorAll<HTMLButtonElement>('.modal__actions button');
      buttons[buttons.length - 1]?.click();
    }
  });
  input.focus();
  return handle;
}
