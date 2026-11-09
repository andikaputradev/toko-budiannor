import { el } from '../../../shared/dom';
import { formatDate, formatRupiah, formatTime } from '../../../shared/format';
import { icon } from '../../../shared/icons';
import { label } from '../../../shared/messages';
import { createButton } from '../../../shared/ui/button';
import type { BoSession } from '../bo-session';
import { createDonutChart, createLineChart } from '../dashboard-charts';
import { computeFullDashboard, type FullDashboardData } from '../domain/dashboard';
import type { ScreenHandle } from './login';

export function renderDashboard(session: BoSession, go: (path: string) => void): ScreenHandle {
  const store = session.store;
  const container = el('div', { className: 'bo-dash-container' });

  let omzetTab: 'harian' | 'bulanan' = 'harian';
  let chartTab: 'harian' | 'bulanan' = 'harian';
  let labaTab: 'harian' | 'bulanan' = 'harian';
  let bebanTab: 'harian' | 'bulanan' = 'harian';

  const tabToggle = (
    active: 'harian' | 'bulanan',
    onSelect: (tab: 'harian' | 'bulanan') => void,
  ): HTMLElement => {
    const dailyBtn = el(
      'button',
      {
        className: `bo-tab-btn ${active === 'harian' ? 'bo-tab-btn--active' : ''}`,
        attrs: { type: 'button' },
      },
      el('span', { text: label('omsetHarian') }),
    );
    const monthlyBtn = el(
      'button',
      {
        className: `bo-tab-btn ${active === 'bulanan' ? 'bo-tab-btn--active' : ''}`,
        attrs: { type: 'button' },
      },
      el('span', { text: label('omsetBulanan') }),
    );
    dailyBtn.addEventListener('click', () => {
      onSelect('harian');
    });
    monthlyBtn.addEventListener('click', () => {
      onSelect('bulanan');
    });
    return el('div', { className: 'bo-tab-group' }, dailyBtn, monthlyBtn);
  };

  const paint = (): void => {
    const role = store.getState().role;
    const data: FullDashboardData = computeFullDashboard(store.getState(), session.now(), role);

    // 1. Header Ringkasan
    const headerEl = el(
      'div',
      { className: 'bo-dash-header' },
      el(
        'div',
        { className: 'bo-dash-header__titles' },
        el('h2', { className: 'bo-dash-header__title', text: label('menuDashboard') }),
        el('p', {
          className: 'bo-dash-header__sub',
          text: `Ringkasan operasional hari ini · Diperbarui ${formatDate(session.now())}, ${formatTime(session.now())} WIB`,
        }),
      ),
    );

    // 2. Baris 1: Omset, Grafik Penjualan, Kegiatan Mendatang (3 Kolom)
    const omsetInfo =
      omzetTab === 'harian' ? data.omset.dailyBreakdown : data.omset.monthlyBreakdown;
    const omsetTitle =
      omzetTab === 'harian' ? label('omsetHariIniJudul') : label('omsetBulanIniJudul');

    const omsetCard = el(
      'section',
      { className: 'bo-widget bo-widget--omset' },
      el(
        'div',
        { className: 'bo-widget__header' },
        el(
          'div',
          { className: 'bo-widget__title-wrap' },
          icon('wallet'),
          el('h3', { className: 'bo-widget__title', text: label('omsetSingkat') }),
          el('span', {
            className: 'bo-badge bo-badge--positive',
            text: `+${omsetInfo.trendPercent}%`,
          }),
        ),
        tabToggle(omzetTab, (t) => {
          omzetTab = t;
          paint();
        }),
      ),
      el(
        'div',
        { className: 'bo-widget__body' },
        el('p', { className: 'bo-stat-caption', text: omsetTitle }),
        el('div', { className: 'bo-stat-main-number', text: formatRupiah(omsetInfo.current) }),
        el(
          'div',
          { className: 'bo-stat-subgrid' },
          el(
            'div',
            { className: 'bo-stat-subitem' },
            el('span', { className: 'bo-stat-sublabel', text: 'Total' }),
            el('strong', { className: 'bo-stat-subvalue', text: formatRupiah(omsetInfo.total) }),
          ),
          el(
            'div',
            { className: 'bo-stat-subitem' },
            el('span', { className: 'bo-stat-sublabel', text: label('totalTransaksiNilai') }),
            el('strong', { className: 'bo-stat-subvalue', text: `${omsetInfo.count} Kali` }),
          ),
          el(
            'div',
            { className: 'bo-stat-subitem' },
            el('span', { className: 'bo-stat-sublabel', text: label('rataRataTransaksi') }),
            el('strong', { className: 'bo-stat-subvalue', text: formatRupiah(omsetInfo.average) }),
          ),
        ),
      ),
    );

    const chartPoints = chartTab === 'harian' ? data.chartSeries.daily : data.chartSeries.monthly;
    const chartCard = el(
      'section',
      { className: 'bo-widget bo-widget--chart' },
      el(
        'div',
        { className: 'bo-widget__header' },
        el(
          'div',
          { className: 'bo-widget__title-wrap' },
          icon('trending-up'),
          el('h3', { className: 'bo-widget__title', text: 'Grafik Penjualan' }),
        ),
        tabToggle(chartTab, (t) => {
          chartTab = t;
          paint();
        }),
      ),
      el(
        'div',
        { className: 'bo-widget__body' },
        createLineChart(chartPoints, 380, 130),
        el('p', { className: 'bo-chart-subtext', text: data.chartSeries.trendText }),
      ),
    );

    const eventsCard = el(
      'section',
      { className: 'bo-widget bo-widget--events' },
      el(
        'div',
        { className: 'bo-widget__header' },
        el(
          'div',
          { className: 'bo-widget__title-wrap' },
          icon('calendar'),
          el('h3', { className: 'bo-widget__title', text: label('kegiatanMendatangJudul') }),
        ),
      ),
      el(
        'div',
        { className: 'bo-widget__body bo-events-list' },
        ...data.upcomingEvents.map((evt) =>
          el(
            'div',
            { className: 'bo-event-row' },
            el('span', { className: 'bo-event-date-chip', text: evt.dateText }),
            el(
              'div',
              { className: 'bo-event-info' },
              el('strong', { className: 'bo-event-code', text: evt.code }),
              el('span', {
                className: 'bo-event-desc',
                text: `Jatuh Tempo ${evt.type === 'utang' ? 'Utang' : 'Piutang'} · ${evt.name}`,
              }),
            ),
          ),
        ),
      ),
    );

    const row1 = el(
      'div',
      { className: 'bo-dash-grid bo-dash-grid--row1' },
      omsetCard,
      chartCard,
      eventsCard,
    );

    // 3. Baris 2: Laba, Beban, Aset saat ini, Stok Minim (4 Kolom untuk Owner)
    // Widget Laba
    const labaInfo = labaTab === 'harian' ? data.profit.daily : data.profit.monthly;
    const labaCard = el(
      'section',
      { className: 'bo-widget bo-widget--finance' },
      el(
        'div',
        { className: 'bo-widget__header' },
        el(
          'div',
          { className: 'bo-widget__title-wrap' },
          icon('trending-up'),
          el('h3', { className: 'bo-widget__title', text: label('labaJudul') }),
        ),
        tabToggle(labaTab, (t) => {
          labaTab = t;
          paint();
        }),
      ),
      el(
        'div',
        { className: 'bo-widget__body bo-finance-body' },
        el(
          'div',
          { className: 'bo-donut-center-wrap' },
          createDonutChart([
            {
              label: 'Pendapatan',
              value: labaInfo.pendapatan,
              color: 'var(--color-accent-default)',
            },
            { label: 'HPP', value: labaInfo.nilaiHpp, color: 'var(--primitive-color-amber-800)' },
            {
              label: 'Pengeluaran',
              value: labaInfo.pengeluaran,
              color: 'var(--primitive-color-ink-600)',
            },
          ]),
          el(
            'div',
            { className: 'bo-finance-headline' },
            el('span', { className: 'bo-stat-caption', text: label('labaJudul') }),
            el('strong', { className: 'bo-finance-number', text: formatRupiah(labaInfo.laba) }),
          ),
        ),
        el(
          'div',
          { className: 'bo-legend-list' },
          el(
            'div',
            { className: 'bo-legend-item' },
            el('span', {
              className: 'bo-legend-dot',
              attrs: { style: 'background: var(--color-accent-default)' },
            }),
            el('span', { className: 'bo-legend-label', text: label('pendapatan') }),
            el('strong', { className: 'bo-legend-val', text: formatRupiah(labaInfo.pendapatan) }),
          ),
          el(
            'div',
            { className: 'bo-legend-item' },
            el('span', {
              className: 'bo-legend-dot',
              attrs: { style: 'background: var(--primitive-color-amber-800)' },
            }),
            el('span', { className: 'bo-legend-label', text: label('nilaiHpp') }),
            el('strong', { className: 'bo-legend-val', text: formatRupiah(labaInfo.nilaiHpp) }),
          ),
          el(
            'div',
            { className: 'bo-legend-item' },
            el('span', {
              className: 'bo-legend-dot',
              attrs: { style: 'background: var(--primitive-color-ink-600)' },
            }),
            el('span', { className: 'bo-legend-label', text: label('pengeluaran') }),
            el('strong', { className: 'bo-legend-val', text: formatRupiah(labaInfo.pengeluaran) }),
          ),
        ),
      ),
    );

    // Widget Beban
    const bebanInfo = bebanTab === 'harian' ? data.expense.daily : data.expense.monthly;
    const bebanCard = el(
      'section',
      { className: 'bo-widget bo-widget--finance' },
      el(
        'div',
        { className: 'bo-widget__header' },
        el(
          'div',
          { className: 'bo-widget__title-wrap' },
          icon('wallet'),
          el('h3', { className: 'bo-widget__title', text: label('bebanJudul') }),
        ),
        tabToggle(bebanTab, (t) => {
          bebanTab = t;
          paint();
        }),
      ),
      el(
        'div',
        { className: 'bo-widget__body bo-finance-body' },
        el(
          'div',
          { className: 'bo-donut-center-wrap' },
          createDonutChart([
            {
              label: 'Gaji',
              value: bebanInfo.bebanGaji,
              color: 'var(--primitive-color-night-800)',
            },
            {
              label: 'Operasional',
              value: bebanInfo.bebanOperasional,
              color: 'var(--color-accent-default)',
            },
          ]),
          el(
            'div',
            { className: 'bo-finance-headline' },
            el('span', { className: 'bo-stat-caption', text: label('bebanJudul') }),
            el('strong', { className: 'bo-finance-number', text: formatRupiah(bebanInfo.beban) }),
          ),
        ),
        el(
          'div',
          { className: 'bo-legend-list' },
          el(
            'div',
            { className: 'bo-legend-item' },
            el('span', {
              className: 'bo-legend-dot',
              attrs: { style: 'background: var(--primitive-color-night-800)' },
            }),
            el('span', { className: 'bo-legend-label', text: label('bebanGaji') }),
            el('strong', { className: 'bo-legend-val', text: formatRupiah(bebanInfo.bebanGaji) }),
          ),
          el(
            'div',
            { className: 'bo-legend-item' },
            el('span', {
              className: 'bo-legend-dot',
              attrs: { style: 'background: var(--color-accent-default)' },
            }),
            el('span', { className: 'bo-legend-label', text: label('bebanOperasionalSingkat') }),
            el('strong', {
              className: 'bo-legend-val',
              text: formatRupiah(bebanInfo.bebanOperasional),
            }),
          ),
        ),
      ),
    );

    // Widget Aset Saat Ini
    const asetCard = el(
      'section',
      { className: 'bo-widget bo-widget--asset' },
      el(
        'div',
        { className: 'bo-widget__header' },
        el(
          'div',
          { className: 'bo-widget__title-wrap' },
          icon('banknote'),
          el('h3', { className: 'bo-widget__title', text: label('asetSaatIniJudul') }),
        ),
      ),
      el(
        'div',
        { className: 'bo-widget__body' },
        el('div', { className: 'bo-stat-caption', text: 'Total Aset' }),
        el('div', { className: 'bo-asset-total-number', text: formatRupiah(data.assets.total) }),
        el(
          'div',
          { className: 'bo-progress-stack' },
          el('div', {
            className: 'bo-progress-stack__bar bo-progress--kas',
            attrs: { style: `width: ${data.assets.percentKas}%` },
          }),
          el('div', {
            className: 'bo-progress-stack__bar bo-progress--piutang',
            attrs: { style: `width: ${data.assets.percentPiutang}%` },
          }),
          el('div', {
            className: 'bo-progress-stack__bar bo-progress--stok',
            attrs: { style: `width: ${data.assets.percentStok}%` },
          }),
        ),
        el(
          'div',
          { className: 'bo-legend-list bo-asset-legend' },
          el(
            'div',
            { className: 'bo-legend-item' },
            el('span', { className: 'bo-legend-dot bo-dot--kas' }),
            el('span', { className: 'bo-legend-label', text: label('labelKas') }),
            el('strong', { className: 'bo-legend-val', text: formatRupiah(data.assets.kas) }),
          ),
          el(
            'div',
            { className: 'bo-legend-item' },
            el('span', { className: 'bo-legend-dot bo-dot--piutang' }),
            el('span', { className: 'bo-legend-label', text: label('labelPiutang') }),
            el('strong', { className: 'bo-legend-val', text: formatRupiah(data.assets.piutang) }),
          ),
          el(
            'div',
            { className: 'bo-legend-item' },
            el('span', { className: 'bo-legend-dot bo-dot--stok' }),
            el('span', { className: 'bo-legend-label', text: label('labelStok') }),
            el('strong', { className: 'bo-legend-val', text: formatRupiah(data.assets.stok) }),
          ),
        ),
      ),
    );

    const btnLihatSemua = createButton({
      variant: 'secondary',
      text: label('lihatSemua'),
      onClick: () => {
        go('/bo/stok');
      },
    });
    btnLihatSemua.classList.add('is-btn-sm');

    // Widget Stok Minim
    const stokMinimCard = el(
      'section',
      { className: 'bo-widget bo-widget--stok' },
      el(
        'div',
        { className: 'bo-widget__header' },
        el(
          'div',
          { className: 'bo-widget__title-wrap' },
          icon('triangle-alert'),
          el('h3', { className: 'bo-widget__title', text: label('daftarStokMinimJudul') }),
        ),
        btnLihatSemua,
      ),
      el(
        'div',
        { className: 'bo-widget__body bo-rank-list' },
        ...data.lowStockItems.map((item) =>
          el(
            'div',
            { className: 'bo-rank-row' },
            el('span', { className: 'bo-rank-dot bo-rank-dot--danger' }),
            el('span', { className: 'bo-rank-name', text: item.name }),
            el('span', {
              className: `bo-badge ${item.remaining === 0 ? 'bo-badge--danger' : 'bo-badge--warning'}`,
              text: `sisa=${item.remaining}`,
            }),
          ),
        ),
      ),
    );

    // 4. Baris 3: Monitoring HPP, Penjualan Barang, Penjualan Pelanggan, Pelanggan Berhutang
    // Widget Monitoring HPP
    const hppCard = el(
      'section',
      { className: 'bo-widget bo-widget--hpp' },
      el(
        'div',
        { className: 'bo-widget__header' },
        el(
          'div',
          { className: 'bo-widget__title-wrap' },
          icon('triangle-alert'),
          el('h3', { className: 'bo-widget__title', text: label('monitoringHppJudul') }),
        ),
      ),
      el(
        'div',
        { className: 'bo-widget__body bo-rank-list' },
        ...data.hppMonitoring.map((item) =>
          el(
            'div',
            { className: 'bo-rank-row' },
            el(
              'div',
              { className: 'bo-rank-details' },
              el('strong', { className: 'bo-rank-name', text: item.name }),
              el('span', {
                className: 'bo-rank-sub',
                text: `${formatRupiah(item.hpp)} vs ${formatRupiah(item.price)}`,
              }),
            ),
            el('span', { className: 'bo-badge bo-badge--danger', text: `${item.percent}%` }),
          ),
        ),
      ),
    );

    // Widget Penjualan Barang
    const barangCard = el(
      'section',
      { className: 'bo-widget bo-widget--rank' },
      el(
        'div',
        { className: 'bo-widget__header' },
        el(
          'div',
          { className: 'bo-widget__title-wrap' },
          icon('shopping-cart'),
          el('h3', { className: 'bo-widget__title', text: label('penjualanBarangJudul') }),
        ),
      ),
      el(
        'div',
        { className: 'bo-widget__body bo-rank-list' },
        ...data.topProducts.map((item) =>
          el(
            'div',
            { className: 'bo-rank-item' },
            el(
              'div',
              { className: 'bo-rank-row' },
              el(
                'div',
                { className: 'bo-rank-details' },
                el('strong', { className: 'bo-rank-name', text: item.name }),
                el('span', { className: 'bo-rank-sub', text: formatRupiah(item.amount) }),
              ),
              el('span', { className: 'bo-badge bo-badge--neutral', text: `${item.percent}%` }),
            ),
            el(
              'div',
              { className: 'bo-mini-progress' },
              el('div', {
                className: 'bo-mini-progress__bar',
                attrs: { style: `width: ${item.percent}%` },
              }),
            ),
          ),
        ),
      ),
    );

    // Widget Penjualan Pelanggan
    const pelangganCard = el(
      'section',
      { className: 'bo-widget bo-widget--rank' },
      el(
        'div',
        { className: 'bo-widget__header' },
        el(
          'div',
          { className: 'bo-widget__title-wrap' },
          icon('users'),
          el('h3', { className: 'bo-widget__title', text: label('penjualanPelangganJudul') }),
        ),
      ),
      el(
        'div',
        { className: 'bo-widget__body bo-rank-list' },
        ...data.topCustomers.map((item) =>
          el(
            'div',
            { className: 'bo-rank-item' },
            el(
              'div',
              { className: 'bo-rank-row' },
              el(
                'div',
                { className: 'bo-rank-details' },
                el('strong', { className: 'bo-rank-name', text: item.name }),
                el('span', { className: 'bo-rank-sub', text: formatRupiah(item.amount) }),
              ),
              el('span', { className: 'bo-badge bo-badge--neutral', text: `${item.percent}%` }),
            ),
            el(
              'div',
              { className: 'bo-mini-progress' },
              el('div', {
                className: 'bo-mini-progress__bar',
                attrs: { style: `width: ${item.percent}%` },
              }),
            ),
          ),
        ),
      ),
    );

    // Widget Pelanggan Berhutang
    const hutangCard = el(
      'section',
      { className: 'bo-widget bo-widget--debt' },
      el(
        'div',
        { className: 'bo-widget__header' },
        el(
          'div',
          { className: 'bo-widget__title-wrap' },
          icon('triangle-alert'),
          el('h3', { className: 'bo-widget__title', text: label('pelangganBerhutangJudul') }),
        ),
      ),
      el(
        'div',
        { className: 'bo-widget__body bo-rank-list' },
        ...data.overdueCustomers.map((item) => {
          const barWidth = Math.min(100, Math.max(10, Math.round((item.overdueDays / 140) * 100)));
          return el(
            'div',
            { className: 'bo-rank-item' },
            el(
              'div',
              { className: 'bo-rank-row' },
              el('strong', { className: 'bo-rank-name', text: item.name }),
              el('span', {
                className: 'bo-badge bo-badge--danger',
                text: `${item.overdueDays} Hari`,
              }),
            ),
            el(
              'div',
              { className: 'bo-mini-progress' },
              el('div', {
                className: 'bo-mini-progress__bar bo-mini-progress__bar--danger',
                attrs: { style: `width: ${barWidth}%` },
              }),
            ),
          );
        }),
      ),
    );

    // Susun grid sesuai role Owner vs Staff
    if (data.isOwner) {
      const row2 = el(
        'div',
        { className: 'bo-dash-grid bo-dash-grid--row2' },
        labaCard,
        bebanCard,
        asetCard,
        stokMinimCard,
      );
      const row3 = el(
        'div',
        { className: 'bo-dash-grid bo-dash-grid--row3' },
        hppCard,
        barangCard,
        pelangganCard,
        hutangCard,
      );
      container.replaceChildren(headerEl, row1, row2, row3);
    } else {
      // Tampilan Staff: Tanpa widget finansial sensitif
      const staffRow2 = el(
        'div',
        { className: 'bo-dash-grid bo-dash-grid--row1' },
        barangCard,
        pelangganCard,
        stokMinimCard,
      );
      container.replaceChildren(headerEl, row1, staffRow2);
    }
  };

  const unsubscribe = store.subscribe(paint);
  paint();

  return {
    element: container,
    destroy: () => {
      unsubscribe();
    },
  };
}
