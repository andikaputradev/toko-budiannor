import '../../styles/mobile-form.css';
import { el } from '../dom';

// Bilah bawah yang menempel: total dan tombol simpan tetap terlihat saat daftar barang panjang.
export function createActionBar(
  totalLabel: string,
  total: HTMLElement,
  error: HTMLElement,
  save: HTMLElement,
  ...extra: readonly HTMLElement[]
): HTMLElement {
  return el(
    'div',
    { className: 'trx-bar' },
    error,
    el(
      'div',
      { className: 'trx-bar__row' },
      el(
        'div',
        { className: 'trx-bar__total' },
        el('span', { className: 'trx-bar__label', text: totalLabel }),
        total,
      ),
      save,
    ),
    ...extra,
  );
}
