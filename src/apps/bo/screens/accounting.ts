import { el } from '../../../shared/dom';
import { formatRupiah } from '../../../shared/format';
import { label } from '../../../shared/messages';
import { createButton } from '../../../shared/ui/button';
import { showToast } from '../../../shared/ui/toast';
import type { BoSession } from '../bo-session';
import type { ScreenHandle } from './login';
import {
  DEFAULT_JOURNAL_ENTRIES,
  DEFAULT_EXPENSE_ITEMS,
  getFilteredJournalEntries,
  calculateJournalTotal,
  calculateExpenseSummary,
  generateCashFlowStatement,
  generateProfitLossStatement,
  generateBalanceSheetStatement,
  exportTableToCsv,
  type JournalRow,
  type OperatingExpenseItem,
} from '../domain/accounting';
import { openExportPreview } from '../export-preview';

export type AccountingTab = 'jurnal' | 'beban' | 'arus-kas' | 'laba-rugi' | 'neraca';

export function renderAccountingScreen(
  session: BoSession,
  _go: (path: string) => void,
  initialTab: AccountingTab = 'jurnal',
): ScreenHandle {
  let activeTab: AccountingTab = initialTab;
  let journalEntries: JournalRow[] = [...DEFAULT_JOURNAL_ENTRIES];
  let expenseItems: OperatingExpenseItem[] = [...DEFAULT_EXPENSE_ITEMS];

  // Root container
  const container = el('div', { className: 'bo-form-page' });

  // Main container renders dynamic view
  function renderView(): void {
    container.replaceChildren();

    // 1. Top Bar & Tab Switcher
    const topBar = createTopBar();
    container.appendChild(topBar);

    // 2. Body View per Tab
    if (activeTab === 'jurnal') {
      container.appendChild(renderJournalView());
    } else if (activeTab === 'beban') {
      container.appendChild(renderExpensesView());
    } else if (activeTab === 'arus-kas') {
      container.appendChild(renderCashFlowView());
    } else if (activeTab === 'laba-rugi') {
      container.appendChild(renderProfitLossView());
    } else {
      container.appendChild(renderBalanceSheetView());
    }
  }

  // --- Top Bar & Navigation ---
  function createTopBar(): HTMLElement {
    let titleText = label('jurnalOtomatisJudul');
    let subText = label('jurnalSubJudul');

    if (activeTab === 'beban') {
      titleText = label('bebanOperasionalJudul');
      subText = label('bebanSubJudul');
    } else if (activeTab === 'arus-kas') {
      titleText = label('arusKasJudul');
      subText = label('arusKasSubJudul');
    } else if (activeTab === 'laba-rugi') {
      titleText = label('labaRugiJudul');
      subText = label('labaRugiSubJudul');
    } else if (activeTab === 'neraca') {
      titleText = label('neracaJudul');
      subText = label('neracaSubJudul');
    }

    const titleBlock = el(
      'div',
      {},
      el('h1', { className: 'bo-page-title', text: titleText }),
      el('p', { className: 't-label bo-acc-sub', attrs: { title: subText }, text: subText }),
    );

    // Tabs
    const tabs: { key: AccountingTab; text: string }[] = [
      { key: 'jurnal', text: 'Jurnal Otomatis' },
      { key: 'beban', text: 'Beban Operasional' },
      { key: 'arus-kas', text: 'Arus Kas' },
      { key: 'laba-rugi', text: 'Laba Rugi' },
      { key: 'neraca', text: 'Neraca' },
    ];

    const tabButtons = tabs.map((t) => {
      const btn = el('button', {
        className: `bo-tab-btn ${activeTab === t.key ? 'is-active' : ''}`,
        attrs: { type: 'button' },
        text: t.text,
      });
      btn.addEventListener('click', () => {
        activeTab = t.key;
        renderView();
      });
      return btn;
    });

    const tabSwitcher = el('div', { className: 'bo-tab-switcher' }, ...tabButtons);

    // Export Buttons
    const btnPdf = createButton({
      text: label('eksporPdf'),
      variant: 'secondary',
      icon: 'printer',
      onClick: handleExportPdf,
    });

    const btnExcel = createButton({
      text: label('eksporExcelXlsx'),
      variant: 'primary',
      icon: 'download',
      onClick: handleExportExcel,
    });

    const rightActions = el('div', { className: 'bo-toolbar__right' }, btnPdf, btnExcel);

    return el(
      'div',
      { className: 'bo-toolbar' },
      el('div', { className: 'bo-toolbar__left bo-acc-toolbar-left' }, titleBlock, tabSwitcher),
      rightActions,
    );
  }

  // --- TAB 1: Jurnal Otomatis ---
  function renderJournalView(): HTMLElement {
    const viewContainer = el('div', { className: 'bo-act-view' });

    let sourceFilter = 'semua';
    let statusFilter = 'semua';
    let warehouseFilter = 'semua';
    let searchQuery = '';

    // Filter controls
    const searchInput = el('input', {
      className: 'input is-search',
      attrs: { type: 'search', placeholder: 'Cari jurnal, akun, nomor transaksi...' },
    });

    const sourceSelect = el('select', { className: 'input is-select' });
    [
      { value: 'semua', text: label('labelSemuaSumber') },
      { value: 'POS', text: 'Penjualan tunai POS' },
      { value: 'INV', text: 'Penjualan kredit faktur' },
      { value: 'HPP', text: 'HPP rata-rata (HPP Average)' },
      { value: 'Pelunasan', text: 'Pelunasan piutang pelanggan' },
      { value: 'PO', text: 'Pembelian faktur PO' },
      { value: 'Beban', text: 'Beban operasional toko' },
      { value: 'Bayar', text: 'Bayar utang supplier' },
      { value: 'Retur', text: 'Retur penjualan' },
    ].forEach((o) => {
      sourceSelect.appendChild(el('option', { text: o.text, attrs: { value: o.value } }));
    });

    const statusSelect = el('select', { className: 'input is-select' });
    [
      { value: 'semua', text: label('labelSemuaStatus') },
      { value: 'terposting', text: label('labelTerposting') },
      { value: 'review', text: label('labelPerluReview') },
    ].forEach((o) => {
      statusSelect.appendChild(el('option', { text: o.text, attrs: { value: o.value } }));
    });

    const warehouseSelect = el('select', { className: 'input is-select' });
    [
      { value: 'semua', text: label('labelSemuaGudang') },
      { value: 'Display', text: 'Display (Toko)' },
      { value: 'Gudang Besar', text: 'Gudang Besar' },
    ].forEach((o) => {
      warehouseSelect.appendChild(el('option', { text: o.text, attrs: { value: o.value } }));
    });

    const tableTbody = el('tbody', {});
    const totalCell = el('span', { className: 'is-bold', text: 'Rp 0' });

    function refreshJournalList(): void {
      tableTbody.replaceChildren();
      const rows = getFilteredJournalEntries(journalEntries, {
        source: sourceFilter,
        status: statusFilter,
        warehouse: warehouseFilter,
        searchQuery,
      });

      if (rows.length === 0) {
        tableTbody.appendChild(
          el(
            'tr',
            {},
            el('td', {
              attrs: { colspan: '7' },
              className: 'bo-empty-cell',
              text: 'Tidak ada data jurnal yang cocok dengan filter.',
            }),
          ),
        );
        totalCell.textContent = 'Rp 0';
        return;
      }

      rows.forEach((row) => {
        tableTbody.appendChild(
          el(
            'tr',
            {},
            el('td', {}, el('strong', { className: 'bo-text-primary', text: row.id })),
            el('td', { text: row.date }),
            el(
              'td',
              {},
              el('div', { text: row.source }),
              el('span', { className: 't-label', text: row.warehouse ?? '-' }),
            ),
            el('td', {}, el('span', { className: 'bo-badge is-toko', text: row.debitAccount })),
            el('td', {}, el('span', { className: 'bo-badge is-gudang', text: row.creditAccount })),
            el('td', { className: 'is-end is-bold', text: formatRupiah(row.amount) }),
            el(
              'td',
              { className: 'is-center' },
              el('span', {
                className: `bo-badge ${row.status === 'terposting' ? 'is-lunas' : 'is-warning'}`,
                text:
                  row.status === 'terposting'
                    ? label('labelTerposting')
                    : label('labelPerluReview'),
              }),
            ),
          ),
        );
      });

      const total = calculateJournalTotal(rows);
      totalCell.textContent = formatRupiah(total);
    }

    searchInput.addEventListener('input', () => {
      searchQuery = searchInput.value.trim();
      refreshJournalList();
    });

    sourceSelect.addEventListener('change', () => {
      sourceFilter = sourceSelect.value;
      refreshJournalList();
    });

    statusSelect.addEventListener('change', () => {
      statusFilter = statusSelect.value;
      refreshJournalList();
    });

    warehouseSelect.addEventListener('change', () => {
      warehouseFilter = warehouseSelect.value;
      refreshJournalList();
    });

    const filterBar = el(
      'div',
      { className: 'bo-panel bo-filter-bar bo-acc-filter' },
      el('div', { className: 'bo-acc-filter__search' }, searchInput),
      el('div', { className: 'bo-acc-filter__source' }, sourceSelect),
      el('div', { className: 'bo-acc-filter__status' }, statusSelect),
      el('div', { className: 'bo-acc-filter__warehouse' }, warehouseSelect),
    );

    const journalTable = el(
      'table',
      { className: 'pos-table is-compact' },
      el(
        'thead',
        {},
        el(
          'tr',
          {},
          el('th', { text: 'No Jurnal' }),
          el('th', { text: 'Tanggal' }),
          el('th', { text: 'Sumber / Keterangan' }),
          el('th', { text: 'Akun Debit' }),
          el('th', { text: 'Akun Kredit' }),
          el('th', { className: 'is-end', text: 'Nominal (Rp)' }),
          el('th', { className: 'is-center', text: 'Status' }),
        ),
      ),
      tableTbody,
      el(
        'tfoot',
        {},
        el(
          'tr',
          { className: 'bo-tfoot-summary' },
          el('td', {
            attrs: { colspan: '5' },
            className: 'is-bold',
            text: label('labelTotalHalamanDebitKredit'),
          }),
          el('td', { className: 'is-end' }, totalCell),
          el('td', {}),
        ),
      ),
    );

    refreshJournalList();

    viewContainer.appendChild(filterBar);
    viewContainer.appendChild(
      el('div', { className: 'bo-panel bo-acc-table-panel' }, journalTable),
    );

    return viewContainer;
  }

  // --- TAB 2: Beban Operasional ---
  function renderExpensesView(): HTMLElement {
    const viewContainer = el('div', { className: 'bo-act-view' });

    // Stat Cards
    const summary = calculateExpenseSummary(expenseItems);

    const statsGrid = el(
      'div',
      { className: 'bo-stats-grid bo-acc-stats' },
      el(
        'div',
        { className: 'bo-panel bo-stat-card' },
        el('span', { className: 'bo-stat-card__lbl', text: 'Total Beban Okt 2026' }),
        el('span', { className: 'bo-stat-card__val', text: formatRupiah(summary.totalBeban) }),
        el('span', {
          className: 't-label',
          text: `${summary.persenDariPenjualan}% dari penjualan`,
        }),
      ),
      el(
        'div',
        { className: 'bo-panel bo-stat-card' },
        el('span', { className: 'bo-stat-card__lbl', text: label('labelGajiDanKomisi') }),
        el('span', { className: 'bo-stat-card__val', text: formatRupiah(summary.gajiKomisi) }),
        el('span', { className: 't-label', text: `${summary.persenGaji}% dari total beban` }),
      ),
      el(
        'div',
        { className: 'bo-panel bo-stat-card' },
        el('span', { className: 'bo-stat-card__lbl', text: label('labelSewaDanListrik') }),
        el('span', { className: 'bo-stat-card__val', text: formatRupiah(summary.sewaListrik) }),
        el('span', { className: 't-label', text: `${summary.persenSewa}% dari total beban` }),
      ),
      el(
        'div',
        { className: 'bo-panel bo-stat-card' },
        el('span', { className: 'bo-stat-card__lbl', text: label('labelTransportasiLain') }),
        el('span', {
          className: 'bo-stat-card__val',
          text: formatRupiah(summary.transportasiLain),
        }),
        el('span', { className: 't-label', text: 'Rp 6.250.000 + Rp 2.150.000' }),
      ),
    );

    // Form Input Beban Baru (Kiri)
    const dateInput = el('input', {
      className: 'input',
      attrs: { type: 'date', value: new Date().toISOString().slice(0, 10) },
    });

    const categorySelect = el('select', { className: 'input is-select' });
    [
      { value: 'Gaji dan Komisi', text: 'Gaji dan Komisi' },
      { value: 'Sewa dan Listrik', text: 'Sewa dan Listrik' },
      { value: 'Transportasi', text: 'Transportasi' },
      { value: 'Beban Lain-lain', text: 'Beban Lain-lain' },
    ].forEach((c) => {
      categorySelect.appendChild(el('option', { text: c.text, attrs: { value: c.value } }));
    });

    const amountInput = el('input', {
      className: 'input is-num',
      attrs: { type: 'number', min: '0', placeholder: '0' },
    });

    const sourceFundSelect = el('select', { className: 'input is-select' });
    [
      { value: 'Kas Toko', text: 'Kas Toko' },
      { value: 'Bank BCA', text: 'Bank BCA' },
    ].forEach((f) => {
      sourceFundSelect.appendChild(el('option', { text: f.text, attrs: { value: f.value } }));
    });

    const descInput = el('input', {
      className: 'input',
      attrs: { type: 'text', placeholder: 'Contoh: sewa truk pengiriman' },
    });

    const btnSubmitExpense = createButton({
      text: label('labelSimpanDanJurnalkan'),
      variant: 'primary',
      icon: 'check',
      onClick: () => {
        const nominal = parseFloat(amountInput.value) || 0;
        const ket = descInput.value.trim();
        if (nominal <= 0) {
          showToast({ kind: 'info', text: 'Masukkan nominal beban lebih dari 0.' });
          return;
        }
        if (!ket) {
          showToast({ kind: 'info', text: 'Masukkan keterangan beban.' });
          return;
        }

        const newId = `BBN-0${expenseItems.length + 1}`;
        const newItem: OperatingExpenseItem = {
          id: newId,
          date: dateInput.value,
          category: categorySelect.value,
          description: ket,
          amount: nominal,
          paidFrom: sourceFundSelect.value,
          status: 'terjurnal',
        };

        // Buat juga jurnal otomatis
        const newJournal: JournalRow = {
          id: `JU-2610-0${320 + expenseItems.length}`,
          date: dateInput.value,
          source: `Beban ${categorySelect.value}`,
          debitAccount: `Beban ${categorySelect.value}`,
          creditAccount: sourceFundSelect.value,
          amount: nominal,
          status: 'terposting',
        };

        expenseItems = [newItem, ...expenseItems];
        journalEntries = [newJournal, ...journalEntries];

        showToast({
          kind: 'success',
          text: `Beban ${formatRupiah(nominal)} berhasil disimpan dan dijurnalkan.`,
        });

        renderView();
      },
    });

    const leftPanel = el(
      'div',
      { className: 'bo-panel bo-acc-form-panel' },
      el('h3', { className: 'bo-form-sec-title', text: label('labelInputBebanBaru') }),
      el(
        'div',
        { className: 'field' },
        el('label', { className: 'field__label', text: 'Tanggal' }),
        dateInput,
      ),
      el(
        'div',
        { className: 'field' },
        el('label', { className: 'field__label', text: 'Kategori' }),
        categorySelect,
      ),
      el(
        'div',
        { className: 'field' },
        el('label', { className: 'field__label', text: 'Nominal (Rp)' }),
        amountInput,
      ),
      el(
        'div',
        { className: 'field' },
        el('label', { className: 'field__label', text: 'Dibayar dari' }),
        sourceFundSelect,
      ),
      el(
        'div',
        { className: 'field' },
        el('label', { className: 'field__label', text: 'Keterangan' }),
        descInput,
      ),
      el('div', { className: 'bo-acc-submit' }, btnSubmitExpense),
    );

    // Tabel Riwayat Beban (Kanan)
    const expenseTbody = el('tbody', {});
    expenseItems.forEach((item) => {
      expenseTbody.appendChild(
        el(
          'tr',
          {},
          el('td', { text: item.date }),
          el('td', {}, el('span', { className: 'bo-badge is-gudang', text: item.category })),
          el(
            'td',
            {},
            el('div', { text: item.description }),
            el('span', { className: 't-label', text: item.paidFrom }),
          ),
          el('td', { className: 'is-end is-bold', text: formatRupiah(item.amount) }),
          el(
            'td',
            { className: 'is-center' },
            el('span', { className: 'bo-badge is-lunas', text: label('labelTerjurnal') }),
          ),
        ),
      );
    });

    const rightPanel = el(
      'div',
      { className: 'bo-panel bo-acc-hist-panel' },
      el('h3', { className: 'bo-form-sec-title', text: label('labelRiwayatBeban') }),
      el(
        'table',
        { className: 'pos-table is-compact' },
        el(
          'thead',
          {},
          el(
            'tr',
            {},
            el('th', { text: 'Tanggal' }),
            el('th', { text: 'Kategori' }),
            el('th', { text: 'Keterangan' }),
            el('th', { className: 'is-end', text: 'Nominal' }),
            el('th', { className: 'is-center', text: 'Status' }),
          ),
        ),
        expenseTbody,
      ),
    );

    const splitSection = el('div', { className: 'bo-acc-split' }, leftPanel, rightPanel);

    viewContainer.appendChild(statsGrid);
    viewContainer.appendChild(splitSection);
    return viewContainer;
  }

  // --- TAB 3: Arus Kas Langsung ---
  function renderCashFlowView(): HTMLElement {
    const viewContainer = el('div', { className: 'bo-act-view' });
    const cf = generateCashFlowStatement(expenseItems);

    // 4 Stat Cards
    const statsGrid = el(
      'div',
      { className: 'bo-stats-grid bo-acc-stats' },
      el(
        'div',
        { className: 'bo-panel bo-stat-card' },
        el('span', { className: 'bo-stat-card__lbl', text: label('labelKasAwalPeriode') }),
        el('span', { className: 'bo-stat-card__val', text: formatRupiah(cf.initialCash) }),
        el('span', { className: 't-label', text: '1 Okt 2026' }),
      ),
      el(
        'div',
        { className: 'bo-panel bo-stat-card' },
        el('span', { className: 'bo-stat-card__lbl', text: label('labelTotalKasMasuk') }),
        el('span', { className: 'bo-stat-card__val is-success', text: formatRupiah(389_750_000) }),
        el('span', { className: 't-label', text: 'Penerimaan pelanggan' }),
      ),
      el(
        'div',
        { className: 'bo-panel bo-stat-card' },
        el('span', { className: 'bo-stat-card__lbl', text: label('labelTotalKasKeluar') }),
        el('span', { className: 'bo-stat-card__val is-danger', text: formatRupiah(346_400_000) }),
        el('span', { className: 't-label', text: 'Operasi, investasi, pendanaan' }),
      ),
      el(
        'div',
        { className: 'bo-panel bo-stat-card' },
        el('span', { className: 'bo-stat-card__lbl', text: label('labelKasAkhirPeriode') }),
        el('span', { className: 'bo-stat-card__val', text: formatRupiah(cf.endingCash) }),
        el('span', { className: 't-label', text: `Naik ${formatRupiah(cf.netCashChange)}` }),
      ),
    );

    // Panel Kiri: Laporan Arus Kas
    const leftPanel = el(
      'div',
      { className: 'bo-panel bo-acc-main-panel' },
      el('h3', { className: 'bo-form-sec-title', text: 'Laporan Arus Kas' }),
      // Operasi
      el('h4', { className: 'bo-sec-sub', text: label('labelAktivitasOperasi') }),
      ...cf.operatingInflows.map((item) =>
        el(
          'div',
          { className: 'bo-report-line' },
          el('span', { text: item.label }),
          el('span', { text: formatRupiah(item.amount) }),
        ),
      ),
      ...cf.operatingOutflows.map((item) =>
        el(
          'div',
          { className: 'bo-report-line' },
          el('span', { text: item.label }),
          el('span', { className: 'bo-text-danger', text: `-${formatRupiah(item.amount)}` }),
        ),
      ),
      el(
        'div',
        { className: 'bo-report-line is-subtotal' },
        el('strong', { text: label('labelKasBersihOperasi') }),
        el('strong', { text: formatRupiah(cf.netOperatingCash) }),
      ),
      // Investasi
      el('h4', { className: 'bo-sec-sub', text: label('labelAktivitasInvestasi') }),
      ...cf.investingOutflows.map((item) =>
        el(
          'div',
          { className: 'bo-report-line' },
          el('span', { text: item.label }),
          el('span', { className: 'bo-text-danger', text: `-${formatRupiah(item.amount)}` }),
        ),
      ),
      // Pendanaan
      el('h4', { className: 'bo-sec-sub', text: label('labelAktivitasPendanaan') }),
      ...cf.financingOutflows.map((item) =>
        el(
          'div',
          { className: 'bo-report-line' },
          el('span', { text: item.label }),
          el('span', { className: 'bo-text-danger', text: `-${formatRupiah(item.amount)}` }),
        ),
      ),
      // Kenaikan Kas Bersih Bar
      el(
        'div',
        { className: 'bo-report-highlight-bar bo-acc-bar-top' },
        el('strong', { text: label('labelKenaikanKasBersih') }),
        el('strong', { className: 'bo-text-primary', text: formatRupiah(cf.netCashChange) }),
      ),
    );

    // Panel Kanan: Posisi Kas dan Bank
    const posBars = cf.cashPositions.map((pos) => {
      const bar = el('div', { className: 'bo-prog-fill' });
      bar.style.setProperty('width', `${String(pos.percent)}%`);
      bar.style.setProperty('background', pos.barColor);
      return el(
        'div',
        { className: 'bo-cash-pos-row' },
        el(
          'div',
          { className: 'bo-report-line bo-acc-line-tight' },
          el('strong', { text: pos.account }),
          el('span', { text: `${formatRupiah(pos.amount)} (${pos.percent}%)` }),
        ),
        el('div', { className: 'bo-prog-track' }, bar),
      );
    });

    const rightPanel = el(
      'div',
      { className: 'bo-panel bo-acc-side-panel' },
      el('h3', { className: 'bo-form-sec-title', text: label('labelPosisiKasBank') }),
      ...posBars,
      el('hr', {}),
      el(
        'div',
        { className: 'bo-report-line is-subtotal' },
        el('strong', { text: 'Total' }),
        el('strong', { text: formatRupiah(cf.endingCash) }),
      ),
    );

    const splitSection = el('div', { className: 'bo-acc-split' }, leftPanel, rightPanel);

    viewContainer.appendChild(statsGrid);
    viewContainer.appendChild(splitSection);
    return viewContainer;
  }

  // --- TAB 4: Laporan Laba Rugi ---
  function renderProfitLossView(): HTMLElement {
    const viewContainer = el('div', { className: 'bo-act-view' });
    const pl = generateProfitLossStatement(session.store.getState().data, expenseItems);

    // Panel Kiri: Rincian Laba Rugi
    const leftPanel = el(
      'div',
      { className: 'bo-panel bo-acc-main-panel' },
      el('h3', { className: 'bo-form-sec-title', text: 'Laba Rugi Oktober 2026' }),
      el('h4', { className: 'bo-sec-sub', text: 'PENDAPATAN' }),
      el(
        'div',
        { className: 'bo-report-line' },
        el('span', { text: label('labelPenjualanBersih') }),
        el('span', { text: formatRupiah(pl.revenue.netSales) }),
      ),
      el(
        'div',
        { className: 'bo-report-line' },
        el('span', { text: label('labelHppAverage') }),
        el('span', { text: `(${formatRupiah(pl.revenue.cogs)})` }),
      ),
      el(
        'div',
        { className: 'bo-report-highlight-bar bo-acc-bar-gap' },
        el('strong', { text: label('labelLabaKotor') }),
        el('strong', {
          text: `${formatRupiah(pl.revenue.grossProfit)} (${pl.revenue.grossMarginPercent}%)`,
        }),
      ),
      el('h4', { className: 'bo-sec-sub', text: 'BEBAN OPERASIONAL' }),
      ...pl.expenses.items.map((item) =>
        el(
          'div',
          { className: 'bo-report-line' },
          el('span', { text: item.category }),
          el('span', { text: `(${formatRupiah(item.amount)})` }),
        ),
      ),
      el(
        'div',
        { className: 'bo-report-line is-subtotal' },
        el('strong', { text: 'Total Beban Operasional' }),
        el('strong', { text: `(${formatRupiah(pl.expenses.totalExpense)})` }),
      ),
      el(
        'div',
        { className: 'bo-report-highlight-bar is-success bo-acc-bar-top' },
        el('strong', { text: label('labelLabaBersih') }),
        el('strong', { text: `${formatRupiah(pl.netProfit)} (${pl.netProfitPercentFromSales}%)` }),
      ),
    );

    // Panel Kanan: Metric Cards & Action
    const cardLaba = el(
      'div',
      { className: 'bo-panel bo-stat-card' },
      el('span', { className: 'bo-stat-card__lbl', text: label('labelLabaBersih') }),
      el('span', { className: 'bo-stat-card__val is-success', text: formatRupiah(pl.netProfit) }),
      el('span', { className: 't-label', text: `${pl.netProfitPercentFromSales}% dari penjualan` }),
    );

    const cardMargin = el(
      'div',
      { className: 'bo-panel bo-stat-card' },
      el('span', { className: 'bo-stat-card__lbl', text: label('labelMarginKotor') }),
      el('span', { className: 'bo-stat-card__val', text: `${pl.revenue.grossMarginPercent}%` }),
      el('span', { className: 't-label', text: 'HPP Average, konsisten antar gudang' }),
    );

    const cardBeban = el(
      'div',
      { className: 'bo-panel bo-stat-card' },
      el('span', { className: 'bo-stat-card__lbl', text: label('bebanOperasionalJudul') }),
      el('span', { className: 'bo-stat-card__val', text: formatRupiah(pl.expenses.totalExpense) }),
      el('span', {
        className: 't-label',
        text: `${pl.expenses.expensePercentFromSales}% dari penjualan`,
      }),
    );

    const btnBukaBeban = createButton({
      text: label('labelInputBebanOperasional'),
      variant: 'secondary',
      onClick: () => {
        activeTab = 'beban';
        renderView();
      },
    });

    const cardJurnal = el(
      'div',
      { className: 'bo-panel' },
      el('h4', { className: 'bo-form-sec-title', text: label('jurnalOtomatisJudul') }),
      el('p', {
        className: 't-label bo-acc-note',
        text: 'Setiap transaksi kasir, penerimaan barang, retur, dan beban operasional membentuk jurnal otomatis ke laporan ini.',
      }),
      btnBukaBeban,
    );

    const rightPanel = el(
      'div',
      { className: 'bo-acc-side-col' },
      cardLaba,
      cardMargin,
      cardBeban,
      cardJurnal,
    );

    const splitSection = el('div', { className: 'bo-acc-split' }, leftPanel, rightPanel);
    viewContainer.appendChild(splitSection);
    return viewContainer;
  }

  // --- TAB 5: Neraca Seimbang ---
  function renderBalanceSheetView(): HTMLElement {
    const viewContainer = el('div', { className: 'bo-act-view' });
    const bs = generateBalanceSheetStatement();

    // Panel Kiri: Aset
    const leftPanel = el(
      'div',
      { className: 'bo-panel bo-acc-main-panel' },
      el('h3', { className: 'bo-form-sec-title', text: 'Aset' }),
      el('h4', { className: 'bo-sec-sub', text: label('labelAsetLancar') }),
      ...bs.currentAssets.map((item) =>
        el(
          'div',
          { className: 'bo-report-line' },
          el('span', { text: item.label }),
          el('span', { text: formatRupiah(item.amount) }),
        ),
      ),
      el(
        'div',
        { className: 'bo-report-line is-subtotal' },
        el('strong', { text: 'Total Aset Lancar' }),
        el('strong', { text: formatRupiah(bs.totalCurrentAssets) }),
      ),
      el('h4', { className: 'bo-sec-sub', text: label('labelAsetTetap') }),
      ...bs.fixedAssets.map((item) =>
        el(
          'div',
          { className: 'bo-report-line' },
          el('span', { text: item.label }),
          el('span', { text: formatRupiah(item.amount) }),
        ),
      ),
      el(
        'div',
        { className: 'bo-report-highlight-bar bo-acc-bar-top' },
        el('strong', { text: label('labelTotalAset') }),
        el('strong', { text: formatRupiah(bs.totalAssets) }),
      ),
    );

    // Panel Kanan: Kewajiban dan Ekuitas
    const rightPanel = el(
      'div',
      { className: 'bo-panel bo-acc-main-panel' },
      el('h3', { className: 'bo-form-sec-title', text: 'Kewajiban dan Ekuitas' }),
      el('h4', { className: 'bo-sec-sub', text: label('labelKewajiban') }),
      ...bs.liabilities.map((item) =>
        el(
          'div',
          { className: 'bo-report-line' },
          el('span', { text: item.label }),
          el('span', { text: formatRupiah(item.amount) }),
        ),
      ),
      el(
        'div',
        { className: 'bo-report-line is-subtotal' },
        el('strong', { text: 'Total Kewajiban' }),
        el('strong', { text: formatRupiah(bs.totalLiabilities) }),
      ),
      el('h4', { className: 'bo-sec-sub', text: label('labelEkuitas') }),
      ...bs.equity.map((item) =>
        el(
          'div',
          { className: 'bo-report-line' },
          el('span', { text: item.label }),
          el('span', { text: formatRupiah(item.amount) }),
        ),
      ),
      el(
        'div',
        { className: 'bo-report-highlight-bar bo-acc-bar-top' },
        el('strong', { text: label('labelTotalKewajibanEkuitas') }),
        el('strong', { text: formatRupiah(bs.totalLiabilitiesAndEquity) }),
      ),
    );

    const splitSection = el('div', { className: 'bo-acc-split' }, leftPanel, rightPanel);

    // Banner Seimbang
    const balanceBanner = el(
      'div',
      { className: 'bo-balance-banner' },
      el('span', { className: 'bo-balance-banner__icon', text: 'OK' }),
      el('span', {
        className: 'bo-balance-banner__text',
        text: `Neraca seimbang: Total Aset sama dengan Total Kewajiban dan Ekuitas (${formatRupiah(bs.totalAssets)})`,
      }),
    );

    viewContainer.appendChild(splitSection);
    viewContainer.appendChild(balanceBanner);
    return viewContainer;
  }

  // --- EXPORT HANDLERS ---
  function handleExportExcel(): void {
    if (activeTab === 'jurnal') {
      const headers = [
        'No Jurnal',
        'Tanggal',
        'Sumber / Keterangan',
        'Akun Debit',
        'Akun Kredit',
        'Nominal',
        'Status',
      ];
      const rows = journalEntries.map((r) => [
        r.id,
        r.date,
        r.source,
        r.debitAccount,
        r.creditAccount,
        r.amount,
        r.status,
      ]);
      exportTableToCsv('Jurnal-Otomatis-Okt-2026', headers, rows);
    } else if (activeTab === 'beban') {
      const headers = [
        'ID',
        'Tanggal',
        'Kategori',
        'Keterangan',
        'Nominal',
        'Sumber Dana',
        'Status',
      ];
      const rows = expenseItems.map((e) => [
        e.id,
        e.date,
        e.category,
        e.description,
        e.amount,
        e.paidFrom,
        e.status,
      ]);
      exportTableToCsv('Beban-Operasional-Okt-2026', headers, rows);
    } else if (activeTab === 'arus-kas') {
      const cf = generateCashFlowStatement(expenseItems);
      const headers = ['Aktivitas / Akun', 'Nominal (Rp)'];
      const rows: (string | number)[][] = [
        ['Kas Awal Periode', cf.initialCash],
        ['Penerimaan dari pelanggan', 389_750_000],
        ['Pembayaran ke supplier', -234_300_000],
        ['Pembayaran beban operasional', -52_600_000],
        ['Kas bersih dari operasi', cf.netOperatingCash],
        ['Pembelian peralatan', -24_500_000],
        ['Penarikan pemilik (prive)', -35_000_000],
        ['Kenaikan Kas Bersih', cf.netCashChange],
        ['Kas Akhir Periode', cf.endingCash],
      ];
      exportTableToCsv('Arus-Kas-Okt-2026', headers, rows);
    } else if (activeTab === 'laba-rugi') {
      const pl = generateProfitLossStatement(undefined, expenseItems);
      const headers = ['Pos Laba Rugi', 'Nominal (Rp)'];
      const rows: (string | number)[][] = [
        ['Penjualan Bersih', pl.revenue.netSales],
        ['HPP (Average)', -pl.revenue.cogs],
        ['Laba Kotor', pl.revenue.grossProfit],
        ...pl.expenses.items.map((it) => [it.category, -it.amount]),
        ['Total Beban Operasional', -pl.expenses.totalExpense],
        ['Laba Bersih', pl.netProfit],
      ];
      exportTableToCsv('Laba-Rugi-Okt-2026', headers, rows);
    } else {
      const bs = generateBalanceSheetStatement();
      const headers = ['Pos Neraca', 'Nominal (Rp)'];
      const rows: (string | number)[][] = [
        ['Kas dan Bank', 238_400_000],
        ['Piutang Usaha', 86_450_000],
        ['Persediaan Barang', 1_284_500_000],
        ['Total Aset Lancar', bs.totalCurrentAssets],
        ['Peralatan dan Kendaraan', bs.totalFixedAssets],
        ['TOTAL ASET', bs.totalAssets],
        ['Utang Usaha', 64_200_000],
        ['Utang Lain-lain', 12_150_000],
        ['Total Kewajiban', bs.totalLiabilities],
        ['Modal Pemilik', 1_400_000_000],
        ['Laba Ditahan', 245_900_000],
        ['Laba Bersih Okt 2026', 72_100_000],
        ['Total Ekuitas', bs.totalEquity],
        ['TOTAL KEWAJIBAN DAN EKUITAS', bs.totalLiabilitiesAndEquity],
      ];
      exportTableToCsv('Neraca-Okt-2026', headers, rows);
    }

    showToast({ kind: 'success', text: 'File Excel (.xlsx/CSV) berhasil diunduh.' });
  }

  function handleExportPdf(): void {
    let reportTitle = 'JURNAL OTOMATIS';
    let columns: string[] = [];
    let rows: (string | number)[][] = [];

    if (activeTab === 'jurnal') {
      reportTitle = 'JURNAL OTOMATIS TRANSAKSI';
      columns = ['No Jurnal', 'Tanggal', 'Sumber / Keterangan', 'Debit', 'Kredit', 'Nominal'];
      rows = journalEntries.map((j) => [
        j.id,
        j.date,
        j.source,
        j.debitAccount,
        j.creditAccount,
        formatRupiah(j.amount),
      ]);
    } else if (activeTab === 'beban') {
      reportTitle = 'LAPORAN BEBAN OPERASIONAL';
      columns = ['Tanggal', 'Kategori', 'Keterangan', 'Sumber Dana', 'Nominal'];
      rows = expenseItems.map((e) => [
        e.date,
        e.category,
        e.description,
        e.paidFrom,
        formatRupiah(e.amount),
      ]);
    } else if (activeTab === 'arus-kas') {
      reportTitle = 'LAPORAN ARUS KAS (METODE LANGSUNG)';
      const cf = generateCashFlowStatement(expenseItems);
      columns = ['Aktivitas Arus Kas', 'Nominal'];
      rows = [
        ['Kas Awal Periode', formatRupiah(cf.initialCash)],
        ['Penerimaan dari pelanggan', 'Rp 389.750.000'],
        ['Pembayaran ke supplier', '-Rp 234.300.000'],
        ['Pembayaran beban operasional', '-Rp 52.600.000'],
        ['Kas Bersih dari Operasi', formatRupiah(cf.netOperatingCash)],
        ['Pembelian peralatan (Investasi)', '-Rp 24.500.000'],
        ['Penarikan prive pemilik (Pendanaan)', '-Rp 35.000.000'],
        ['Kenaikan Kas Bersih', formatRupiah(cf.netCashChange)],
        ['Kas Akhir Periode', formatRupiah(cf.endingCash)],
      ];
    } else if (activeTab === 'laba-rugi') {
      reportTitle = 'LAPORAN LABA RUGI';
      const pl = generateProfitLossStatement(undefined, expenseItems);
      columns = ['Pos Laba Rugi', 'Nominal'];
      rows = [
        ['Penjualan Bersih', formatRupiah(pl.revenue.netSales)],
        ['HPP (metode Average)', `(${formatRupiah(pl.revenue.cogs)})`],
        ['Laba Kotor (30,2%)', formatRupiah(pl.revenue.grossProfit)],
        ...pl.expenses.items.map((it) => [`Beban: ${it.category}`, `(${formatRupiah(it.amount)})`]),
        ['Total Beban Operasional', `(${formatRupiah(pl.expenses.totalExpense)})`],
        ['Laba Bersih (17,5%)', formatRupiah(pl.netProfit)],
      ];
    } else {
      reportTitle = 'LAPORAN NERACA KEUANGAN';
      const bs = generateBalanceSheetStatement();
      columns = ['Pos Neraca Keuangan', 'Nominal'];
      rows = [
        ['Kas dan Bank', formatRupiah(238_400_000)],
        ['Piutang Usaha', formatRupiah(86_450_000)],
        ['Persediaan Barang', formatRupiah(1_284_500_000)],
        ['Total Aset Lancar', formatRupiah(bs.totalCurrentAssets)],
        ['Peralatan dan Kendaraan', formatRupiah(bs.totalFixedAssets)],
        ['TOTAL ASET', formatRupiah(bs.totalAssets)],
        ['Utang Usaha', formatRupiah(64_200_000)],
        ['Utang Lain-lain', formatRupiah(12_150_000)],
        ['Total Kewajiban', formatRupiah(bs.totalLiabilities)],
        ['Modal Pemilik', formatRupiah(1_400_000_000)],
        ['Laba Ditahan', formatRupiah(245_900_000)],
        ['Laba Bersih Okt 2026', formatRupiah(72_100_000)],
        ['Total Ekuitas', formatRupiah(bs.totalEquity)],
        ['TOTAL KEWAJIBAN DAN EKUITAS', formatRupiah(bs.totalLiabilitiesAndEquity)],
      ];
    }

    openExportPreview({
      kind: 'pdf',
      title: reportTitle,
      columns,
      rows: rows.map((r) => r.map((c) => String(c))),
    });
  }

  // First render
  renderView();

  return {
    element: container,
    destroy: () => undefined,
  };
}
