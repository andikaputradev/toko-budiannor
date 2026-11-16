import { matchesPhrase } from '../../../../shared/data/search-index';
import '../../../../styles/bo-hutang.css';
import { el } from '../../../../shared/dom';
import { icon } from '../../../../shared/icons';
import { formatRupiah } from '../../../../shared/format';
import { createButton } from '../../../../shared/ui/button';
import { openModal } from '../../../../shared/ui/modal';
import { showToast } from '../../../../shared/ui/toast';
import type { BoSession } from '../../bo-session';
import {
  buildWhatsAppBillStatement,
  getPayableBalances,
  getReceivableBalances,
  getUnpaidInvoicesForParty,
  type PartyBalance,
  type PartyType,
  type UnpaidInvoice,
} from '../../domain/receivable-payable';
import { generateWhatsAppUrl } from '../../domain/sales-transaction';
import { DEFAULT_STORE_PROFILE } from '../../domain/settings-rbac';
import type { ScreenHandle } from '../login';
import { DEBT_COPY, DEBT_TEXT, debt } from './text';

// Halaman Saldo Piutang atau Saldo Hutang (gambar klien 21): daftar saldo di kiri, rincian faktur
// dengan kotak centang Cetak di kanan, dan laporan penagihan yang dicetak dari faktur bertanda.
export function renderDebtSaldo(session: BoSession, type: PartyType): ScreenHandle {
  const store = session.store;
  const copy = DEBT_COPY[type];
  let parties: PartyBalance[] = [];
  let selectedId: string | undefined;
  let invoices: UnpaidInvoice[] = [];
  // Semua faktur terbuka per nomor, supaya jumlah faktur bertanda dapat dihitung lintas pihak.
  let openByNumber = new Map<string, { party: PartyBalance; invoice: UnpaidInvoice }>();
  const marks = new Set(session.state().collectionMarks[type]);

  const totalOut = el('strong', { className: 'bo-debt-kpi__value', text: 'Rp 0' });
  const overdueOut = el('strong', {
    className: 'bo-debt-kpi__value is-danger',
    text: 'Rp 0',
  });
  const printedOut = el('strong', { className: 'bo-debt-kpi__value', text: 'Rp 0' });
  const search = el('input', {
    className: 'input',
    attrs: {
      type: 'search',
      autocomplete: 'off',
      placeholder: copy.cariPihak,
      'aria-label': copy.cariPihak,
    },
  });
  const partyBody = el('tbody', {});
  const invoiceBody = el('tbody', {});
  const detailTitle = el('h2', { className: 'bo-debt-card__title', text: copy.rincianJudul });
  const detailTotal = el('span', {
    className: 'bo-debt-pill',
    text: debt('rincianTotal', { nilai: 'Rp 0' }),
  });

  const scan = (): void => {
    const data = store.getState().data;
    parties = type === 'pelanggan' ? getReceivableBalances(data) : getPayableBalances(data);
    parties = parties.filter((party) => party.totalBalance > 0);
    openByNumber = new Map();
    for (const party of parties) {
      for (const invoice of getUnpaidInvoicesForParty(party.partyId, type, data)) {
        openByNumber.set(invoice.invoiceNumber, { party, invoice });
      }
    }
    for (const number of [...marks]) {
      if (!openByNumber.has(number)) {
        marks.delete(number);
      }
    }
  };

  const markedTotal = (): number =>
    [...marks].reduce((sum, number) => sum + (openByNumber.get(number)?.invoice.remaining ?? 0), 0);

  const paintTotals = (): void => {
    totalOut.textContent = formatRupiah(
      parties.reduce((sum, party) => sum + party.totalBalance, 0),
    );
    overdueOut.textContent = formatRupiah(
      parties.reduce((sum, party) => sum + party.overdueBalance, 0),
    );
    printedOut.textContent = formatRupiah(markedTotal());
  };

  const paintInvoices = (): void => {
    const party = parties.find((item) => item.partyId === selectedId);
    if (party === undefined) {
      detailTitle.textContent = copy.rincianJudul;
      detailTotal.textContent = debt('rincianTotal', { nilai: formatRupiah(0) });
      invoiceBody.replaceChildren(
        el(
          'tr',
          {},
          el('td', {
            className: 'bo-debt-empty',
            text: DEBT_TEXT.fakturKosong,
            attrs: { colspan: '7' },
          }),
        ),
      );
      return;
    }
    detailTitle.textContent = `${copy.rincianJudul}: ${party.name}`;
    detailTotal.textContent = debt('rincianTotal', { nilai: formatRupiah(party.totalBalance) });
    if (invoices.length === 0) {
      invoiceBody.replaceChildren(
        el(
          'tr',
          {},
          el('td', {
            className: 'bo-debt-empty',
            text: DEBT_TEXT.fakturLunas,
            attrs: { colspan: '7' },
          }),
        ),
      );
      return;
    }
    invoiceBody.replaceChildren(
      ...invoices.map((invoice, index) => {
        const box = el('input', {
          attrs: {
            type: 'checkbox',
            'aria-label': `${DEBT_TEXT.kolomCetak} ${invoice.invoiceNumber}`,
          },
        });
        box.checked = marks.has(invoice.invoiceNumber);
        box.addEventListener('change', () => {
          if (box.checked) {
            marks.add(invoice.invoiceNumber);
          } else {
            marks.delete(invoice.invoiceNumber);
          }
          paintTotals();
        });
        return el(
          'tr',
          {},
          el('td', { className: 'is-center' }, box),
          el('td', { className: 'is-center', text: String(index + 1) }),
          el('td', {}, el('strong', { className: 'bo-trx-link', text: invoice.invoiceNumber })),
          el('td', { className: 'bo-nowrap', text: invoice.date }),
          el('td', { className: 'bo-nowrap', text: invoice.dueDate }),
          el('td', { className: 'is-end', text: formatRupiah(invoice.amount) }),
          el(
            'td',
            { className: 'is-end is-bold' },
            invoice.isOverdue
              ? el('span', {
                  className: 'bo-debt-late',
                  text: DEBT_TEXT.statusJatuhTempo,
                })
              : '',
            ` ${formatRupiah(invoice.remaining)}`,
          ),
        );
      }),
    );
  };

  const select = (partyId: string | undefined): void => {
    selectedId = partyId;
    invoices =
      partyId === undefined ? [] : getUnpaidInvoicesForParty(partyId, type, store.getState().data);
    paintParties();
    paintInvoices();
  };

  const paintParties = (): void => {
    const shown = parties.filter((party) =>
      matchesPhrase(`${party.name} ${party.phone}`, search.value),
    );
    if (shown.length === 0) {
      partyBody.replaceChildren(
        el(
          'tr',
          {},
          el('td', {
            className: 'bo-debt-empty',
            text: DEBT_TEXT.pihakKosong,
            attrs: { colspan: '3' },
          }),
        ),
      );
      return;
    }
    partyBody.replaceChildren(
      ...shown.map((party) => {
        const active = party.partyId === selectedId;
        const open = el('button', {
          className: 'bo-debt-party',
          attrs: { type: 'button', 'aria-pressed': active ? 'true' : 'false' },
        });
        open.append(
          el('strong', { text: party.name }),
          el('span', {
            className: 'bo-debt-party__meta',
            text: `${debt('fakturJumlah', { jumlah: String(party.invoicesCount) })} | ${party.phone}`,
          }),
        );
        open.addEventListener('click', () => {
          select(party.partyId);
        });
        return el(
          'tr',
          { className: active ? 'is-selected' : '' },
          el('td', {}, open),
          el('td', { className: 'is-end is-bold', text: formatRupiah(party.totalBalance) }),
          el(
            'td',
            { className: 'is-center' },
            el('span', {
              className: `bo-debt-status ${party.overdueBalance > 0 ? 'is-danger' : 'is-warning'}`,
              text:
                party.overdueBalance > 0 ? DEBT_TEXT.statusJatuhTempo : DEBT_TEXT.statusBelumLunas,
            }),
          ),
        );
      }),
    );
  };

  const reportRows = (): { party: PartyBalance; invoice: UnpaidInvoice }[] =>
    [...marks]
      .flatMap((number) => {
        const entry = openByNumber.get(number);
        return entry === undefined ? [] : [entry];
      })
      .sort(
        (a, b) =>
          a.party.name.localeCompare(b.party.name, 'id') ||
          a.invoice.date.localeCompare(b.invoice.date),
      );

  const openReport = (): void => {
    const rows = reportRows();
    if (rows.length === 0) {
      showToast({ kind: 'info', text: DEBT_TEXT.tandaiKosong });
      return;
    }
    const total = rows.reduce((sum, row) => sum + row.invoice.remaining, 0);
    const profile = DEFAULT_STORE_PROFILE;
    const body = el(
      'div',
      { className: 'bo-print-modal-content bo-debt-report' },
      el(
        'div',
        { className: 'bo-doc-header' },
        el('h2', {
          className: 'bo-doc-title',
          text: type === 'pelanggan' ? DEBT_TEXT.laporanPenagihan : DEBT_TEXT.laporanPembayaran,
        }),
        el('p', { className: 't-label', text: profile.name }),
        el('p', {
          className: 't-label',
          text: debt('laporanTanggal', {
            tanggal: store.getState().data.referenceDate.slice(0, 10),
          }),
        }),
      ),
      el(
        'table',
        { className: 'pos-table is-compact' },
        el(
          'thead',
          {},
          el(
            'tr',
            {},
            el('th', { text: 'No' }),
            el('th', { text: copy.kolomPihak }),
            el('th', { text: DEBT_TEXT.kolomFaktur }),
            el('th', { text: DEBT_TEXT.kolomTglFaktur }),
            el('th', { text: DEBT_TEXT.kolomJatuhTempo }),
            el('th', { className: 'is-end', text: DEBT_TEXT.kolomSisaBayar }),
          ),
        ),
        el(
          'tbody',
          {},
          ...rows.map((row, index) =>
            el(
              'tr',
              {},
              el('td', { text: String(index + 1) }),
              el('td', { text: row.party.name }),
              el('td', { text: row.invoice.invoiceNumber }),
              el('td', { text: row.invoice.date }),
              el('td', { text: row.invoice.dueDate }),
              el('td', { className: 'is-end', text: formatRupiah(row.invoice.remaining) }),
            ),
          ),
        ),
      ),
      el(
        'p',
        { className: 'bo-debt-report__total' },
        el('strong', {
          text: `${type === 'pelanggan' ? DEBT_TEXT.laporanTotal : DEBT_TEXT.laporanPembayaranTotal}: ${formatRupiah(total)}`,
        }),
      ),
      el(
        'div',
        { className: 'bo-signature-grid' },
        el(
          'div',
          { className: 'bo-sig-box' },
          el('span', { className: 'bo-sig-box__role', text: DEBT_TEXT.ttdPenerima }),
          el('div', { className: 'bo-sig-box__line' }),
        ),
        el(
          'div',
          { className: 'bo-sig-box' },
          el('span', { className: 'bo-sig-box__role', text: DEBT_TEXT.ttdPetugas }),
          el('div', { className: 'bo-sig-box__line' }),
        ),
      ),
    );
    openModal({
      title: type === 'pelanggan' ? DEBT_TEXT.laporanPenagihan : DEBT_TEXT.laporanPembayaran,
      body,
      actions: [
        {
          text: DEBT_TEXT.cetak,
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

  const sendWa = (): void => {
    const party = parties.find((item) => item.partyId === selectedId);
    if (party === undefined) {
      showToast({ kind: 'info', text: DEBT_TEXT.pilihPihakDulu });
      return;
    }
    const marked = invoices.filter((invoice) => marks.has(invoice.invoiceNumber));
    const message = buildWhatsAppBillStatement(
      party,
      marked.length > 0 ? marked : invoices,
      profileName(),
      type,
    );
    window.open(generateWhatsAppUrl(party.phone, message), '_blank');
    showToast({ kind: 'info', text: DEBT_TEXT.waDibuka });
  };

  const profileName = (): string => DEFAULT_STORE_PROFILE.name;

  const save = createButton({
    text: DEBT_TEXT.simpan,
    variant: 'secondary',
    icon: 'save',
    onClick: () => {
      session.saveCollectionMarks(type, [...marks]);
      showToast({ kind: 'success', text: DEBT_TEXT.tandaiTersimpan });
    },
  });
  const print = createButton({
    text: DEBT_TEXT.cetak,
    variant: 'secondary',
    icon: 'printer',
    onClick: openReport,
  });
  const wa = createButton({
    text: DEBT_TEXT.kirimWa,
    variant: 'secondary',
    icon: 'send',
    onClick: sendWa,
  });

  search.addEventListener('input', paintParties);
  const kpi = (labelText: string, value: HTMLElement): HTMLElement =>
    el(
      'div',
      { className: 'bo-debt-kpi' },
      el('span', { className: 'bo-debt-kpi__label', text: labelText }),
      value,
    );

  const element = el(
    'div',
    { className: 'bo-debt bo-debt--saldo' },
    el(
      'section',
      { className: 'bo-debt-head' },
      el('h1', { className: 'bo-debt-head__title', text: copy.saldoJudul }),
      el('div', { className: 'bo-debt-head__actions' }, save, print, wa),
    ),
    el(
      'div',
      { className: 'bo-debt-kpis' },
      kpi(copy.saldoTotal, totalOut),
      kpi(DEBT_TEXT.totalJatuhTempo, overdueOut),
      kpi(DEBT_TEXT.totalDicetak, printedOut),
      el(
        'p',
        { className: 'bo-debt-hint' },
        icon('info'),
        el('span', { text: copy.petunjukCentang }),
      ),
    ),
    el(
      'div',
      { className: 'bo-debt-main' },
      el(
        'section',
        { className: 'bo-debt-card bo-debt-card--list' },
        el('h2', { className: 'bo-debt-card__title', text: DEBT_TEXT.daftarSaldo }),
        el('div', { className: 'bo-debt-search' }, search),
        el(
          'div',
          {
            className: 'bo-debt-scroll',
            attrs: { tabindex: '0', role: 'region', 'aria-label': DEBT_TEXT.daftarSaldo },
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
                el('th', { text: DEBT_TEXT.kolomNama }),
                el('th', { className: 'is-end', text: DEBT_TEXT.kolomSaldo }),
                el('th', { className: 'is-center', text: DEBT_TEXT.kolomStatus }),
              ),
            ),
            partyBody,
          ),
        ),
      ),
      el(
        'section',
        { className: 'bo-debt-card bo-debt-card--detail' },
        el('div', { className: 'bo-debt-card__head' }, detailTitle, detailTotal),
        el(
          'div',
          {
            className: 'bo-debt-scroll',
            attrs: { tabindex: '0', role: 'region', 'aria-label': copy.rincianJudul },
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
                el('th', { className: 'is-center', text: DEBT_TEXT.kolomCetak }),
                el('th', { className: 'is-center', text: DEBT_TEXT.kolomNo }),
                el('th', { text: DEBT_TEXT.kolomFaktur }),
                el('th', { text: DEBT_TEXT.kolomTglFaktur }),
                el('th', { text: DEBT_TEXT.kolomJatuhTempo }),
                el('th', { className: 'is-end', text: DEBT_TEXT.kolomNilaiFaktur }),
                el('th', { className: 'is-end', text: DEBT_TEXT.kolomSisaBayar }),
              ),
            ),
            invoiceBody,
          ),
        ),
      ),
    ),
  );

  scan();
  paintTotals();
  select(parties[0]?.partyId);
  // Pembayaran yang dicatat di tab lain mengubah saldo; tab ini ikut dimuat ulang tanpa kehilangan pilihan.
  const stop = session.subscribe(() => {
    scan();
    paintTotals();
    select(
      parties.some((party) => party.partyId === selectedId) ? selectedId : parties[0]?.partyId,
    );
  });
  return { element, destroy: stop };
}
