import { el } from '../../../shared/dom';
import { formatRupiah } from '../../../shared/format';
import { label } from '../../../shared/messages';
import { createButton } from '../../../shared/ui/button';
import { showToast } from '../../../shared/ui/toast';
import type { BoSession } from '../bo-session';
import type { ScreenHandle } from './login';
import {
  calculateTransactionAgeDays,
  computeTransactionMetrics,
  filterTransactions,
  type TransactionFilterOptions,
  type TransactionRow,
  type TransactionType,
} from '../domain/transaction-list';
import { generateWhatsAppUrl } from '../domain/sales-transaction';

export function renderTransactionList(
  session: BoSession,
  go: (path: string) => void,
  initialTab: TransactionType = 'penjualan',
): ScreenHandle {
  const store = session.store;
  const dataset = store.getState().data;

  let activeTab: TransactionType = initialTab;
  let statusFilter: 'semua' | 'lunas' | 'belum-lunas' | 'jatuh-tempo' = 'semua';
  let searchText = '';

  // Bangun data gabungan penjualan & pembelian realistis dari proposal & generator
  function buildAllTransactions(): TransactionRow[] {
    const today = dataset.referenceDate.slice(0, 10);
    const rows: TransactionRow[] = [];

    // 1. Dari Transaksi POS & Proposal Sales
    dataset.sales.forEach((s, idx) => {
      const cust = dataset.customers.find((c) => c.id === s.customerId);
      const isPaid = s.paid >= s.total;
      const isPiutang = s.payment === 'piutang';
      const age = calculateTransactionAgeDays(s.createdAt, today);
      let status: 'lunas' | 'belum-lunas' | 'jatuh-tempo' = 'lunas';
      if (!isPaid) {
        status = age > 30 ? 'jatuh-tempo' : 'belum-lunas';
      }

      rows.push({
        type: 'penjualan',
        number: s.number !== '' ? s.number : `FJ2610${String(1200 + idx)}`,
        date: s.createdAt.slice(0, 10),
        partyName: cust?.name ?? 'Pelanggan Umum',
        paymentTerms: isPiutang ? 'Piutang (30 Hari)' : 'Tunai',
        status,
        ageDays: age,
        total: s.total,
        rawObject: s,
      });
    });

    // Tambahkan data draf dari proposal (FJ26101234, FJ26101233 sesuai gambar)
    rows.push(
      {
        type: 'penjualan',
        number: 'FJ26101234',
        date: '2026-10-25',
        partyName: 'Bu Sherly Tjoandra',
        paymentTerms: 'Piutang (30 Hari)',
        status: 'belum-lunas',
        ageDays: 0,
        total: 2_450_000,
      },
      {
        type: 'penjualan',
        number: 'FJ26101233',
        date: '2026-10-25',
        partyName: 'Toko Arif',
        paymentTerms: 'Piutang (30 Hari)',
        status: 'belum-lunas',
        ageDays: 0,
        total: 850_000,
      },
      {
        type: 'penjualan',
        number: 'FJ26101232',
        date: '2026-10-18',
        partyName: 'Pak Samsul',
        paymentTerms: 'Piutang (7 Hari)',
        status: 'jatuh-tempo',
        ageDays: 7,
        total: 3_000_000,
      },
      {
        type: 'penjualan',
        number: 'FJ26101231',
        date: '2026-10-25',
        partyName: 'Pelanggan Umum',
        paymentTerms: 'Tunai',
        status: 'lunas',
        ageDays: 0,
        total: 125_000,
      },
    );

    // 2. Dari Transaksi Pembelian Supplier
    dataset.suppliers.forEach((supp, idx) => {
      const hasDebt = supp.payable > 0;
      rows.push({
        type: 'pembelian',
        number: `FB2610${String(2000 + idx)}`,
        date: '2026-10-20',
        partyName: supp.name,
        paymentTerms: hasDebt ? 'Hutang (30 Hari)' : 'Tunai',
        status: hasDebt ? 'belum-lunas' : 'lunas',
        ageDays: 5,
        total: hasDebt ? supp.payable : 2_500_000,
      });
    });

    rows.push(
      {
        type: 'pembelian',
        number: 'FB26101234',
        date: '2026-10-25',
        partyName: 'PT Sejati Raya',
        paymentTerms: 'Hutang (30 Hari)',
        status: 'belum-lunas',
        ageDays: 0,
        total: 1_890_000,
      },
      {
        type: 'pembelian',
        number: 'FB26101210',
        date: '2026-09-20',
        partyName: 'PT Tiga Roda Semen',
        paymentTerms: 'Hutang (30 Hari)',
        status: 'jatuh-tempo',
        ageDays: 35,
        total: 8_200_000,
      },
    );

    return rows.sort((a, b) => b.date.localeCompare(a.date));
  }

  const allTransactions = buildAllTransactions();

  // Root container
  const container = el('div', { className: 'bo-form-page' });

  // Tab buttons
  const tabPenjualanBtn = el('button', {
    className: `bo-tab-btn ${activeTab === 'penjualan' ? 'is-active' : ''}`,
    attrs: { type: 'button' },
    text: label('tabFakturPenjualan'),
  });

  const tabPembelianBtn = el('button', {
    className: `bo-tab-btn ${activeTab === 'pembelian' ? 'is-active' : ''}`,
    attrs: { type: 'button' },
    text: label('tabFakturPembelian'),
  });

  // Filters
  const searchInput = el('input', {
    className: 'input is-search',
    attrs: { type: 'search', placeholder: 'Cari No Faktur / Pelanggan / Pemasok...' },
  });

  const statusSelect = el('select', { className: 'input is-select' });
  [
    { value: 'semua', text: 'Semua Status' },
    { value: 'lunas', text: label('labelStatusLunasTag') },
    { value: 'belum-lunas', text: label('labelStatusBelumLunas') },
    { value: 'jatuh-tempo', text: label('labelStatusJatuhTempo') },
  ].forEach((s) => {
    statusSelect.appendChild(el('option', { text: s.text, attrs: { value: s.value } }));
  });

  // Summary Metrics
  const totalNilaiEl = el('span', { className: 'bo-stat-card__val', text: 'Rp 0' });
  const totalBelumLunasEl = el('span', { className: 'bo-stat-card__val is-warning', text: 'Rp 0' });
  const totalJatuhTempoEl = el('span', { className: 'bo-stat-card__val is-danger', text: 'Rp 0' });

  const metricsRow = el(
    'div',
    { className: 'bo-stats-grid' },
    el(
      'div',
      { className: 'bo-panel bo-stat-card' },
      el('span', { className: 'bo-stat-card__lbl', text: label('labelRingkasanOmset') }),
      totalNilaiEl,
    ),
    el(
      'div',
      { className: 'bo-panel bo-stat-card' },
      el('span', { className: 'bo-stat-card__lbl', text: label('labelRingkasanBelumLunas') }),
      totalBelumLunasEl,
    ),
    el(
      'div',
      { className: 'bo-panel bo-stat-card' },
      el('span', { className: 'bo-stat-card__lbl', text: label('labelRingkasanJatuhTempo') }),
      totalJatuhTempoEl,
    ),
  );

  const tableBodyEl = el('tbody', {});

  function renderTable(): void {
    const filterOptions: TransactionFilterOptions = {
      type: activeTab,
      status: statusFilter,
      query: searchText,
    };

    const filtered = filterTransactions(allTransactions, filterOptions);
    const metrics = computeTransactionMetrics(filtered);

    totalNilaiEl.textContent = formatRupiah(metrics.totalNilai);
    totalBelumLunasEl.textContent = formatRupiah(metrics.totalBelumLunas);
    totalJatuhTempoEl.textContent = formatRupiah(metrics.totalJatuhTempo);

    tableBodyEl.replaceChildren();

    if (filtered.length === 0) {
      tableBodyEl.appendChild(
        el(
          'tr',
          {},
          el('td', {
            attrs: { colspan: '8' },
            className: 'bo-empty-cell',
            text: 'Tidak ada nota transaksi yang sesuai filter.',
          }),
        ),
      );
      return;
    }

    filtered.forEach((r) => {
      let badgeClass = 'is-lunas';
      let badgeText = label('labelStatusLunasTag');
      if (r.status === 'belum-lunas') {
        badgeClass = 'is-warning';
        badgeText = label('labelStatusBelumLunas');
      } else if (r.status === 'jatuh-tempo') {
        badgeClass = 'is-danger';
        badgeText = label('labelStatusJatuhTempo');
      }

      const openBtn = createButton({
        text: 'Buka',
        variant: 'secondary',
        onClick: () => {
          if (r.type === 'penjualan') {
            go(`/bo/penjualan?no=${r.number}`);
          } else {
            go(`/bo/pembelian?no=${r.number}`);
          }
        },
      });
      openBtn.classList.add('is-btn-sm');

      const printBtn = createButton({
        text: 'Cetak',
        variant: 'secondary',
        onClick: () => {
          window.print();
        },
      });
      printBtn.classList.add('is-btn-sm');

      const waBtn = createButton({
        text: 'WA',
        variant: 'secondary',
        onClick: () => {
          const url = generateWhatsAppUrl(
            '0811230988',
            `Salinan Nota ${r.number} dari Toko Budiannor sebesar ${formatRupiah(r.total)}.`,
          );
          window.open(url, '_blank');
          showToast({ kind: 'info', text: 'Membuka WhatsApp...' });
        },
      });
      waBtn.classList.add('is-btn-sm');

      tableBodyEl.appendChild(
        el(
          'tr',
          {},
          el('td', {}, el('strong', { className: 'bo-text-primary', text: r.number })),
          el('td', { className: 'bo-nowrap', text: r.date }),
          el('td', {}, el('span', { className: 'is-bold', text: r.partyName })),
          el('td', { className: 'bo-nowrap', text: r.paymentTerms }),
          el('td', {}, el('span', { className: `bo-badge ${badgeClass}`, text: badgeText })),
          el('td', { className: 'is-center', text: `${r.ageDays} Hari` }),
          el('td', { className: 'is-end is-bold', text: formatRupiah(r.total) }),
          el('td', { className: 'is-center bo-table-actions' }, openBtn, printBtn, waBtn),
        ),
      );
    });
  }

  // Event handlers
  tabPenjualanBtn.addEventListener('click', () => {
    activeTab = 'penjualan';
    tabPenjualanBtn.classList.add('is-active');
    tabPembelianBtn.classList.remove('is-active');
    renderTable();
  });

  tabPembelianBtn.addEventListener('click', () => {
    activeTab = 'pembelian';
    tabPembelianBtn.classList.add('is-active');
    tabPenjualanBtn.classList.remove('is-active');
    renderTable();
  });

  searchInput.addEventListener('input', () => {
    searchText = searchInput.value;
    renderTable();
  });

  statusSelect.addEventListener('change', () => {
    statusFilter = statusSelect.value as typeof statusFilter;
    renderTable();
  });

  // Top action bar
  const btnBuatFaktur = createButton({
    text: 'Buat Faktur Baru',
    variant: 'primary',
    icon: 'plus',
    onClick: () => {
      if (activeTab === 'penjualan') {
        go('/bo/penjualan');
      } else {
        go('/bo/pembelian');
      }
    },
  });

  const btnCetakLap = createButton({
    text: 'Cetak Laporan',
    variant: 'secondary',
    icon: 'printer',
    onClick: () => {
      window.print();
    },
  });

  const topBar = el(
    'div',
    { className: 'bo-toolbar' },
    el(
      'div',
      { className: 'bo-toolbar__left' },
      el('h1', { className: 'bo-page-title', text: label('daftarNotaJudul') }),
      el('div', { className: 'bo-tab-switcher' }, tabPenjualanBtn, tabPembelianBtn),
    ),
    el('div', { className: 'bo-toolbar__right' }, btnBuatFaktur, btnCetakLap),
  );

  const filterBar = el(
    'div',
    { className: 'bo-filter-bar bo-panel' },
    el('div', { className: 'field is-grow-2' }, searchInput),
    el('div', { className: 'field' }, statusSelect),
  );

  const tableCard = el(
    'div',
    { className: 'bo-panel' },
    el(
      'table',
      { className: 'pos-table' },
      el(
        'thead',
        {},
        el(
          'tr',
          {},
          el('th', { text: label('noInvoice') }),
          el('th', { text: label('tanggal') }),
          el('th', { text: 'Pelanggan / Pemasok' }),
          el('th', { text: 'Pembayaran' }),
          el('th', { text: label('kolomStatus') }),
          el('th', { className: 'is-center', text: label('labelUmurNota') }),
          el('th', { className: 'is-end', text: label('kolomTotal') }),
          el('th', { className: 'is-center', text: 'Aksi' }),
        ),
      ),
      tableBodyEl,
    ),
  );

  renderTable();

  container.replaceChildren(topBar, metricsRow, filterBar, tableCard);

  return {
    element: container,
    destroy: () => undefined,
  };
}
