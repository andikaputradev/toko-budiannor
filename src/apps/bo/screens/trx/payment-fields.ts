import { el } from '../../../../shared/dom';
import { TRX_TEXT as T } from './text';

export interface PaymentFields {
  readonly terms: HTMLSelectElement;
  readonly tempo: HTMLInputElement;
  // Pembungkus Tempo (isian dan satuan "Hari") yang ditaruh di kepala dokumen.
  readonly tempoBox: HTMLElement;
  readonly channel: HTMLSelectElement | undefined;
  // Menyesuaikan isian dengan cara bayar: Tempo aktif hanya untuk hutang atau piutang, Kas atau Bank
  // hanya untuk tunai (uang masuk atau keluar dari kas atau bank, dasar pencatatan akuntansi).
  sync(): void;
  tempoDays(): number;
  setTerms(value: string): void;
}

function selectWith(options: readonly (readonly [string, string])[]): HTMLSelectElement {
  const select = el('select', { className: 'input is-select' });
  for (const [value, text] of options) {
    select.append(el('option', { text, attrs: { value } }));
  }
  return select;
}

// Isian Cara Bayar, Tempo, dan Kas / Bank pada kepala PO, SO, dan faktur (gambar klien 42 sampai 45).
export function createPaymentFields(options: {
  readonly credit: 'hutang' | 'piutang';
  readonly withChannel: boolean;
}): PaymentFields {
  const terms = selectWith([
    [options.credit, options.credit.toUpperCase()],
    ['tunai', 'TUNAI'],
  ]);
  const tempo = el('input', {
    className: 'input is-num',
    attrs: { type: 'text', inputmode: 'numeric', autocomplete: 'off', maxlength: '3', value: '30' },
  });
  const tempoBox = el(
    'span',
    { className: 'bo-trx-tempo' },
    tempo,
    el('span', { className: 'bo-trx-tempo__unit', text: T.hari, attrs: { 'aria-hidden': 'true' } }),
  );
  const channel = options.withChannel
    ? selectWith([
        ['kas', 'KAS'],
        ['bank', 'BANK'],
      ])
    : undefined;

  const sync = (): void => {
    const cash = terms.value === 'tunai';
    tempo.disabled = cash;
    tempoBox.classList.toggle('is-disabled', cash);
    if (cash) {
      tempo.value = '0';
    } else if (tempo.value.trim() === '' || tempo.value === '0') {
      tempo.value = '30';
    }
    if (channel !== undefined) {
      channel.disabled = !cash;
    }
  };
  terms.addEventListener('change', sync);
  tempo.addEventListener('input', () => {
    tempo.value = tempo.value.replace(/\D/g, '');
  });
  sync();

  return {
    terms,
    tempo,
    tempoBox,
    channel,
    sync,
    tempoDays: () => Number.parseInt(tempo.value, 10) || 0,
    setTerms: (value) => {
      terms.value = value;
      sync();
    },
  };
}
