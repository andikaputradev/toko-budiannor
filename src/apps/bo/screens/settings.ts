import { el } from '../../../shared/dom';
import { label } from '../../../shared/messages';
import { createButton } from '../../../shared/ui/button';
import { openModal } from '../../../shared/ui/modal';
import { showToast } from '../../../shared/ui/toast';
import type { BoSession } from '../bo-session';
import type { ScreenHandle } from './login';
import { DEFAULT_STORE_PROFILE, type StoreProfile } from '../domain/settings-rbac';

export type SettingsTab = 'profil' | 'rekening' | 'printer' | 'backup';

export function renderSettingsScreen(
  _session: BoSession,
  _go: (path: string) => void,
  initialTab: SettingsTab = 'profil',
): ScreenHandle {
  let activeTab: SettingsTab = initialTab;
  const profile: StoreProfile = { ...DEFAULT_STORE_PROFILE };

  const container = el('div', { className: 'bo-form-page' });

  function renderView(): void {
    container.replaceChildren();

    // Top Bar
    const subtitle = 'Kelola identitas usaha, rekening bank, printer kasir, dan backup database';
    const titleBlock = el(
      'div',
      {},
      el('h1', { className: 'bo-page-title', text: 'Pengaturan Profil Toko & Sistem' }),
      el('p', { className: 't-label bo-acc-sub', attrs: { title: subtitle }, text: subtitle }),
    );

    const tabs: { key: SettingsTab; text: string }[] = [
      { key: 'profil', text: 'Profil Toko' },
      { key: 'rekening', text: 'No. Rekening Toko' },
      { key: 'printer', text: 'Printer & Hardware' },
      { key: 'backup', text: 'Auto Backup Cloud' },
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

    const btnSimpan = createButton({
      text: 'Simpan Pengaturan',
      variant: 'primary',
      icon: 'check',
      onClick: () => {
        showToast({
          kind: 'success',
          text: 'Pengaturan toko dan perangkat berhasil diperbarui.',
        });
      },
    });

    const topBar = el(
      'div',
      { className: 'bo-toolbar' },
      el('div', { className: 'bo-toolbar__left bo-acc-toolbar-left' }, titleBlock, tabSwitcher),
      el('div', { className: 'bo-toolbar__right' }, btnSimpan),
    );

    container.appendChild(topBar);

    // Body by Tab
    if (activeTab === 'profil') {
      container.appendChild(renderProfileTab());
    } else if (activeTab === 'rekening') {
      container.appendChild(renderBankAccountsTab());
    } else if (activeTab === 'printer') {
      container.appendChild(renderPrinterTab());
    } else {
      container.appendChild(renderBackupTab());
    }
  }

  // --- TAB 1: Profil Toko ---
  function renderProfileTab(): HTMLElement {
    const card = el('div', { className: 'bo-panel' });
    card.appendChild(
      el('h3', { className: 'bo-form-sec-title', text: 'Identitas Usaha & Struk Kasir' }),
    );

    const nameInput = el('input', {
      className: 'input',
      attrs: { type: 'text', value: profile.name },
    });
    const taglineInput = el('input', {
      className: 'input',
      attrs: { type: 'text', value: profile.tagline },
    });
    const addressInput = el('input', {
      className: 'input',
      attrs: { type: 'text', value: profile.address },
    });
    const phoneInput = el('input', {
      className: 'input',
      attrs: { type: 'text', value: profile.phone },
    });
    const npwpInput = el('input', {
      className: 'input',
      attrs: { type: 'text', value: profile.npwp },
    });
    const footerInput = el('textarea', {
      className: 'input bo-footer-input',
      attrs: { rows: '3' },
      text: profile.receiptFooter,
    });

    const grid = el(
      'div',
      { className: 'bo-form-meta-grid bo-form-meta-grid--two' },
      el(
        'div',
        { className: 'field' },
        el('label', { className: 'field__label', text: 'Nama Usaha Toko *' }),
        nameInput,
      ),
      el(
        'div',
        { className: 'field' },
        el('label', { className: 'field__label', text: 'Slogan / Deskripsi Bisnis' }),
        taglineInput,
      ),
      el(
        'div',
        { className: 'field' },
        el('label', { className: 'field__label', text: 'Alamat Toko Lengkap *' }),
        addressInput,
      ),
      el(
        'div',
        { className: 'field' },
        el('label', { className: 'field__label', text: 'Nomor Telepon / WhatsApp Toko *' }),
        phoneInput,
      ),
      el(
        'div',
        { className: 'field' },
        el('label', { className: 'field__label', text: 'Nomor Pokok Wajib Pajak (NPWP)' }),
        npwpInput,
      ),
      el(
        'div',
        { className: 'field' },
        el('label', { className: 'field__label', text: 'Kota / Wilayah Layanan' }),
        el('input', {
          className: 'input',
          attrs: { type: 'text', value: 'Banjarbaru, Kalimantan Selatan' },
        }),
      ),
    );

    const fullField = el(
      'div',
      { className: 'field bo-field-gap-top' },
      el('label', {
        className: 'field__label',
        text: 'Catatan Kaki Struk Kasir POS (Receipt Footer)',
      }),
      footerInput,
    );

    card.appendChild(grid);
    card.appendChild(fullField);
    return card;
  }

  // --- TAB 2: Rekening Bank ---
  function renderBankAccountsTab(): HTMLElement {
    const card = el('div', { className: 'bo-panel' });
    card.appendChild(
      el(
        'div',
        { className: 'bo-split-right-header' },
        el('h3', {
          className: 'bo-form-sec-title',
          text: 'Daftar Nomor Rekening Toko (Transfer Bank)',
        }),
        createButton({
          text: 'Tambah Rekening',
          variant: 'secondary',
          icon: 'plus',
          onClick: () => {
            showToast({ kind: 'info', text: 'Form tambah rekening baru.' });
          },
        }),
      ),
    );

    const tbody = el('tbody', {});
    profile.bankAccounts.forEach((acc, i) => {
      tbody.appendChild(
        el(
          'tr',
          {},
          el('td', { text: String(i + 1) }),
          el('td', {}, el('strong', { className: 'bo-text-primary', text: acc.bankName })),
          el('td', { className: 'is-bold', text: acc.accountNumber }),
          el('td', { text: acc.accountHolder }),
          el(
            'td',
            { className: 'is-center' },
            el('span', { className: 'bo-badge is-lunas', text: 'Aktif' }),
          ),
          el(
            'td',
            { className: 'is-center' },
            createButton({
              text: 'Hapus',
              variant: 'danger',
              onClick: () => {
                showToast({ kind: 'info', text: `Rekening ${acc.bankName} dihapus.` });
              },
            }),
          ),
        ),
      );
    });

    const table = el(
      'table',
      { className: 'pos-table is-compact' },
      el(
        'thead',
        {},
        el(
          'tr',
          {},
          el('th', { text: 'No' }),
          el('th', { text: 'Nama Bank' }),
          el('th', { text: 'Nomor Rekening' }),
          el('th', { text: 'Atas Nama (Pemilik Rekening)' }),
          el('th', { className: 'is-center', text: 'Status' }),
          el('th', { className: 'is-center', text: 'Aksi' }),
        ),
      ),
      tbody,
    );

    card.appendChild(table);
    return card;
  }

  // --- TAB 3: Printer & Hardware ---
  function renderPrinterTab(): HTMLElement {
    const card = el('div', { className: 'bo-panel' });
    card.appendChild(
      el('h3', { className: 'bo-form-sec-title', text: 'Konfigurasi Printer Thermal & Laci Kas' }),
    );

    const printerSelect = el('select', { className: 'input is-select' });
    [
      { value: 'thermal-80', text: 'Thermal 80 mm (Epson TM-T82 / Blueprint Lite 80)' },
      { value: 'thermal-58', text: 'Thermal 58 mm (Mini Portable)' },
      { value: 'dot-matrix', text: 'Dot Matrix Continuous (Epson LX-310)' },
    ].forEach((p) => {
      printerSelect.appendChild(el('option', { text: p.text, attrs: { value: p.value } }));
    });

    const connSelect = el('select', { className: 'input is-select' });
    [
      { value: 'lan', text: 'LAN / Jaringan Ethernet (Kabel RJ45 / WiFi)' },
      { value: 'usb', text: 'USB Direct (Kabel USB Printer)' },
    ].forEach((c) => {
      connSelect.appendChild(el('option', { text: c.text, attrs: { value: c.value } }));
    });

    const ipInput = el('input', {
      className: 'input',
      attrs: { type: 'text', value: profile.hardware.ipAddress },
    });

    const btnTestPrint = createButton({
      text: 'Cetak Halaman Uji (Test Print)',
      variant: 'secondary',
      icon: 'printer',
      onClick: () => {
        const testModal = el(
          'div',
          { className: 'bo-print-modal-content' },
          el(
            'div',
            { className: 'bo-test-slip' },
            el('h4', { className: 'bo-test-slip__brand', text: 'TOKO BUDIANNOR' }),
            el('p', {
              className: 'bo-test-slip__line',
              text: 'Jl. Ahmad Yani No. 12, Banjarbaru',
            }),
            el('p', { className: 'bo-test-slip__line', text: 'Telp: 0811-500-1234' }),
            el('hr', { className: 'bo-test-slip__rule' }),
            el('p', { className: 'bo-test-slip__title', text: 'TES PRINTER THERMAL OK' }),
            el('p', {
              className: 'bo-test-slip__line',
              text: 'Status: Koneksi LAN 192.168.1.200',
            }),
            el('p', { className: 'bo-test-slip__line', text: 'Kertas: 80 mm | Laci Kas: OK' }),
            el('hr', { className: 'bo-test-slip__rule' }),
            el('p', { className: 'bo-test-slip__line', text: '*** SUKSES TERKONEKSI ***' }),
          ),
        );
        openModal({
          title: 'Halaman Uji Printer Kasir',
          body: testModal,
          actions: [
            {
              text: 'Kirim ke Printer',
              variant: 'primary',
              onClick: () => {
                window.print();
              },
            },
            { text: label('tutup'), variant: 'secondary' },
          ],
        });
      },
    });

    const grid = el(
      'div',
      { className: 'bo-form-meta-grid bo-form-meta-grid--two' },
      el(
        'div',
        { className: 'field' },
        el('label', { className: 'field__label', text: 'Model Printer Kasir *' }),
        printerSelect,
      ),
      el(
        'div',
        { className: 'field' },
        el('label', { className: 'field__label', text: 'Tipe Koneksi Antarmuka *' }),
        connSelect,
      ),
      el(
        'div',
        { className: 'field' },
        el('label', { className: 'field__label', text: 'Alamat IP Printer (untuk LAN/Ethernet)' }),
        ipInput,
      ),
      el(
        'div',
        { className: 'field' },
        el('label', { className: 'field__label', text: 'Tindakan Pengujian' }),
        el('div', { className: 'bo-field-pad-top' }, btnTestPrint),
      ),
    );

    const drawerChk = el('label', {
      className: 'bo-chk-lbl bo-chk-lbl--gap',
    });
    const chkInput = el('input', { attrs: { type: 'checkbox' } });
    chkInput.checked = profile.hardware.autoOpenDrawer;
    drawerChk.appendChild(chkInput);
    drawerChk.appendChild(
      el('span', {
        text: 'Buka laci kas (Cash Drawer) otomatis setiap transaksi tunai selesai di POS',
      }),
    );

    card.appendChild(grid);
    card.appendChild(drawerChk);
    return card;
  }

  // --- TAB 4: Auto Backup Cloud ---
  function renderBackupTab(): HTMLElement {
    const card = el('div', { className: 'bo-panel' });
    card.appendChild(
      el('h3', { className: 'bo-form-sec-title', text: 'Jadwal & Riwayat Backup Otomatis Cloud' }),
    );

    const desc = el('p', {
      className: 't-label bo-backup-desc',
      text: 'Sesuai SLA Bab III no 3 proposal: Backup otomatis harian database toko berjalan setiap pukul 23.59 WITA ke Cloud Storage terpisah dengan retensi 30 hari.',
    });

    const btnBackupNow = createButton({
      text: 'Jalankan Backup Sekarang',
      variant: 'primary',
      icon: 'download',
      onClick: () => {
        showToast({
          kind: 'success',
          text: 'Backup database berhasil dibuat dan diunggah ke Google Drive Cloud Storage.',
        });
      },
    });

    const infoGrid = el(
      'div',
      {
        className: 'bo-stats-grid bo-stats-grid--three',
      },
      el(
        'div',
        { className: 'bo-panel bo-stat-card' },
        el('span', { className: 'bo-stat-card__lbl', text: 'Penyimpanan Cloud' }),
        el('span', { className: 'bo-stat-card__val', text: profile.cloudBackup.provider }),
        el('span', { className: 't-label', text: 'Terhubung ke Google Drive API' }),
      ),
      el(
        'div',
        { className: 'bo-panel bo-stat-card' },
        el('span', { className: 'bo-stat-card__lbl', text: 'Jadwal Backup Otomatis' }),
        el('span', { className: 'bo-stat-card__val', text: profile.cloudBackup.autoBackupTime }),
        el('span', { className: 't-label', text: 'Retensi 30 hari harian / 12 bln' }),
      ),
      el(
        'div',
        { className: 'bo-panel bo-stat-card' },
        el('span', { className: 'bo-stat-card__lbl', text: 'Backup Terakhir' }),
        el('span', { className: 'bo-stat-card__val is-success', text: 'SUKSES' }),
        el('span', { className: 't-label', text: '18 Okt 2026 23:59:00 WITA' }),
      ),
    );

    card.appendChild(desc);
    card.appendChild(infoGrid);
    card.appendChild(btnBackupNow);
    return card;
  }

  // First render
  renderView();

  return {
    element: container,
    destroy: () => undefined,
  };
}
