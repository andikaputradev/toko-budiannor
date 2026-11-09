import type { Role } from '../../../shared/data/types';
import { PERMISSION_ROWS } from '../../../shared/permissions';

export interface StoreProfile {
  name: string;
  tagline: string;
  address: string;
  phone: string;
  npwp: string;
  receiptFooter: string;
  bankAccounts: {
    bankName: string;
    accountNumber: string;
    accountHolder: string;
  }[];
  hardware: {
    printerType: 'thermal-80' | 'thermal-58' | 'dot-matrix';
    connection: 'usb' | 'lan';
    ipAddress: string;
    autoOpenDrawer: boolean;
  };
  cloudBackup: {
    provider: 'Google Drive' | 'AWS S3';
    autoBackupTime: string;
    retentionDays: number;
    lastBackupIso: string;
  };
}

export interface SystemUser {
  readonly id: string;
  readonly username: string;
  readonly fullName: string;
  readonly role: Role;
  readonly pin: string;
  readonly active: boolean;
  readonly lastLogin: string;
}

export interface AuditLogEntry {
  readonly id: string;
  readonly timestamp: string;
  readonly username: string;
  readonly role: Role;
  readonly module: string;
  readonly action: string;
  readonly details: string;
  readonly ipAddress: string;
  readonly status: 'sukses' | 'peringatan' | 'ditolak';
}

export interface BarcodePrintItem {
  readonly productId: string;
  readonly code: string;
  readonly barcode: string;
  readonly name: string;
  readonly unit: string;
  readonly retailPrice: number;
  readonly wholesalePrice: number;
  readonly printCopies: number;
  readonly selected: boolean;
}

export const DEFAULT_STORE_PROFILE: StoreProfile = {
  name: 'Toko Budiannor',
  tagline: 'Ritel Bahan Bangunan & Alat Teknik',
  address: 'Jl. Ahmad Yani No. 12, Banjarbaru',
  phone: '0811-500-1234 / (0511) 477-8899',
  npwp: '01.234.567.8-732.000',
  receiptFooter:
    'Terima kasih atas kunjungan Anda. Barang yang sudah dibeli tidak dapat ditukar/dikembalikan kecuali ada perjanjian khusus.',
  bankAccounts: [
    {
      bankName: 'Bank BCA',
      accountNumber: '789-012-3456',
      accountHolder: 'Toko Budiannor',
    },
    {
      bankName: 'Bank Mandiri',
      accountNumber: '131-00-1234567-8',
      accountHolder: 'Toko Budiannor',
    },
    {
      bankName: 'Bank BRI',
      accountNumber: '0021-01-001234-50-9',
      accountHolder: 'Toko Budiannor',
    },
  ],
  hardware: {
    printerType: 'thermal-80',
    connection: 'lan',
    ipAddress: '192.168.1.200',
    autoOpenDrawer: true,
  },
  cloudBackup: {
    provider: 'Google Drive',
    autoBackupTime: '23:59 WITA',
    retentionDays: 30,
    lastBackupIso: '2026-10-18T23:59:00',
  },
};

export const DEFAULT_SYSTEM_USERS: readonly SystemUser[] = [
  {
    id: 'USR-01',
    username: 'owner',
    fullName: 'H. Budiannor (Owner)',
    role: 'owner',
    pin: '1234',
    active: true,
    lastLogin: '2026-10-19 08:05:12',
  },
  {
    id: 'USR-02',
    username: 'spv_rahman',
    fullName: 'M. Rahman (Supervisor)',
    role: 'supervisor',
    pin: '5678',
    active: true,
    lastLogin: '2026-10-19 07:45:30',
  },
  {
    id: 'USR-03',
    username: 'kasir_siti',
    fullName: 'Siti Aminah (Kasir 1)',
    role: 'kasir',
    pin: '1122',
    active: true,
    lastLogin: '2026-10-19 08:00:02',
  },
  {
    id: 'USR-04',
    username: 'kasir_ahmad',
    fullName: 'Ahmad Fauzi (Kasir 2)',
    role: 'kasir',
    pin: '3344',
    active: true,
    lastLogin: '2026-10-18 16:30:10',
  },
  {
    id: 'USR-05',
    username: 'pramuniaga_dani',
    fullName: 'Dani Ramadhan (Frontliner/Pramuniaga)',
    role: 'frontliner',
    pin: '9900',
    active: true,
    lastLogin: '2026-10-19 08:10:45',
  },
];

export const DEFAULT_AUDIT_LOGS: readonly AuditLogEntry[] = [
  {
    id: 'LOG-2610-091',
    timestamp: '2026-10-19 08:35:14',
    username: 'owner',
    role: 'owner',
    module: 'Akuntansi & Laporan',
    action: 'Ekspor Neraca Keuangan',
    details: 'Ekspor PDF Neraca posisi 19 Okt 2026 (Rp 1.794.350.000)',
    ipAddress: '192.168.1.10',
    status: 'sukses',
  },
  {
    id: 'LOG-2610-090',
    timestamp: '2026-10-19 08:22:05',
    username: 'owner',
    role: 'owner',
    module: 'Penjualan',
    action: 'Approval Limit Piutang',
    details: 'Menyetujui overlimit piutang Pak Wahyudi faktur FJ26108899',
    ipAddress: '192.168.1.10',
    status: 'sukses',
  },
  {
    id: 'LOG-2610-089',
    timestamp: '2026-10-19 08:15:30',
    username: 'kasir_siti',
    role: 'kasir',
    module: 'Kasir POS',
    action: 'Transaksi Selesai',
    details: 'Penjualan tunai POS struk B-0318 total Rp 14.250.000',
    ipAddress: '192.168.1.51',
    status: 'sukses',
  },
  {
    id: 'LOG-2610-088',
    timestamp: '2026-10-19 08:10:12',
    username: 'pramuniaga_dani',
    role: 'frontliner',
    module: 'Kasir POS',
    action: 'Simpan Hold Bill (Draft)',
    details: 'Pramuniaga simpan draf bill B-0318, closing dibatasi ke kasir',
    ipAddress: '192.168.1.60',
    status: 'sukses',
  },
  {
    id: 'LOG-2610-087',
    timestamp: '2026-10-19 08:02:18',
    username: 'spv_rahman',
    role: 'supervisor',
    module: 'Mutasi Stok',
    action: 'Transfer Antar Gudang',
    details: 'Mutasi M-0042 Semen Gresik 50 Sak (Gudang Besar -> Display Toko)',
    ipAddress: '192.168.1.25',
    status: 'sukses',
  },
  {
    id: 'LOG-2610-086',
    timestamp: '2026-10-19 07:55:40',
    username: 'kasir_siti',
    role: 'kasir',
    module: 'Beban Operasional',
    action: 'Input Beban Toko',
    details: 'BBN-01 Komisi sales minggu ke-3 Rp 2.150.000 (Kas Toko)',
    ipAddress: '192.168.1.51',
    status: 'sukses',
  },
  {
    id: 'LOG-2610-085',
    timestamp: '2026-10-18 17:02:11',
    username: 'pramuniaga_dani',
    role: 'frontliner',
    module: 'Kasir POS',
    action: 'Percobaan Closing Bayar',
    details: 'Ditolak sistem: Hak akses Frontliner dibatasi hanya sampai Hold Bill',
    ipAddress: '192.168.1.60',
    status: 'ditolak',
  },
  {
    id: 'LOG-2610-084',
    timestamp: '2026-10-18 23:59:00',
    username: 'system',
    role: 'owner',
    module: 'Sistem & Backup',
    action: 'Auto Cloud Backup',
    details: 'Backup otomatis database harian ke Google Drive API berhasil',
    ipAddress: '127.0.0.1',
    status: 'sukses',
  },
];

/**
 * Filter log aktivitas
 */
export function filterAuditLogs(
  logs: readonly AuditLogEntry[],
  criteria: {
    username?: string;
    module?: string;
    status?: string;
    searchQuery?: string;
  } = {},
): readonly AuditLogEntry[] {
  return logs.filter((item) => {
    if (criteria.username && criteria.username !== 'semua' && item.username !== criteria.username) {
      return false;
    }
    if (
      criteria.module &&
      criteria.module !== 'semua' &&
      !item.module.toLowerCase().includes(criteria.module.toLowerCase())
    ) {
      return false;
    }
    if (criteria.status && criteria.status !== 'semua' && item.status !== criteria.status) {
      return false;
    }
    if (criteria.searchQuery) {
      const q = criteria.searchQuery.toLowerCase();
      const match =
        item.details.toLowerCase().includes(q) ||
        item.action.toLowerCase().includes(q) ||
        item.username.toLowerCase().includes(q) ||
        item.id.toLowerCase().includes(q);
      if (!match) return false;
    }
    return true;
  });
}

/**
 * Mengambil matriks RBAC terstruktur berdasarkan PERMISSION_ROWS
 */
export interface RbacMatrixGroup {
  readonly screenCode: string;
  readonly screenName: string;
  readonly items: {
    readonly action: string;
    readonly owner: boolean;
    readonly supervisor: boolean;
    readonly kasir: boolean;
    readonly frontliner: boolean;
  }[];
}

export function getStructuredRbacMatrix(): readonly RbacMatrixGroup[] {
  const groups = new Map<
    string,
    { screenName: string; items: RbacMatrixGroup['items'][number][] }
  >();

  const screenNames: Record<string, string> = {
    'POS-01': 'POS Kasir - Otentikasi & PIN',
    'POS-02': 'POS Kasir - Pemilihan Barang & Transaksi',
    'POS-03': 'POS Kasir - Multi Satuan & Ubah Harga',
    'POS-04': 'POS Kasir - Multi Pembayaran & Closing',
    'POS-05': 'POS Kasir - Hold Bill & Cetak Draf',
    'BO-02': 'Back Office - Dashboard Ringkasan',
    'BO-03': 'Back Office - Master Data Barang & Impor Excel',
    'BO-05': 'Back Office - Monitoring Stok Multi-Gudang',
    'BO-06': 'Back Office - Transfer Antar Gudang',
    'BO-08': 'Back Office - PO & Pembelian',
    'BO-09': 'Back Office - SO & Faktur Penjualan',
    'BO-11': 'Back Office - Hutang Piutang & Pembayaran',
    'BO-12': 'Back Office - Ekspedisi & Packing Koli',
    'BO-13': 'Back Office - Cetak Barcode Massal',
    'BO-17': 'Back Office - Laba Rugi',
    'BO-18': 'Back Office - Jurnal, Arus Kas & Neraca',
    'BO-19': 'Back Office - Beban Operasional',
    'BO-20': 'Back Office - Manajemen Pengguna & RBAC',
    'BO-21': 'Back Office - Log Aktivitas / Audit Trail',
    'BO-22': 'Back Office - Profil Toko & Pengaturan',
  };

  for (const [code, action, permissions] of PERMISSION_ROWS) {
    if (!screenNames[code]) continue;
    if (!groups.has(code)) {
      groups.set(code, { screenName: screenNames[code] ?? code, items: [] });
    }

    const o = permissions.startsWith('Y');
    const s = permissions.charAt(1) === 'Y';
    const k = permissions.charAt(2) === 'Y';
    // Frontliner: hanya bisa POS-01, POS-02 (tambah item), POS-05 (hold bill), dan lihat stok
    const isFrontliner =
      code === 'POS-01' ||
      (code === 'POS-02' && !action.toLowerCase().includes('bayar')) ||
      (code === 'POS-05' && !action.toLowerCase().includes('hapus')) ||
      action.toLowerCase().includes('cek stok');

    groups.get(code)?.items.push({
      action,
      owner: o,
      supervisor: s,
      kasir: k,
      frontliner: isFrontliner,
    });
  }

  return [...groups.entries()].map(([screenCode, val]) => ({
    screenCode,
    screenName: val.screenName,
    items: val.items,
  }));
}
