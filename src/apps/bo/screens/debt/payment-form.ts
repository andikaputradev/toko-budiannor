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
  type DebtPaymentDraft,
  type DebtPaymentPart,
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
import { ensurePayments, recordPayment } from './ledger';
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
      : ensurePayments(session).find((payment) => payment.number === options.number);
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
  // Pembayaran Split tercatat menampilkan nominal bagian pertama; total ada di Total Bayar.
  nominalInput.value =
    existing === undefined ? '' : moneyText(existing.parts?.[0]?.amount ?? existing.total);
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

  // --- Split (revisi tambahan): centang untuk membayar dengan dua cara, mis. tunai 75.000 dan
  // transfer 25.000 untuk bayar 100.000. Bagian kedua punya Cara Bayar, Kas / Bank, dan Nominal sendiri.
  const second = existing?.parts?.[1];
  let splitOn = second !== undefined;
  let firstTouched = false;
  let secondTouched = false;
  const splitId = fieldId();
  const splitCheck = el('input', {
    className: 'bo-debt-split__check',
    attrs: { id: splitId, type: 'checkbox' },
  });
  splitCheck.checked = splitOn;
  splitCheck.disabled = readOnly;
  const splitRow = el(
    'div',
    { className: 'bo-debt-split' },
    el('label', {
      className: 'bo-debt-split__label',
      text: DEBT_TEXT.split,
      attrs: { for: splitId },
    }),
    splitCheck,
  );
  const method2Id = fieldId();
  const method2 = selectBox(
    method2Id,
    [{ value: '', text: '' }, ...PAY_METHODS.map((m) => ({ value: m.value, text: m.text }))],
    second?.method ?? '',
  );
  const account2Id = fieldId();
  const account2 = selectBox(
    account2Id,
    [
      { value: '', text: '' },
      ...CASH_ACCOUNTS.map((account) => ({ value: account, text: account })),
    ],
    second?.account ?? '',
  );
  const nominal2Id = fieldId();
  const nominal2 = el('input', {
    className: 'input bo-debt-money',
    attrs: { id: nominal2Id, type: 'text', inputmode: 'numeric', autocomplete: 'off' },
  });
  nominal2.value = second === undefined ? '' : moneyText(second.amount);
  const splitGroup = el(
    'div',
    {
      className: 'bo-debt-splitgroup',
      attrs: { role: 'group', 'aria-label': DEBT_TEXT.splitGrup },
    },
    row(DEBT_TEXT.caraBayar, wrapSelect(method2), method2Id),
    row(DEBT_TEXT.kasBank, wrapSelect(account2), account2Id),
    row(DEBT_TEXT.nominal, nominal2, nominal2Id),
  );
  const setSplitEnabled = (on: boolean): void => {
    method2.disabled = readOnly || !on;
    account2.disabled = readOnly || !on;
    nominal2.disabled = readOnly || !on;
    splitGroup.classList.toggle('is-off', !on);
  };
  setSplitEnabled(splitOn);

  const money = (input: HTMLInputElement): number => parseMoney(input.value) ?? 0;
  const setMoney = (input: HTMLInputElement, value: number): void => {
    input.value = value > 0 ? moneyText(value) : '';
  };

  const paintTotal = (): void => {
    const total = readOnly ? existing.total : sumAllocations(allocations);
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
          if (splitOn) {
            syncSplit('tabel');
          } else {
            setMoney(nominalInput, sumAllocations(allocations));
          }
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

  const redistribute = (nominal: number): void => {
    allocations = distribute(invoices, nominal);
    error.textContent = '';
    paintTable();
  };

  // Menjaga jumlah kedua bagian Split sama dengan Total Bayar (jumlah Pembayaran per faktur).
  // 'tabel': Pembayaran per faktur berubah; 'pertama' dan 'kedua': salah satu Nominal diketik. Selama
  // Nominal lain belum diketik sendiri dan Total Bayar sudah ada, mengetik satu Nominal mengisi sisanya
  // ke Nominal lain tanpa mengubah total (tunai 75.000 menyisakan transfer 25.000 dari total 100.000).
  // Sesudah keduanya diketik, total = Nominal pertama + Nominal kedua dan dibagi ke faktur terlama.
  function syncSplit(source: 'tabel' | 'pertama' | 'kedua'): void {
    const total = sumAllocations(allocations);
    const first = money(nominalInput);
    if (source === 'tabel') {
      const keep = first > 0 && first <= total ? first : total;
      setMoney(nominalInput, keep);
      setMoney(nominal2, total - keep);
      return;
    }
    const typed = source === 'pertama' ? first : money(nominal2);
    const other = source === 'pertama' ? secondTouched : firstTouched;
    if (source === 'pertama') {
      firstTouched = true;
    } else {
      secondTouched = true;
    }
    if (!other && total > 0 && typed <= total) {
      setMoney(nominalInput, source === 'pertama' ? typed : total - typed);
      setMoney(nominal2, source === 'pertama' ? total - typed : typed);
      return;
    }
    redistribute(first + money(nominal2));
    const got = sumAllocations(allocations);
    // Bila melebihi sisa faktur, bagian kedua dikurangi lebih dulu.
    const keepFirst = Math.min(first, got);
    setMoney(nominalInput, keepFirst);
    setMoney(nominal2, got - keepFirst);
  }

  const applyNominal = (): void => {
    if (readOnly || invoices.length === 0) {
      return;
    }
    if (splitOn) {
      syncSplit('pertama');
      return;
    }
    redistribute(money(nominalInput));
    setMoney(nominalInput, sumAllocations(allocations));
  };
  const applySecond = (): void => {
    if (!readOnly && splitOn && invoices.length > 0) {
      syncSplit('kedua');
    }
  };

  partySelect.addEventListener('change', () => {
    partyId = partySelect.value;
    nominalInput.value = '';
    nominal2.value = '';
    firstTouched = false;
    secondTouched = false;
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
  // Tanda galat pada bagian kedua hilang begitu isiannya diubah.
  for (const control of [method2, account2, nominal2]) {
    control.addEventListener('change', () => {
      control.removeAttribute('aria-invalid');
    });
  }
  nominal2.addEventListener('change', applySecond);
  nominal2.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      applySecond();
    }
  });
  // Tombol bagi otomatis membagi ulang jumlah kedua Nominal ke faktur terlama.
  spread.addEventListener('click', () => {
    if (splitOn) {
      firstTouched = true;
      secondTouched = true;
      applySecond();
    } else {
      applyNominal();
    }
  });
  splitCheck.addEventListener('change', () => {
    splitOn = splitCheck.checked;
    firstTouched = false;
    secondTouched = false;
    setSplitEnabled(splitOn);
    if (!splitOn) {
      method2.value = '';
      account2.value = '';
    }
    for (const control of [method2, account2, nominal2]) {
      control.removeAttribute('aria-invalid');
    }
    // Nominal pertama memegang seluruh total sampai Nominal kedua diisi.
    setMoney(nominalInput, sumAllocations(allocations));
    nominal2.value = '';
    error.textContent = '';
    if (splitOn) {
      method2.focus();
    }
  });

  const draft = (): DebtPaymentDraft => ({
    type,
    date: dateInput.value,
    partyId,
    note: noteInput.value,
    method: methodSelect.value as PayMethod,
    account: accountSelect.value,
    allocations,
    split: splitOn
      ? {
          method: method2.value as PayMethod | '',
          account: account2.value,
          firstAmount: money(nominalInput),
          amount: money(nominal2),
        }
      : undefined,
  });

  const partyName = (): string =>
    existing?.partyName ?? parties().find((party) => party.partyId === partyId)?.name ?? '-';

  // Rincian cara bayar pada kuitansi: satu bagian, atau dua bagian dengan nominalnya bila Split.
  const methodLine = (): string => {
    const parts: readonly DebtPaymentPart[] =
      existing?.parts ??
      (splitOn && method2.value !== ''
        ? [
            {
              method: methodSelect.value as PayMethod,
              account: accountSelect.value,
              amount: money(nominalInput),
            },
            {
              method: method2.value as PayMethod,
              account: account2.value,
              amount: money(nominal2),
            },
          ]
        : []);
    if (parts.length < 2) {
      return `${methodText(methodSelect.value as PayMethod)} | ${accountSelect.value} | ${dateInput.value}`;
    }
    return `${parts
      .map((part) => `${methodText(part.method)} ${formatRupiah(part.amount)} | ${part.account}`)
      .join(' + ')} | ${dateInput.value}`;
  };

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
      el('p', { className: 't-label' }, methodLine()),
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
    const result = recordPayment(session, draft());
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
      splitCara: DEBT_TEXT.splitCara,
      splitJumlah: DEBT_TEXT.splitJumlah,
    } as const;
    error.textContent = messages[result.issue];
    if (result.issue === 'splitCara') {
      method2.setAttribute('aria-invalid', 'true');
      account2.setAttribute('aria-invalid', 'true');
    }
    if (result.issue === 'splitJumlah') {
      nominal2.setAttribute('aria-invalid', 'true');
    }
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
        splitRow,
        splitGroup,
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
