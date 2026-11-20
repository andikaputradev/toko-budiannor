import { matchesPhrase } from '../../../shared/data/search-index';
import { ROLES, type Role } from '../../../shared/data/types';
import { PIN_PATTERN } from '../../../shared/domain/pin';
import {
  PERMISSION_ROWS,
  PERMISSION_RULES,
  accessFor,
  canOpenScreen,
  canOverrideAccess,
  defaultAccessFor,
  type Access,
} from '../../../shared/permissions';
import { createPersistence, type StorageLike } from '../../../shared/store/persistence';

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
    pin: '123456',
    active: true,
    lastLogin: '2026-10-19 08:05:12',
  },
  {
    id: 'USR-02',
    username: 'spv_rahman',
    fullName: 'M. Rahman (Supervisor)',
    role: 'supervisor',
    pin: '123456',
    active: true,
    lastLogin: '2026-10-19 07:45:30',
  },
  {
    id: 'USR-03',
    username: 'kasir_siti',
    fullName: 'Siti Aminah (Kasir 1)',
    role: 'kasir',
    pin: '123456',
    active: true,
    lastLogin: '2026-10-19 08:00:02',
  },
  {
    id: 'USR-04',
    username: 'kasir_ahmad',
    fullName: 'Ahmad Fauzi (Kasir 2)',
    role: 'kasir',
    pin: '123456',
    active: true,
    lastLogin: '2026-10-18 16:30:10',
  },
  {
    id: 'USR-05',
    username: 'pramuniaga_dani',
    fullName: 'Dani Ramadhan (Frontliner/Pramuniaga)',
    role: 'frontliner',
    pin: '123456',
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
    details: 'Ekspor PDF Neraca posisi 19/10/2026 (Rp 1.794.350.000)',
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
    details: 'Mutasi M-0042 Semen Gresik 50 Sak (Gudang -> Toko)',
    ipAddress: '192.168.1.25',
    status: 'sukses',
  },
  {
    id: 'LOG-2610-086',
    timestamp: '2026-10-19 07:55:40',
    username: 'kasir_siti',
    role: 'kasir',
    module: 'Beban Usaha',
    action: 'Input Beban Toko',
    details: 'BBN-01 Komisi sales minggu ke-3 Rp 2.150.000 (Kas)',
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
      const match = matchesPhrase(
        `${item.details} ${item.action} ${item.username} ${item.id}`,
        criteria.searchQuery,
      );
      if (!match) return false;
    }
    return true;
  });
}

// ===== Matriks hak akses =====

// Kolom matriks. Owner selalu penuh dan terkunci; Supervisor, Kasir, dan Frontliner dapat diubah Owner.
export type MatrixRole = 'owner' | 'supervisor' | 'kasir' | 'frontliner';

export const MATRIX_ROLES: readonly MatrixRole[] = ['owner', 'supervisor', 'kasir', 'frontliner'];

export interface RbacMatrixItem {
  readonly action: string;
  readonly owner: Access;
  readonly supervisor: Access;
  readonly kasir: Access;
  readonly frontliner: Access;
}

export interface RbacMatrixGroup {
  readonly screenCode: string;
  readonly screenName: string;
  readonly items: readonly RbacMatrixItem[];
}

// Seluruh layar POS dan Back-Office. Layar OWN dan SALES milik aplikasi Owner dan Sales Lapangan,
// bukan peran yang diatur di sini.
const SCREEN_NAMES: Readonly<Record<string, string>> = {
  'POS-01': 'POS Kasir - Otentikasi & PIN',
  'POS-02': 'POS Kasir - Pemilihan Barang & Transaksi',
  'POS-03': 'POS Kasir - Multi Satuan & Ubah Harga',
  'POS-04': 'POS Kasir - Multi Pembayaran & Closing',
  'POS-05': 'POS Kasir - Hold Bill & Cetak Draf',
  'POS-06': 'POS Kasir - Riwayat Transaksi',
  'POS-07': 'POS Kasir - Biaya Kasir',
  'POS-08': 'POS Kasir - Pelanggan Baru',
  'POS-09': 'POS Kasir - Status Sinkronisasi',
  'POS-10': 'POS Kasir - Otorisasi Owner',
  'POS-11': 'POS Kasir - Karyawan & Laporan Shift',
  'POS-12': 'POS Kasir - Pengaturan',
  'BO-01': 'Back Office - Masuk',
  'BO-02': 'Back Office - Dashboard Ringkasan',
  'BO-03': 'Back Office - Master Data Barang & Impor Excel',
  'BO-04': 'Back Office - Satuan & Harga',
  'BO-05': 'Back Office - Monitoring Stok Multi-Gudang',
  'BO-06': 'Back Office - Transfer Antar Gudang',
  'BO-07': 'Back Office - Stok Opname',
  'BO-08': 'Back Office - PO & Pembelian',
  'BO-09': 'Back Office - SO & Faktur Penjualan',
  'BO-10': 'Back Office - Retur',
  'BO-11': 'Back Office - Hutang Piutang & Pembayaran',
  'BO-12': 'Back Office - Ekspedisi & Packing Koli',
  'BO-13': 'Back Office - Cetak Barcode Massal',
  'BO-14': 'Back Office - Aturan Komisi Sales',
  'BO-15': 'Back Office - Impor Data',
  'BO-16': 'Back Office - Laporan',
  'BO-17': 'Back Office - Laba Rugi',
  'BO-18': 'Back Office - Jurnal, Arus Kas & Neraca',
  'BO-19': 'Back Office - Beban Usaha',
  'BO-20': 'Back Office - Pengguna & Hak Akses',
  'BO-21': 'Back Office - Log Aktivitas / Audit Trail',
  'BO-22': 'Back Office - Profil Toko & Pengaturan',
};

// Layar masuk mengikuti status akun pengguna, bukan matriks, sehingga selnya terkunci.
const LOGIN_SCREENS: ReadonlySet<string> = new Set(['POS-01', 'BO-01']);

// Hak akses efektif (bawaan ditambah penimpaan Owner) seluruh layar POS dan Back-Office.
export function getStructuredRbacMatrix(): readonly RbacMatrixGroup[] {
  const groups = new Map<string, RbacMatrixItem[]>();
  for (const [code, action] of PERMISSION_ROWS) {
    if (SCREEN_NAMES[code] === undefined) {
      continue;
    }
    const items = groups.get(code) ?? [];
    items.push({
      action,
      owner: accessFor('owner', code, action),
      supervisor: accessFor('supervisor', code, action),
      kasir: accessFor('kasir', code, action),
      frontliner: accessFor('frontliner', code, action),
    });
    groups.set(code, items);
  }
  return [...groups].map(([screenCode, items]) => ({
    screenCode,
    screenName: SCREEN_NAMES[screenCode] ?? screenCode,
    items,
  }));
}

// Nama aksi pada matriks; istilah Invoice pada kunci aturan ditampilkan sebagai Faktur.
export function actionLabel(action: string): string {
  return action.replaceAll('Invoice', 'Faktur');
}

export type LockReason = 'owner' | 'layar' | 'masuk' | 'bayar';

// Alasan sel tidak dapat diubah; undefined bila Owner boleh mengubahnya.
export function lockReason(
  role: MatrixRole,
  screen: string,
  action: string,
): LockReason | undefined {
  if (role === 'owner') {
    return 'owner';
  }
  if (!canOpenScreen(role, screen)) {
    return 'layar';
  }
  if (LOGIN_SCREENS.has(screen)) {
    return 'masuk';
  }
  return canOverrideAccess(role, screen, action) ? undefined : 'bayar';
}

// Hanya aksi yang pada matriks bawaan memang mengenal otorisasi Owner yang memiliki status Otorisasi.
export function accessCycle(screen: string, action: string): readonly Access[] {
  const known = PERMISSION_RULES.some(
    (rule) =>
      rule.screen === screen &&
      rule.action === action &&
      [rule.owner, rule.supervisor, rule.kasir, rule.sales].includes('otorisasi'),
  );
  return known ? ['ya', 'otorisasi', 'tidak'] : ['ya', 'tidak'];
}

export function nextAccess(screen: string, action: string, current: Access): Access {
  const cycle = accessCycle(screen, action);
  const index = cycle.indexOf(current);
  // Status di luar lingkar (isi penyimpanan yang diubah manual) jatuh ke Tidak.
  return index === -1 ? 'tidak' : (cycle[(index + 1) % cycle.length] ?? 'tidak');
}

export function isAccessChanged(role: MatrixRole, screen: string, action: string): boolean {
  return accessFor(role, screen, action) !== defaultAccessFor(role, screen, action);
}

// Jumlah sel yang berbeda dari matriks bawaan.
export function countAccessChanges(): number {
  let total = 0;
  for (const group of getStructuredRbacMatrix()) {
    for (const item of group.items) {
      for (const role of MATRIX_ROLES) {
        if (isAccessChanged(role, group.screenCode, item.action)) {
          total += 1;
        }
      }
    }
  }
  return total;
}

// ===== Pengguna =====

export type UserIssue = 'kosong' | 'username-ganda' | 'pin' | 'owner-terakhir';

export interface UserDraft {
  readonly fullName: string;
  readonly username: string;
  readonly role: Role;
  readonly active: boolean;
  // Wajib 6 angka pada pengguna baru; pada pengubahan boleh kosong (PIN tidak berubah).
  readonly pin: string;
}

const hasOtherActiveOwner = (users: readonly SystemUser[], id: string | undefined): boolean =>
  users.some((user) => user.id !== id && user.role === 'owner' && user.active);

export function validateUserDraft(
  users: readonly SystemUser[],
  draft: UserDraft,
  editingId?: string,
): UserIssue | undefined {
  const username = draft.username.trim().toLowerCase();
  if (draft.fullName.trim() === '' || username === '') {
    return 'kosong';
  }
  if (users.some((user) => user.id !== editingId && user.username.toLowerCase() === username)) {
    return 'username-ganda';
  }
  if ((editingId === undefined || draft.pin !== '') && !PIN_PATTERN.test(draft.pin)) {
    return 'pin';
  }
  const current = users.find((user) => user.id === editingId);
  const stepsDown = current?.role === 'owner' && current.active;
  if (
    stepsDown &&
    (draft.role !== 'owner' || !draft.active) &&
    !hasOtherActiveOwner(users, editingId)
  ) {
    return 'owner-terakhir';
  }
  return undefined;
}

function nextUserId(users: readonly SystemUser[]): string {
  const highest = Math.max(0, ...users.map((user) => Number(/\d+$/.exec(user.id)?.[0] ?? 0)));
  return `USR-${String(highest + 1).padStart(2, '0')}`;
}

export function addSystemUser(
  users: readonly SystemUser[],
  draft: UserDraft,
): readonly SystemUser[] {
  const created: SystemUser = {
    id: nextUserId(users),
    username: draft.username.trim(),
    fullName: draft.fullName.trim(),
    role: draft.role,
    pin: draft.pin,
    active: draft.active,
    lastLogin: 'Belum pernah',
  };
  return [...users, created];
}

// Nama pengguna tidak berubah; PIN hanya berganti bila diisi.
export function changeSystemUser(
  users: readonly SystemUser[],
  id: string,
  draft: UserDraft,
): readonly SystemUser[] {
  return users.map((user) =>
    user.id === id
      ? {
          ...user,
          fullName: draft.fullName.trim(),
          role: draft.role,
          active: draft.active,
          pin: draft.pin === '' ? user.pin : draft.pin,
        }
      : user,
  );
}

export function resetSystemUserPin(
  users: readonly SystemUser[],
  id: string,
  pin: string,
): readonly SystemUser[] {
  return users.map((user) => (user.id === id ? { ...user, pin } : user));
}

// PIN sementara 6 angka untuk Reset PIN.
export function temporaryPin(): string {
  const [value = 0] = crypto.getRandomValues(new Uint32Array(1));
  return String(value % 1_000_000).padStart(6, '0');
}

// Daftar pengguna hidup selama sesi peramban: muat ulang dan pindah halaman tidak menghapusnya,
// sedangkan PIN tidak tertinggal di penyimpanan permanen.
export const SYSTEM_USERS_KEY = 'budiannor.pengguna-sistem';

function isSystemUser(value: unknown): value is SystemUser {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const user = value as Readonly<Record<string, unknown>>;
  return (
    typeof user['id'] === 'string' &&
    typeof user['username'] === 'string' &&
    typeof user['fullName'] === 'string' &&
    typeof user['pin'] === 'string' &&
    typeof user['active'] === 'boolean' &&
    typeof user['lastLogin'] === 'string' &&
    ROLES.some((role) => role === user['role'])
  );
}

function parseSystemUsers(raw: unknown): readonly SystemUser[] | undefined {
  return Array.isArray(raw) && raw.length > 0 && raw.every(isSystemUser) ? raw : undefined;
}

function sessionStorageOrNone(): StorageLike | undefined {
  try {
    return sessionStorage;
  } catch {
    return undefined;
  }
}

export interface SystemUserStore {
  load(): readonly SystemUser[];
  save(users: readonly SystemUser[]): void;
  clear(): void;
}

export function createSystemUserStore(
  storage: StorageLike | undefined = sessionStorageOrNone(),
): SystemUserStore {
  const persistence = createPersistence<readonly SystemUser[]>({
    key: SYSTEM_USERS_KEY,
    parse: parseSystemUsers,
    storage,
    createChannel: () => undefined,
  });
  return {
    load: () => persistence.load() ?? DEFAULT_SYSTEM_USERS,
    save: (users) => {
      persistence.save(users);
    },
    clear: () => {
      persistence.clear();
    },
  };
}
