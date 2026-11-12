import { el } from '../../../shared/dom';
import { formatRupiah } from '../../../shared/format';
import { label } from '../../../shared/messages';
import { createButton } from '../../../shared/ui/button';
import { openModal } from '../../../shared/ui/modal';
import { showToast } from '../../../shared/ui/toast';
import type { BoSession } from '../bo-session';
import type { ScreenHandle } from './login';
import {
  getReceivableBalances,
  getPayableBalances,
  getUnpaidInvoicesForParty,
  allocatePaymentFifo,
  buildWhatsAppBillStatement,
  generatePaymentReceiptNumber,
  type PartyBalance,
  type PartyType,
  type UnpaidInvoice,
} from '../domain/receivable-payable';
import { generateWhatsAppUrl } from '../domain/sales-transaction';

export function renderReceivablePayable(
  session: BoSession,
  _go: (path: string) => void,
  initialTab: PartyType = 'pelanggan',
): ScreenHandle {
  const store = session.store;
  let dataset = store.getState().data;

  let activeTab: PartyType = initialTab;
  let parties: PartyBalance[] = [];
  let selectedPartyId: string | undefined;
  let unpaidInvoices: UnpaidInvoice[] = [];
  let paymentAllocations: Record<string, number> = {};

  // Form Bayar State
  const paymentDate = dataset.referenceDate.slice(0, 10);

  // Root container
  const container = el('div', { className: 'bo-form-page' });

  // Tab buttons
  const tabPiutangBtn = el('button', {
    className: `bo-tab-btn ${activeTab === 'pelanggan' ? 'is-active' : ''}`,
    attrs: { type: 'button' },
    text: label('tabSaldoPiutang'),
  });

  const tabHutangBtn = el('button', {
    className: `bo-tab-btn ${activeTab === 'pemasok' ? 'is-active' : ''}`,
    attrs: { type: 'button' },
    text: label('tabSaldoHutang'),
  });

  // Search input
  const searchInput = el('input', {
    className: 'input is-search',
    attrs: { type: 'search', placeholder: 'Cari Nama Pelanggan / Pemasok...' },
  });

  // Metric pills
  const totalBalanceBadge = el('span', { className: 'bo-stat-card__val', text: 'Rp 0' });
  const totalOverdueBadge = el('span', { className: 'bo-stat-card__val is-danger', text: 'Rp 0' });

  // Panels
  const leftPartyListTbody = el('tbody', {});
  const rightInvoicesTbody = el('tbody', {});
  const rightTitleEl = el('h3', {
    className: 'bo-form-sec-title',
    text: label('labelRincianTagihanHeader'),
  });
  const rightTotalTagihanEl = el('span', {
    className: 'bo-stat-pill is-primary',
    text: 'Total: Rp 0',
  });

  // Form Bayar Elements
  const payDateInput = el('input', {
    className: 'input',
    attrs: { type: 'date', value: paymentDate },
  });
  const payMethodSelect = el('select', { className: 'input is-select' });
  [
    { value: 'kas', text: label('labelMetodeKas') },
    { value: 'transfer', text: label('labelMetodeTransfer') },
    { value: 'giro', text: label('labelMetodeGiro') },
    { value: 'deposit', text: label('labelMetodeDeposit') },
  ].forEach((m) => {
    payMethodSelect.appendChild(el('option', { text: m.text, attrs: { value: m.value } }));
  });
  const payNoteInput = el('input', {
    className: 'input',
    attrs: { type: 'text', placeholder: 'Keterangan pembayaran / no transfer...' },
  });
  const payAmountInput = el('input', {
    className: 'input is-num',
    attrs: { type: 'number', min: '0', value: '0' },
  });
  const allocTableTbody = el('tbody', {});
  const sisaSaldoEl = el('span', { className: 'bo-grand-total__value', text: 'Rp 0' });

  function loadParties(): void {
    dataset = store.getState().data;
    parties =
      activeTab === 'pelanggan' ? getReceivableBalances(dataset) : getPayableBalances(dataset);

    const totalBal = parties.reduce((s, p) => s + p.totalBalance, 0);
    const totalOverdue = parties.reduce((s, p) => s + p.overdueBalance, 0);

    totalBalanceBadge.textContent = formatRupiah(totalBal);
    totalOverdueBadge.textContent = formatRupiah(totalOverdue);

    // Filter search
    const q = searchInput.value.trim().toLowerCase();
    const filteredParties = q
      ? parties.filter((p) => p.name.toLowerCase().includes(q) || p.phone.includes(q))
      : parties;

    if (!selectedPartyId || !filteredParties.some((p) => p.partyId === selectedPartyId)) {
      selectedPartyId = filteredParties[0]?.partyId;
    }

    renderPartyList(filteredParties);
    loadSelectedPartyDetails();
  }

  function renderPartyList(list: PartyBalance[]): void {
    leftPartyListTbody.replaceChildren();

    if (list.length === 0) {
      leftPartyListTbody.appendChild(
        el(
          'tr',
          {},
          el('td', {
            attrs: { colspan: '3' },
            className: 'bo-empty-cell',
            text: 'Tidak ada data pihak dengan saldo.',
          }),
        ),
      );
      return;
    }

    list.forEach((p) => {
      const isSelected = p.partyId === selectedPartyId;
      const row = el(
        'tr',
        {
          className: isSelected ? 'bo-row-selected' : '',
          attrs: { 'aria-selected': isSelected ? 'true' : 'false' },
        },
        el(
          'td',
          {},
          el('strong', { text: p.name }),
          el('div', { className: 't-label', text: `${p.invoicesCount} Faktur | ${p.phone}` }),
        ),
        el('td', { className: 'is-end is-bold', text: formatRupiah(p.totalBalance) }),
        el(
          'td',
          { className: 'is-center' },
          el('span', {
            className: `bo-badge ${p.overdueBalance > 0 ? 'is-danger' : 'is-warning'}`,
            text: p.overdueBalance > 0 ? 'JATUH TEMPO' : 'BELUM LUNAS',
          }),
        ),
      );

      row.addEventListener('click', () => {
        selectedPartyId = p.partyId;
        renderPartyList(list);
        loadSelectedPartyDetails();
      });

      leftPartyListTbody.appendChild(row);
    });
  }

  function loadSelectedPartyDetails(): void {
    const party = parties.find((p) => p.partyId === selectedPartyId);
    if (!party) {
      rightTitleEl.textContent = label('labelRincianTagihanHeader');
      rightTotalTagihanEl.textContent = 'Total: Rp 0';
      rightInvoicesTbody.replaceChildren(
        el(
          'tr',
          {},
          el('td', {
            attrs: { colspan: '6' },
            className: 'bo-empty-cell',
            text: label('labelBelumAdaNotaTerpilih'),
          }),
        ),
      );
      renderAllocationTable();
      return;
    }

    rightTitleEl.textContent = `${label('labelRincianTagihanHeader')}: ${party.name}`;
    rightTotalTagihanEl.textContent = `Total: ${formatRupiah(party.totalBalance)}`;

    unpaidInvoices = getUnpaidInvoicesForParty(party.partyId, activeTab, dataset);
    paymentAllocations = {};
    unpaidInvoices.forEach((inv) => {
      paymentAllocations[inv.invoiceNumber] = 0;
    });

    renderRightInvoices();
    renderAllocationTable();
  }

  function renderRightInvoices(): void {
    rightInvoicesTbody.replaceChildren();

    if (unpaidInvoices.length === 0) {
      rightInvoicesTbody.appendChild(
        el(
          'tr',
          {},
          el('td', {
            attrs: { colspan: '6' },
            className: 'bo-empty-cell',
            text: 'Tidak ada tagihan tertunggak untuk pihak ini.',
          }),
        ),
      );
      return;
    }

    unpaidInvoices.forEach((inv, idx) => {
      rightInvoicesTbody.appendChild(
        el(
          'tr',
          {},
          el('td', { text: String(idx + 1) }),
          el('td', {}, el('strong', { className: 'bo-text-primary', text: inv.invoiceNumber })),
          el('td', { text: inv.date }),
          el('td', { text: inv.dueDate }),
          el('td', { className: 'is-end', text: formatRupiah(inv.amount) }),
          el(
            'td',
            { className: 'is-end is-bold' },
            el('span', { text: formatRupiah(inv.remaining) }),
            inv.isOverdue
              ? el('span', { className: 'bo-badge is-danger bo-party-late', text: 'LEWAT' })
              : el('span', {}),
          ),
        ),
      );
    });
  }

  function renderAllocationTable(): void {
    allocTableTbody.replaceChildren();

    if (unpaidInvoices.length === 0) {
      allocTableTbody.appendChild(
        el(
          'tr',
          {},
          el('td', {
            attrs: { colspan: '5' },
            className: 'bo-empty-cell',
            text: 'Pilih pihak dengan tagihan terlebih dahulu.',
          }),
        ),
      );
      sisaSaldoEl.textContent = formatRupiah(0);
      return;
    }

    let totalAlloc = 0;

    unpaidInvoices.forEach((inv) => {
      const currentAlloc = paymentAllocations[inv.invoiceNumber] ?? 0;
      totalAlloc += currentAlloc;

      const numInput = el('input', {
        className: 'input is-sm is-num',
        attrs: {
          type: 'number',
          min: '0',
          max: String(inv.remaining),
          value: String(currentAlloc),
        },
      });

      numInput.addEventListener('input', () => {
        const val = parseFloat(numInput.value) || 0;
        paymentAllocations[inv.invoiceNumber] = Math.min(inv.remaining, val);
        recalcAllocSummary();
      });

      const remainAfter = Math.max(0, inv.remaining - currentAlloc);

      allocTableTbody.appendChild(
        el(
          'tr',
          {},
          el('td', {}, el('strong', { text: inv.invoiceNumber })),
          el('td', { text: inv.date }),
          el('td', { className: 'is-end', text: formatRupiah(inv.remaining) }),
          el('td', { className: 'is-center' }, numInput),
          el('td', { className: 'is-end is-bold', text: formatRupiah(remainAfter) }),
        ),
      );
    });

    const party = parties.find((p) => p.partyId === selectedPartyId);
    const balanceBefore = party?.totalBalance ?? 0;
    const sisa = Math.max(0, balanceBefore - totalAlloc);
    sisaSaldoEl.textContent = formatRupiah(sisa);
  }

  function recalcAllocSummary(): void {
    let totalAlloc = 0;
    for (const val of Object.values(paymentAllocations)) {
      totalAlloc += val;
    }
    payAmountInput.value = String(totalAlloc);

    const party = parties.find((p) => p.partyId === selectedPartyId);
    const balanceBefore = party?.totalBalance ?? 0;
    const sisa = Math.max(0, balanceBefore - totalAlloc);
    sisaSaldoEl.textContent = formatRupiah(sisa);
  }

  function doFifoAllocation(): void {
    const amount = parseFloat(payAmountInput.value) || 0;
    if (amount <= 0) {
      showToast({ kind: 'info', text: 'Masukkan jumlah bayar terlebih dahulu.' });
      return;
    }

    const allocs = allocatePaymentFifo(unpaidInvoices, amount);
    allocs.forEach((a) => {
      paymentAllocations[a.invoiceNumber] = a.amount;
    });

    renderAllocationTable();
    showToast({ kind: 'success', text: 'Pembayaran dialokasikan otomatis (FIFO).' });
  }

  function openPrintTtdModal(): void {
    const party = parties.find((p) => p.partyId === selectedPartyId);
    if (!party) {
      showToast({ kind: 'info', text: 'Pilih pelanggan/pemasok terlebih dahulu.' });
      return;
    }

    const printableTable = el(
      'table',
      { className: 'pos-table is-compact' },
      el(
        'thead',
        {},
        el(
          'tr',
          {},
          el('th', { text: 'No' }),
          el('th', { text: 'No. Faktur' }),
          el('th', { text: 'Tanggal' }),
          el('th', { text: 'Jatuh Tempo' }),
          el('th', { className: 'is-end', text: 'Nilai Faktur' }),
          el('th', { className: 'is-end', text: 'Sisa Tagihan' }),
        ),
      ),
      el(
        'tbody',
        {},
        ...unpaidInvoices.map((inv, i) =>
          el(
            'tr',
            {},
            el('td', { text: String(i + 1) }),
            el('td', { text: inv.invoiceNumber }),
            el('td', { text: inv.date }),
            el('td', { text: inv.dueDate }),
            el('td', { className: 'is-end', text: formatRupiah(inv.amount) }),
            el('td', { className: 'is-end is-bold', text: formatRupiah(inv.remaining) }),
          ),
        ),
      ),
    );

    const modalBody = el(
      'div',
      { className: 'bo-print-modal-content' },
      el(
        'div',
        { className: 'bo-doc-header' },
        el('h2', { className: 'bo-doc-title', text: 'TAGIHAN PIUTANG & TANDA TERIMA NOTA' }),
        el('p', {
          className: 't-label',
          text: 'TOKO BUDIANNOR - Ritel Bahan Bangunan & Alat Teknik',
        }),
        el('p', { className: 't-label', text: 'Jl. Ahmad Yani No. 12, Banjarbaru' }),
      ),
      el('hr', {}),
      el(
        'div',
        { className: 'bo-form-row-2' },
        el(
          'div',
          {},
          el('strong', { text: `Pelanggan: ${party.name}` }),
          el('p', { text: party.address }),
        ),
        el(
          'div',
          {},
          el('strong', { text: `Tanggal Cetak: ${dataset.referenceDate.slice(0, 10)}` }),
          el('p', { text: `Total Tagihan: ${formatRupiah(party.totalBalance)}` }),
        ),
      ),
      printableTable,
      el(
        'div',
        { className: 'bo-signature-grid' },
        el(
          'div',
          { className: 'bo-sig-box' },
          el('span', { className: 'bo-sig-box__role', text: label('labelTtdPenerimaTagihan') }),
          el('div', { className: 'bo-sig-box__line' }),
          el('span', { className: 'bo-sig-box__name', text: party.name }),
        ),
        el(
          'div',
          { className: 'bo-sig-box' },
          el('span', { className: 'bo-sig-box__role', text: label('labelTtdPetugasKasir') }),
          el('div', { className: 'bo-sig-box__line' }),
          el('span', { className: 'bo-sig-box__name', text: 'Kasir Toko Budiannor' }),
        ),
      ),
    );

    openModal({
      title: label('labelLembarTagihanResmi'),
      body: modalBody,
      actions: [
        {
          text: 'Cetak Lembar Tagihan',
          variant: 'primary',
          onClick: () => {
            window.print();
          },
        },
        { text: label('tutup'), variant: 'secondary' },
      ],
    });
  }

  function openReceiptModal(receiptNo: string, amount: number): void {
    const party = parties.find((p) => p.partyId === selectedPartyId);
    const modalBody = el(
      'div',
      { className: 'bo-print-modal-content' },
      el(
        'div',
        { className: 'bo-doc-header' },
        el('h2', { className: 'bo-doc-title', text: label('labelKuitansiPembayaranJudul') }),
        el('p', { className: 't-label', text: `No. Kuitansi: ${receiptNo}` }),
      ),
      el('hr', {}),
      el(
        'p',
        {},
        el('strong', { text: `${label('labelSudahTerimaDari')}: ` }),
        el('span', { text: party?.name ?? '-' }),
      ),
      el(
        'p',
        {},
        el('strong', { text: `${label('labelUangSejumlah')}: ` }),
        el('span', { className: 'is-bold bo-text-primary', text: formatRupiah(amount) }),
      ),
      el(
        'p',
        {},
        el('strong', { text: `${label('labelUntukPembayaran')}: ` }),
        el('span', {
          text:
            payNoteInput.value ||
            `Pelunasan tagihan ${activeTab === 'pelanggan' ? 'piutang' : 'hutang'}`,
        }),
      ),
      el(
        'div',
        { className: 'bo-signature-grid' },
        el('div', {}),
        el(
          'div',
          { className: 'bo-sig-box' },
          el('span', { className: 'bo-sig-box__role', text: label('labelTtdPetugasKasir') }),
          el('div', { className: 'bo-sig-box__line' }),
          el('span', { className: 'bo-sig-box__name', text: 'Toko Budiannor' }),
        ),
      ),
    );

    openModal({
      title: label('labelKuitansiPembayaranJudul'),
      body: modalBody,
      actions: [
        {
          text: 'Cetak Kuitansi',
          variant: 'primary',
          onClick: () => {
            window.print();
          },
        },
        { text: label('tutup'), variant: 'secondary' },
      ],
    });
  }

  // Top Action Buttons
  const btnCetakTtd = createButton({
    text: label('labelCetakTtdNota'),
    variant: 'secondary',
    icon: 'printer',
    onClick: openPrintTtdModal,
  });

  const btnKirimWa = createButton({
    text: label('labelKirimWaTagihan'),
    variant: 'secondary',
    icon: 'send',
    onClick: () => {
      const party = parties.find((p) => p.partyId === selectedPartyId);
      if (!party) return;
      const msg = buildWhatsAppBillStatement(party, unpaidInvoices, 'Toko Budiannor');
      const url = generateWhatsAppUrl(party.phone, msg);
      window.open(url, '_blank');
      showToast({ kind: 'info', text: 'Tautan WhatsApp telah dibuka.' });
    },
  });

  const btnFifo = createButton({
    text: label('labelAlokasiOtomatisFifo'),
    variant: 'secondary',
    onClick: doFifoAllocation,
  });

  const btnSimpanBayar = createButton({
    text: label('labelSimpanPembayaran'),
    variant: 'primary',
    icon: 'check',
    onClick: () => {
      const amount = parseFloat(payAmountInput.value) || 0;
      if (amount <= 0) {
        showToast({ kind: 'info', text: 'Nominal pembayaran harus lebih dari 0.' });
        return;
      }
      const receiptNo = generatePaymentReceiptNumber();
      showToast({
        kind: 'success',
        text: `Pembayaran ${receiptNo} sebesar ${formatRupiah(amount)} berhasil dicatat.`,
      });
      openReceiptModal(receiptNo, amount);
    },
  });

  // Event Handlers
  tabPiutangBtn.addEventListener('click', () => {
    activeTab = 'pelanggan';
    tabPiutangBtn.classList.add('is-active');
    tabHutangBtn.classList.remove('is-active');
    selectedPartyId = undefined;
    loadParties();
  });

  tabHutangBtn.addEventListener('click', () => {
    activeTab = 'pemasok';
    tabHutangBtn.classList.add('is-active');
    tabPiutangBtn.classList.remove('is-active');
    selectedPartyId = undefined;
    loadParties();
  });

  searchInput.addEventListener('input', () => {
    loadParties();
  });

  payAmountInput.addEventListener('input', () => {
    doFifoAllocation();
  });

  // Top action bar
  const topBar = el(
    'div',
    { className: 'bo-toolbar' },
    el(
      'div',
      { className: 'bo-toolbar__left' },
      el('h1', { className: 'bo-page-title', text: label('manajemenHutangPiutangJudul') }),
      el('div', { className: 'bo-tab-switcher' }, tabPiutangBtn, tabHutangBtn),
    ),
    el('div', { className: 'bo-toolbar__right' }, btnCetakTtd, btnKirimWa),
  );

  // Metrics Grid
  const metricsGrid = el(
    'div',
    { className: 'bo-stats-grid' },
    el(
      'div',
      { className: 'bo-panel bo-stat-card' },
      el('span', {
        className: 'bo-stat-card__lbl',
        text:
          activeTab === 'pelanggan'
            ? label('labelTotalSaldoPiutangSemua')
            : label('labelTotalSaldoHutangSemua'),
      }),
      totalBalanceBadge,
    ),
    el(
      'div',
      { className: 'bo-panel bo-stat-card' },
      el('span', { className: 'bo-stat-card__lbl', text: label('labelTotalJatuhTempoSemua') }),
      totalOverdueBadge,
    ),
  );

  // Split Top Layout (Left: Party List, Right: Invoices)
  const leftPanel = el(
    'div',
    { className: 'bo-panel bo-party-split-left' },
    el('h3', { className: 'bo-form-sec-title', text: label('labelDaftarSaldoHeader') }),
    searchInput,
    el(
      'div',
      { className: 'bo-party-scroll' },
      el(
        'table',
        { className: 'pos-table is-compact' },
        el(
          'thead',
          {},
          el(
            'tr',
            {},
            el('th', { text: 'Nama' }),
            el('th', { className: 'is-end', text: 'Saldo' }),
            el('th', { className: 'is-center', text: 'Status' }),
          ),
        ),
        leftPartyListTbody,
      ),
    ),
  );

  const rightPanel = el(
    'div',
    { className: 'bo-panel bo-party-split-right' },
    el('div', { className: 'bo-split-right-header' }, rightTitleEl, rightTotalTagihanEl),
    el(
      'div',
      { className: 'bo-party-scroll' },
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
            el('th', { text: 'No. Faktur' }),
            el('th', { text: 'Tgl Nota' }),
            el('th', { text: 'Jatuh Tempo' }),
            el('th', { className: 'is-end', text: 'Nilai Nota' }),
            el('th', { className: 'is-end', text: 'Sisa Bayar' }),
          ),
        ),
        rightInvoicesTbody,
      ),
    ),
  );

  // Bottom Panel: Form Pembayaran
  const bottomPayPanel = el(
    'div',
    { className: 'bo-panel bo-pay-panel' },
    el('h3', { className: 'bo-form-sec-title', text: label('labelFormBayarHeader') }),
    el(
      'div',
      { className: 'bo-quick-entry' },
      el(
        'div',
        { className: 'field' },
        el('label', { className: 'field__label', text: 'Tanggal Bayar' }),
        payDateInput,
      ),
      el(
        'div',
        { className: 'field' },
        el('label', { className: 'field__label', text: label('labelCaraBayar') }),
        payMethodSelect,
      ),
      el(
        'div',
        { className: 'field is-grow-2' },
        el('label', { className: 'field__label', text: 'Keterangan' }),
        payNoteInput,
      ),
      el(
        'div',
        { className: 'field' },
        el('label', { className: 'field__label', text: label('labelJumlahBayar') }),
        payAmountInput,
      ),
      el(
        'div',
        { className: 'field is-btn-col' },
        el('label', { className: 'field__label', text: 'Alokasi' }),
        btnFifo,
      ),
    ),
    el(
      'div',
      { className: 'bo-party-scroll' },
      el(
        'table',
        { className: 'pos-table is-compact' },
        el(
          'thead',
          {},
          el(
            'tr',
            {},
            el('th', { text: 'No. Faktur' }),
            el('th', { text: 'Tgl Nota' }),
            el('th', { className: 'is-end', text: 'Sisa Tagihan' }),
            el('th', { className: 'is-center', text: 'Alokasi Bayar (Rp)' }),
            el('th', { className: 'is-end', text: 'Sisa Setelah Bayar' }),
          ),
        ),
        allocTableTbody,
      ),
    ),
    el(
      'div',
      { className: 'bo-form-footer-summary' },
      el(
        'div',
        {},
        el('span', { className: 't-label', text: label('labelSisaSaldoSetelahBayar') }),
        el('div', {}, sisaSaldoEl),
      ),
      el('div', {}, btnSimpanBayar),
    ),
  );

  // Initial load
  loadParties();

  // Daftar pihak di kiri; rincian nota dan form pembayaran bertumpuk di kanan supaya muat satu layar.
  const topSplitSection = el(
    'div',
    { className: 'bo-party-main' },
    leftPanel,
    el('div', { className: 'bo-party-side' }, rightPanel, bottomPayPanel),
  );

  container.replaceChildren(topBar, metricsGrid, topSplitSection);

  return {
    element: container,
    destroy: () => undefined,
  };
}
