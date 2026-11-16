import '../../../../styles/bo-hutang.css';
import { el, nextId } from '../../../../shared/dom';
import { icon } from '../../../../shared/icons';
import { formatRupiah } from '../../../../shared/format';
import { createButton } from '../../../../shared/ui/button';
import { openModal } from '../../../../shared/ui/modal';
import { showToast } from '../../../../shared/ui/toast';
import type { BoSession } from '../../bo-session';
import {
  CASH_ACCOUNTS,
  PAY_METHODS,
  distribute,
  methodText,
  sumAllocations,
  type DebtPayment,
  type PayMethod,
} from '../../domain/debt-payments';
import { moneyText, parseMoney } from '../../domain/master-fields';
import {
  getPayableBalances,
  getReceivableBalances,
  getUnpaidInvoicesForParty,
  type PartyBalance,
  type PartyType,
  type UnpaidInvoice,
} from '../../domain/receivable-payable';
import { DEFAULT_STORE_PROFILE } from '../../domain/settings-rbac';
import type { ScreenHandle } from '../login';
import { userName } from '../mutasi/parts';
import { PAYMENT_PATH } from './payment-list';
import { DEBT_COPY, DEBT_TEXT, debt } from './text';

interface FormOptions {
  readonly number: string | undefined;
}

// Formulir Isi Data Pembayaran Piutang atau Hutang (gambar klien 23): data pembayaran di kiri, rincian
// faktur dengan isian Pembayaran per faktur di kanan. Pembayaran yang sudah tercatat hanya dibaca.
export function renderPaymentForm(
  session: BoSession,
  go: (path: string) => void,
  type: PartyType,
  options: FormOptions,
): ScreenHandle {
  const store = session.store;
  const copy = DEBT_COPY[type];
  const existing =
    options.number === undefined
      ? undefined
      : session.state().debtPayments.find((payment) => payment.number === options.number);
  const readOnly = existing !== undefined;
  const data = (): ReturnType<typeof store.getState>['data'] => store.getState().data;

  const parties = (): PartyBalance[] =>
    (type === 'pelanggan' ? getReceivableBalances(data()) : getPayableBalances(data()))
      .filter((party) => party.totalBalance > 0)
      .sort((a, b) => a.name.localeCompare(b.name, 'id'));

  let partyId = existing?.partyId ?? '';
  let invoices: UnpaidInvoice[] = [];
  let allocations: Record<string, number> = {};

  const error = el('p', { className: 'bo-error bo-debt-error', attrs: { role: 'alert' } });
  const tableBody = el('tbody', {});
  const totalPill = el('span', {
    className: 'bo-debt-pill',
    text: debt('rincianTotal', { nilai: formatRupiah(0) }),
  });
  const payOut = el('output', { className: 'bo-debt-total__value', text: formatRupiah(0) });

  const fieldId = (): string => nextId('pay');
  const row = (labelText: string, control: HTMLElement, id: string): HTMLElement =>
    el(
      'div',
      { className: 'field bo-debt-field' },
      el('label', { className: 'field__label', text: labelText, attrs: { for: id } }),
      control,
    );
  const selectBox = (
    id: string,
    choices: readonly { readonly value: string; readonly text: string }[],
    value: string,
  ): HTMLSelectElement => {
    const select = el(
      'select',
      { className: 'input select__control', attrs: { id } },
      ...choices.map((choice) =>
        el('option', { text: choice.text, attrs: { value: choice.value } }),
      ),
    );
    select.value = value;
    select.disabled = readOnly;
    return select;
  };
  const wrapSelect = (select: HTMLSelectElement): HTMLElement =>
    el('div', { className: 'select' }, select, icon('chevron-down'));

  const dateId = fieldId();
  const dateInput = el('input', { className: 'input', attrs: { id: dateId, type: 'date' } });
  dateInput.value = existing?.date ?? store.getState().data.referenceDate.slice(0, 10);
  dateInput.disabled = readOnly;

  const partyIdAttr = fieldId();
  const partySelect = selectBox(
    partyIdAttr,
    [
      { value: '', text: copy.pilihPihak },
      ...(existing !== undefined
        ? [{ value: existing.partyId, text: existing.partyName }]
        : parties().map((party) => ({ value: party.partyId, text: party.name }))),
    ],
    partyId,
  );

  const noteId = fieldId();
  const noteInput = el('input', {
    className: 'input',
    attrs: { id: noteId, type: 'text', autocomplete: 'off', maxlength: '120' },
  });
  noteInput.value = existing?.note ?? '';
  noteInput.disabled = readOnly;

  const methodId = fieldId();
  const methodSelect = selectBox(
    methodId,
    PAY_METHODS.map((method) => ({ value: method.value, text: method.text })),
    existing?.method ?? 'tunai',
  );
  const accountId = fieldId();
  const accountSelect = selectBox(
    accountId,
    CASH_ACCOUNTS.map((account) => ({ value: account, text: account })),
    existing?.account ?? CASH_ACCOUNTS[0] ?? '',
  );
  const nominalId = fieldId();
  const nominalInput = el('input', {
    className: 'input bo-debt-money',
    attrs: { id: nominalId, type: 'text', inputmode: 'numeric', autocomplete: 'off' },
  });
  nominalInput.value = existing === undefined ? '' : moneyText(existing.total);
  nominalInput.disabled = readOnly;
  const spread = el(
    'button',
    {
      className: 'bo-debt-iconbtn',
      attrs: {
        type: 'button',
        'aria-label': DEBT_TEXT.bagiOtomatis,
        title: DEBT_TEXT.bagiOtomatis,
      },
    },
    icon('refresh-cw'),
  );
  spread.disabled = readOnly;

  const paintTotal = (): void => {
    const total = readOnly ? (existing.total) : sumAllocations(allocations);
    payOut.textContent = formatRupiah(total);
  };

  const loadInvoices = (): void => {
    invoices = partyId === '' || readOnly ? [] : getUnpaidInvoicesForParty(partyId, type, data());
    allocations = {};
    for (const invoice of invoices) {
      allocations[invoice.invoiceNumber] = 0;
    }
    const party = parties().find((item) => item.partyId === partyId);
    totalPill.textContent = debt('rincianTotal', {
      nilai: formatRupiah(party?.totalBalance ?? existing?.total ?? 0),
    });
    paintTable();
  };

  function paintTable(): void {
    if (readOnly) {
      const rows = existing.allocations;
      if (rows.length === 0) {
        tableBody.replaceChildren(
          el(
            'tr',
            {},
            el('td', {
              className: 'bo-debt-empty',
              text: DEBT_TEXT.rincianTidakTercatat,
              attrs: { colspan: '6' },
            }),
          ),
        );
      } else {
        tableBody.replaceChildren(
          ...rows.map((item, index) =>
            el(
              'tr',
              {},
              el('td', { className: 'is-center', text: String(index + 1) }),
              el('td', {}, el('strong', { className: 'bo-trx-link', text: item.invoiceNumber })),
              el('td', { text: '-' }),
              el('td', { className: 'is-end', text: '-' }),
              el('td', { className: 'is-end', text: '-' }),
              el('td', { className: 'is-end is-bold', text: formatRupiah(item.amount) }),
            ),
          ),
        );
      }
      paintTotal();
      return;
    }
    if (invoices.length === 0) {
      tableBody.replaceChildren(
        el(
          'tr',
          {},
          el('td', {
            className: 'bo-debt-empty',
            text: DEBT_TEXT.bayarKosong,
            attrs: { colspan: '6' },
          }),
        ),
      );
      paintTotal();
      return;
    }
    tableBody.replaceChildren(
      ...invoices.map((invoice, index) => {
        const input = el('input', {
          className: 'input bo-debt-money',
          attrs: {
            type: 'text',
            inputmode: 'numeric',
            autocomplete: 'off',
            'aria-label': `${DEBT_TEXT.kolomPembayaran} ${invoice.invoiceNumber}`,
            'data-invoice': invoice.invoiceNumber,
          },
        });
        input.value =
          (allocations[invoice.invoiceNumber] ?? 0) > 0
            ? moneyText(allocations[invoice.invoiceNumber] ?? 0)
            : '';
        input.addEventListener('input', () => {
          const value = parseMoney(input.value) ?? 0;
          allocations[invoice.invoiceNumber] = Math.min(invoice.remaining, value);
          input.removeAttribute('aria-invalid');
          error.textContent = '';
          nominalInput.value =
            sumAllocations(allocations) > 0 ? moneyText(sumAllocations(allocations)) : '';
          paintTotal();
        });
        input.addEventListener('blur', () => {
          const value = allocations[invoice.invoiceNumber] ?? 0;
          input.value = value > 0 ? moneyText(value) : '';
        });
        return el(
          'tr',
          {},
          el('td', { className: 'is-center', text: String(index + 1) }),
          el('td', {}, el('strong', { className: 'bo-trx-link', text: invoice.invoiceNumber })),
          el('td', { className: 'bo-nowrap', text: invoice.date }),
          el('td', { className: 'is-end', text: formatRupiah(invoice.amount) }),
          el('td', { className: 'is-end is-bold', text: formatRupiah(invoice.remaining) }),
          el('td', { className: 'is-end' }, input),
        );
      }),
    );
    paintTotal();
  }

  const applyNominal = (): void => {
    if (readOnly || invoices.length === 0) {
      return;
    }
    const nominal = parseMoney(nominalInput.value) ?? 0;
    allocations = distribute(invoices, nominal);
    nominalInput.value =
      sumAllocations(allocations) > 0 ? moneyText(sumAllocations(allocations)) : '';
    error.textContent = '';
    paintTable();
  };

  partySelect.addEventListener('change', () => {
    partyId = partySelect.value;
    nominalInput.value = '';
    error.textContent = '';
    loadInvoices();
  });
  nominalInput.addEventListener('change', applyNominal);
  nominalInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      applyNominal();
    }
  });
  spread.addEventListener('click', applyNominal);

  const draft = (): Parameters<BoSession['saveDebtPayment']>[0] => ({
    type,
    date: dateInput.value,
    partyId,
    note: noteInput.value,
    method: methodSelect.value as PayMethod,
    account: accountSelect.value,
    allocations,
  });

  const partyName = (): string =>
    existing?.partyName ?? parties().find((party) => party.partyId === partyId)?.name ?? '-';

  const openReceipt = (): void => {
    const current: DebtPayment | undefined = existing;
    const total = current?.total ?? sumAllocations(allocations);
    if (total <= 0) {
      showToast({ kind: 'info', text: DEBT_TEXT.isiNominal });
      return;
    }
    const profile = DEFAULT_STORE_PROFILE;
    const body = el(
      'div',
      { className: 'bo-print-modal-content' },
      el(
        'div',
        { className: 'bo-doc-header' },
        el('h2', { className: 'bo-doc-title', text: copy.kuitansiJudul }),
        el('p', { className: 't-label', text: profile.name }),
        el('p', {
          className: 't-label',
          text:
            current === undefined
              ? DEBT_TEXT.kuitansiDraf
              : debt('kuitansiNomor', { nomor: current.number }),
        }),
      ),
      el('hr', {}),
      el(
        'p',
        {},
        el('strong', {
          text: `${type === 'pelanggan' ? DEBT_TEXT.sudahTerimaDari : DEBT_TEXT.sudahBayarKepada}: `,
        }),
        el('span', { text: partyName() }),
      ),
      el(
        'p',
        {},
        el('strong', { text: `${DEBT_TEXT.uangSejumlah}: ` }),
        el('span', { className: 'is-bold', text: formatRupiah(total) }),
      ),
      el(
        'p',
        {},
        el('strong', { text: `${DEBT_TEXT.untukPembayaranLabel}: ` }),
        el('span', {
          text: noteInput.value.trim() === '' ? copy.untukPembayaran : noteInput.value.trim(),
        }),
      ),
      el(
        'p',
        { className: 't-label' },
        `${methodText(methodSelect.value as PayMethod)} | ${accountSelect.value} | ${dateInput.value}`,
      ),
      el(
        'div',
        { className: 'bo-signature-grid' },
        el('div', {}),
        el(
          'div',
          { className: 'bo-sig-box' },
          el('span', { className: 'bo-sig-box__role', text: DEBT_TEXT.ttdPetugas }),
          el('div', { className: 'bo-sig-box__line' }),
          el('span', {
            className: 'bo-sig-box__name',
            text: existing === undefined ? profile.name : userName(store, existing.userId),
          }),
        ),
      ),
    );
    openModal({
      title: copy.kuitansiJudul,
      body,
      actions: [
        {
          text: DEBT_TEXT.cetakKuitansi,
          variant: 'primary',
          icon: 'printer',
          onClick: () => {
            window.print();
          },
        },
        { text: DEBT_TEXT.tutup, variant: 'secondary' },
      ],
    });
  };

  const save = (): void => {
    if (!store.getState().online) {
      return;
    }
    const result = session.saveDebtPayment(draft());
    if (result.ok) {
      showToast({
        kind: 'success',
        text: debt('tersimpan', { nomor: result.number, nilai: formatRupiah(result.total) }),
      });
      go(PAYMENT_PATH[type]);
      return;
    }
    if ('denied' in result) {
      error.textContent = DEBT_TEXT.tidakBerhak;
      return;
    }
    const messages = {
      pihak: DEBT_TEXT.isiPihak,
      tanggal: DEBT_TEXT.isiTanggal,
      nominal: DEBT_TEXT.isiNominal,
      lebih: debt('lebihSisa', { faktur: result.invoiceNumber ?? '' }),
    } as const;
    error.textContent = messages[result.issue];
    if (result.invoiceNumber !== undefined) {
      document
        .querySelector<HTMLElement>(`[data-invoice="${result.invoiceNumber}"]`)
        ?.setAttribute('aria-invalid', 'true');
    }
  };

  const saveButton = createButton({
    text: DEBT_TEXT.simpan,
    variant: 'secondary',
    icon: 'save',
    onClick: save,
  });
  saveButton.disabled = readOnly;
  const back = createButton({
    text: DEBT_TEXT.tutup,
    variant: 'secondary',
    icon: 'arrow-left',
    onClick: () => {
      go(PAYMENT_PATH[type]);
    },
  });

  const element = el(
    'div',
    { className: 'bo-debt bo-debt--form' },
    el(
      'section',
      { className: 'bo-debt-head' },
      el('h1', { className: 'bo-debt-head__title', text: copy.formJudul }),
      el(
        'div',
        { className: 'bo-debt-head__actions' },
        saveButton,
        createButton({
          text: DEBT_TEXT.cetak,
          variant: 'secondary',
          icon: 'printer',
          onClick: openReceipt,
        }),
        back,
      ),
    ),
    el(
      'div',
      { className: 'bo-debt-form' },
      el(
        'section',
        { className: 'bo-debt-card bo-debt-card--fields' },
        row(DEBT_TEXT.tanggal, dateInput, dateId),
        row(copy.saldoPihak, wrapSelect(partySelect), partyIdAttr),
        row(DEBT_TEXT.keterangan, noteInput, noteId),
        el('hr', { className: 'bo-debt-sep' }),
        row(DEBT_TEXT.caraBayar, wrapSelect(methodSelect), methodId),
        row(DEBT_TEXT.kasBank, wrapSelect(accountSelect), accountId),
        row(
          DEBT_TEXT.nominal,
          el('div', { className: 'bo-debt-nominal' }, nominalInput, spread),
          nominalId,
        ),
        error,
        readOnly ? el('p', { className: 'bo-debt-note', text: DEBT_TEXT.bayarTerkunci }) : '',
      ),
      el(
        'section',
        { className: 'bo-debt-card bo-debt-card--lines' },
        el(
          'div',
          { className: 'bo-debt-card__head' },
          el('h2', { className: 'bo-debt-card__title', text: DEBT_TEXT.rincianFaktur }),
          totalPill,
        ),
        el(
          'div',
          {
            className: 'bo-debt-scroll',
            attrs: { tabindex: '0', role: 'region', 'aria-label': DEBT_TEXT.rincianFaktur },
          },
          el(
            'table',
            { className: 'bo-debt-table' },
            el(
              'thead',
              {},
              el(
                'tr',
                {},
                el('th', { className: 'is-center', text: DEBT_TEXT.kolomNo }),
                el('th', { text: DEBT_TEXT.kolomFaktur }),
                el('th', { text: DEBT_TEXT.kolomTglFaktur }),
                el('th', { className: 'is-end', text: DEBT_TEXT.kolomTotalFaktur }),
                el('th', { className: 'is-end', text: DEBT_TEXT.kolomSisaFaktur }),
                el('th', { className: 'is-end', text: DEBT_TEXT.kolomPembayaran }),
              ),
            ),
            tableBody,
          ),
        ),
        el(
          'div',
          { className: 'bo-debt-total' },
          el('span', { className: 'bo-debt-total__label', text: DEBT_TEXT.totalBayar }),
          payOut,
        ),
      ),
    ),
  );

  loadInvoices();
  return { element, destroy: () => undefined };
}
