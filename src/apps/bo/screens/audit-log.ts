import { el } from '../../../shared/dom';
import { label } from '../../../shared/messages';
import { createButton } from '../../../shared/ui/button';
import { showToast } from '../../../shared/ui/toast';
import type { BoSession } from '../bo-session';
import type { ScreenHandle } from './login';
import { DEFAULT_AUDIT_LOGS, filterAuditLogs, type AuditLogEntry } from '../domain/settings-rbac';
import { exportTableToCsv } from '../domain/accounting';
import { openExportPreview } from '../export-preview';

export function renderAuditLogScreen(session: BoSession, go: (path: string) => void): ScreenHandle {
  const boState = session.state();
  const currentRole = session.store.getState().role;
  const currentEntry: AuditLogEntry = {
    id: 'log-active-1',
    timestamp: '2026-10-19 14:00:00',
    username: boState.user ? boState.user.name : 'H. Budiannor',
    role: currentRole,
    module: 'BO-22 Pengaturan',
    action: 'Tinjau Log Sistem',
    details: 'Membuka dan memfilter riwayat audit trail toko',
    ipAddress: '192.168.1.20',
    status: 'sukses',
  };
  const logs: AuditLogEntry[] = [currentEntry, ...DEFAULT_AUDIT_LOGS];

  let usernameFilter = 'semua';
  let moduleFilter = 'semua';
  let statusFilter = 'semua';
  let searchQuery = '';

  const container = el('div', { className: 'bo-form-page' });

  // Top Bar
  const titleBlock = el(
    'div',
    {},
    el('h1', { className: 'bo-page-title', text: 'Log Aktivitas Pengguna (Audit Trail)' }),
    el('p', {
      className: 't-label',
      attrs: { style: 'margin: 2px 0 0 0;' },
      text: 'Rekam jejak seluruh aktivitas transaksi, otorisasi, mutasi, dan backup sistem untuk audit internal',
    }),
  );

  const btnExportPdf = createButton({
    text: label('eksporPdf'),
    variant: 'secondary',
    icon: 'printer',
    onClick: handleExportPdf,
  });

  const btnExportExcel = createButton({
    text: label('eksporExcelXlsx'),
    variant: 'primary',
    icon: 'download',
    onClick: handleExportExcel,
  });

  const btnBack = createButton({
    text: label('kembaliKeDashboard'),
    variant: 'secondary',
    onClick: () => {
      go('/bo/dashboard');
    },
  });

  const topBar = el(
    'div',
    { className: 'bo-toolbar' },
    el('div', { className: 'bo-toolbar__left' }, titleBlock),
    el('div', { className: 'bo-toolbar__right' }, btnBack, btnExportPdf, btnExportExcel),
  );

  // Filter Bar
  const searchInput = el('input', {
    className: 'input is-search',
    attrs: { type: 'search', placeholder: 'Cari aktivitas, pengguna, rincian...' },
  });

  const userSelect = el('select', { className: 'input is-select' });
  [
    { value: 'semua', text: 'Semua Pengguna' },
    { value: 'owner', text: 'H. Budiannor (Owner)' },
    { value: 'spv_rahman', text: 'M. Rahman (Supervisor)' },
    { value: 'kasir_siti', text: 'Siti Aminah (Kasir)' },
    { value: 'pramuniaga_dani', text: 'Dani (Frontliner)' },
    { value: 'system', text: 'System (Otomatis)' },
  ].forEach((u) => {
    userSelect.appendChild(el('option', { text: u.text, attrs: { value: u.value } }));
  });

  const moduleSelect = el('select', { className: 'input is-select' });
  [
    { value: 'semua', text: 'Semua Modul' },
    { value: 'Kasir POS', text: 'Kasir POS' },
    { value: 'Penjualan', text: 'Penjualan & Piutang' },
    { value: 'Mutasi Stok', text: 'Mutasi Stok' },
    { value: 'Beban Operasional', text: 'Beban Operasional' },
    { value: 'Akuntansi', text: 'Akuntansi & Laporan' },
    { value: 'Sistem', text: 'Sistem & Backup' },
  ].forEach((m) => {
    moduleSelect.appendChild(el('option', { text: m.text, attrs: { value: m.value } }));
  });

  const statusSelect = el('select', { className: 'input is-select' });
  [
    { value: 'semua', text: 'Semua Status' },
    { value: 'sukses', text: 'Sukses' },
    { value: 'peringatan', text: 'Peringatan' },
    { value: 'ditolak', text: 'Ditolak' },
  ].forEach((s) => {
    statusSelect.appendChild(el('option', { text: s.text, attrs: { value: s.value } }));
  });

  const filterBar = el(
    'div',
    { className: 'bo-panel bo-filter-bar', attrs: { style: 'flex-wrap: wrap;' } },
    el('div', { attrs: { style: 'flex: 1 1 200px;' } }, searchInput),
    el('div', { attrs: { style: 'width: 170px;' } }, userSelect),
    el('div', { attrs: { style: 'width: 170px;' } }, moduleSelect),
    el('div', { attrs: { style: 'width: 140px;' } }, statusSelect),
  );

  // Table
  const tableTbody = el('tbody', {});

  function refreshTable(): void {
    tableTbody.replaceChildren();

    const filtered = filterAuditLogs(logs, {
      username: usernameFilter,
      module: moduleFilter,
      status: statusFilter,
      searchQuery,
    });

    if (filtered.length === 0) {
      tableTbody.appendChild(
        el(
          'tr',
          {},
          el('td', {
            attrs: { colspan: '7' },
            className: 'bo-empty-cell',
            text: 'Tidak ada log aktivitas yang cocok dengan kriteria filter.',
          }),
        ),
      );
      return;
    }

    filtered.forEach((log) => {
      let statusBadgeClass = 'is-lunas';
      let statusText = 'SUKSES';
      if (log.status === 'ditolak') {
        statusBadgeClass = 'is-danger';
        statusText = 'DITOLAK';
      } else if (log.status === 'peringatan') {
        statusBadgeClass = 'is-warning';
        statusText = 'PERINGATAN';
      }

      tableTbody.appendChild(
        el(
          'tr',
          {},
          el('td', {}, el('span', { className: 't-label', text: log.timestamp })),
          el(
            'td',
            {},
            el('strong', { text: log.username }),
            el('span', {
              className: 't-label',
              attrs: { style: 'display: block;' },
              text: log.role.toUpperCase(),
            }),
          ),
          el('td', {}, el('span', { className: 'bo-badge is-toko', text: log.module })),
          el('td', {}, el('strong', { text: log.action })),
          el('td', { text: log.details }),
          el('td', { text: log.ipAddress }),
          el(
            'td',
            { className: 'is-center' },
            el('span', { className: `bo-badge ${statusBadgeClass}`, text: statusText }),
          ),
        ),
      );
    });
  }

  // Event Handlers
  searchInput.addEventListener('input', () => {
    searchQuery = searchInput.value.trim();
    refreshTable();
  });
  userSelect.addEventListener('change', () => {
    usernameFilter = userSelect.value;
    refreshTable();
  });
  moduleSelect.addEventListener('change', () => {
    moduleFilter = moduleSelect.value;
    refreshTable();
  });
  statusSelect.addEventListener('change', () => {
    statusFilter = statusSelect.value;
    refreshTable();
  });

  function handleExportExcel(): void {
    const headers = [
      'Waktu',
      'Pengguna',
      'Peran',
      'Modul',
      'Tindakan / Aksi',
      'Rincian',
      'IP Address',
      'Status',
    ];
    const rows = logs.map((l) => [
      l.timestamp,
      l.username,
      l.role,
      l.module,
      l.action,
      l.details,
      l.ipAddress,
      l.status,
    ]);
    exportTableToCsv('Audit-Trail-Toko-Budiannor-Okt-2026', headers, rows);
    showToast({ kind: 'success', text: 'File Excel Audit Trail berhasil diunduh.' });
  }

  function handleExportPdf(): void {
    const columns = ['Waktu', 'Pengguna', 'Modul', 'Aksi', 'Detail Transaksi', 'Status'];
    const rows = logs.map((l) => [
      l.timestamp,
      `${l.username} (${l.role})`,
      l.module,
      l.action,
      l.details,
      l.status.toUpperCase(),
    ]);
    openExportPreview({
      kind: 'pdf',
      title: 'LOG AKTIVITAS SISTEM & AUDIT TRAIL',
      columns,
      rows,
    });
  }

  refreshTable();

  const tablePanel = el(
    'div',
    { className: 'bo-panel', attrs: { style: 'margin-top: 14px; overflow-x: auto;' } },
    el(
      'table',
      { className: 'pos-table is-compact' },
      el(
        'thead',
        {},
        el(
          'tr',
          {},
          el('th', { text: 'Waktu' }),
          el('th', { text: 'Pengguna' }),
          el('th', { text: 'Modul' }),
          el('th', { text: 'Aksi / Tindakan' }),
          el('th', { text: 'Rincian Transaksi' }),
          el('th', { text: 'Alamat IP' }),
          el('th', { className: 'is-center', text: 'Status' }),
        ),
      ),
      tableTbody,
    ),
  );

  container.appendChild(topBar);
  container.appendChild(filterBar);
  container.appendChild(tablePanel);

  return {
    element: container,
    destroy: () => undefined,
  };
}
