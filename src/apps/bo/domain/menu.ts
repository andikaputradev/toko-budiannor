import type { Role } from '../../../shared/data/types';
import type { IconName } from '../../../shared/icons';
import type { LabelKey } from '../../../shared/messages';

// Laporan yang dibuka sebagai kotak pilihan (gambar klien 29), bukan halaman.
export type ReportKind =
  'penjualan' | 'pembelian' | 'laba-rugi-kotor' | 'hutang-piutang' | 'stok' | 'harga';

export interface MenuEntry {
  readonly path: string;
  readonly label: LabelKey;
  readonly group: string;
  readonly screenId: string;
  // Bila ada, entri membuka kotak pilihan laporan ini dan tidak berpindah halaman.
  readonly dialog?: ReportKind;
}

export interface MenuGroup {
  readonly id: string;
  readonly label: LabelKey;
  readonly icon: IconName;
  readonly entries: readonly MenuEntry[];
}

export const MENU_GROUPS: readonly MenuGroup[] = [
  {
    id: 'master-data',
    label: 'grupMasterData',
    icon: 'database',
    entries: [
      {
        path: '/bo/barang',
        label: 'menuDataBarang',
        group: 'master-data',
        screenId: 'BO-03',
      },
      {
        path: '/bo/master/kategori',
        label: 'menuKategoriBarang',
        group: 'master-data',
        screenId: 'BO-03',
      },
      {
        path: '/bo/master/merk',
        label: 'menuMerkBarang',
        group: 'master-data',
        screenId: 'BO-03',
      },
      {
        path: '/bo/master/pemasok',
        label: 'menuPemasok',
        group: 'master-data',
        screenId: 'BO-08',
      },
      {
        path: '/bo/master/pelanggan',
        label: 'menuPelanggan',
        group: 'master-data',
        screenId: 'BO-11',
      },
      {
        path: '/bo/master/sales',
        label: 'menuSales',
        group: 'master-data',
        screenId: 'BO-14',
      },
      {
        path: '/bo/master/ekspedisi',
        label: 'menuEkspedisi',
        group: 'master-data',
        screenId: 'BO-12',
      },
    ],
  },
  {
    id: 'transaksi',
    label: 'grupTransaksi',
    icon: 'arrow-left-right',
    entries: [
      {
        path: '/bo/transaksi/po-pembelian',
        label: 'menuPoPembelian',
        group: 'transaksi',
        screenId: 'BO-08',
      },
      {
        path: '/bo/transaksi/faktur-pembelian',
        label: 'menuFakturPembelian',
        group: 'transaksi',
        screenId: 'BO-08',
      },
      {
        path: '/bo/transaksi/retur-pembelian',
        label: 'menuReturPembelian',
        group: 'transaksi',
        screenId: 'BO-10',
      },
      {
        path: '/bo/transaksi/so-penjualan',
        label: 'menuSoPenjualan',
        group: 'transaksi',
        screenId: 'BO-09',
      },
      {
        path: '/bo/transaksi/faktur-penjualan',
        label: 'menuFakturPenjualan',
        group: 'transaksi',
        screenId: 'BO-09',
      },
      {
        path: '/bo/transaksi/retur-penjualan',
        label: 'menuReturPenjualan',
        group: 'transaksi',
        screenId: 'BO-10',
      },
      {
        path: '/bo/transaksi/deposit-pelanggan',
        label: 'menuDepositPelanggan',
        group: 'transaksi',
        screenId: 'BO-11',
      },
    ],
  },
  {
    id: 'mutasi-stok',
    label: 'grupMutasiStok',
    icon: 'package',
    entries: [
      {
        path: '/bo/stok?filter=minimum',
        label: 'menuDaftarStokMinim',
        group: 'mutasi-stok',
        screenId: 'BO-05',
      },
      {
        path: '/bo/mutasi',
        label: 'menuTransferStok',
        group: 'mutasi-stok',
        screenId: 'BO-06',
      },
      {
        path: '/bo/mutasi/koreksi',
        label: 'menuKoreksiStok',
        group: 'mutasi-stok',
        screenId: 'BO-06',
      },
      {
        path: '/bo/opname',
        label: 'menuStokOpname',
        group: 'mutasi-stok',
        screenId: 'BO-07',
      },
    ],
  },
  {
    id: 'hutang-piutang',
    label: 'grupHutangPiutang',
    icon: 'wallet',
    entries: [
      {
        path: '/bo/hutang-piutang/saldo-hutang',
        label: 'menuSaldoHutang',
        group: 'hutang-piutang',
        screenId: 'BO-11',
      },
      {
        path: '/bo/hutang-piutang/bayar-hutang',
        label: 'menuPembayaranHutang',
        group: 'hutang-piutang',
        screenId: 'BO-11',
      },
      {
        path: '/bo/hutang-piutang/saldo-piutang',
        label: 'menuSaldoPiutang',
        group: 'hutang-piutang',
        screenId: 'BO-11',
      },
      {
        path: '/bo/hutang-piutang/bayar-piutang',
        label: 'menuPembayaranPiutang',
        group: 'hutang-piutang',
        screenId: 'BO-11',
      },
    ],
  },
  {
    id: 'akuntansi',
    label: 'grupAkuntansi',
    icon: 'file-text',
    entries: [
      {
        path: '/bo/akuntansi',
        label: 'grupAkuntansi',
        group: 'akuntansi',
        screenId: 'BO-18',
      },
    ],
  },
  {
    id: 'laporan',
    label: 'grupLaporan',
    icon: 'trending-up',
    entries: [
      {
        path: '/bo/laporan/laba-rugi',
        label: 'menuLabaRugi',
        group: 'laporan',
        screenId: 'BO-17',
        dialog: 'laba-rugi-kotor',
      },
      {
        path: '/bo/laporan/penjualan',
        label: 'menuLaporanPenjualan',
        group: 'laporan',
        screenId: 'BO-16',
        dialog: 'penjualan',
      },
      {
        path: '/bo/laporan/pembelian',
        label: 'menuLaporanPembelian',
        group: 'laporan',
        screenId: 'BO-16',
        dialog: 'pembelian',
      },
      {
        path: '/bo/laporan/hutang-piutang',
        label: 'menuLaporanHutangPiutang',
        group: 'laporan',
        screenId: 'BO-16',
        dialog: 'hutang-piutang',
      },
      {
        path: '/bo/laporan/stok',
        label: 'menuLaporanStok',
        group: 'laporan',
        screenId: 'BO-16',
        dialog: 'stok',
      },
      {
        path: '/bo/laporan/daftar-harga',
        label: 'menuPricelist',
        group: 'laporan',
        screenId: 'BO-04',
        dialog: 'harga',
      },
    ],
  },
  {
    id: 'pengaturan',
    label: 'grupPengaturan',
    icon: 'settings',
    entries: [
      {
        path: '/bo/pengaturan/profil',
        label: 'menuProfilToko',
        group: 'pengaturan',
        screenId: 'BO-22',
      },
      {
        path: '/bo/pengaturan/pengguna',
        label: 'menuPengguna',
        group: 'pengaturan',
        screenId: 'BO-20',
      },
      {
        path: '/bo/pengaturan/audit-log',
        label: 'menuLogAktivitas',
        group: 'pengaturan',
        screenId: 'BO-21',
      },
      {
        path: '/bo/pengaturan/barcode',
        label: 'menuCetakBarcode',
        group: 'pengaturan',
        screenId: 'BO-13',
      },
      {
        path: '/bo/pengaturan/tema',
        label: 'menuTema',
        group: 'pengaturan',
        screenId: 'BO-22',
      },
    ],
  },
];

// Dashboard adalah tab dasar (selalu ada di bilah tab), jadi tidak punya entri di laci menu.
const DASHBOARD_GROUP: MenuGroup = {
  id: 'dashboard',
  label: 'grupDashboard',
  icon: 'layout-dashboard',
  entries: [
    {
      path: '/bo/dashboard',
      label: 'menuDashboardRingkasan',
      group: 'dashboard',
      screenId: 'BO-02',
    },
  ],
};

// Halaman yang tidak tampil di laci menu tetapi tetap punya rute, judul tab, dan breadcrumb:
// Surat Jalan dibuka dari formulir Faktur Penjualan (gambar klien 33), halaman Satuan dan Harga
// dari kotak Price List.
const HIDDEN_ENTRIES: readonly MenuEntry[] = [
  ...DASHBOARD_GROUP.entries,
  {
    path: '/bo/transaksi/surat-jalan',
    label: 'suratJalanJudul',
    group: 'transaksi',
    screenId: 'BO-12',
  },
  {
    path: '/bo/harga',
    label: 'menuPricelist',
    group: 'laporan',
    screenId: 'BO-04',
  },
];

export const MENU_ENTRIES: readonly MenuEntry[] = [
  ...MENU_GROUPS.flatMap((group) => group.entries),
  ...HIDDEN_ENTRIES,
];

export function menuFor(role: Role): readonly MenuGroup[] {
  if (role !== 'owner' && role !== 'supervisor') {
    return [];
  }
  return MENU_GROUPS;
}

export function entryFor(path: string): MenuEntry | undefined {
  const normalized = path.split('?')[0] ?? path;
  return MENU_ENTRIES.find((entry) => entry.path.split('?')[0] === normalized);
}

export function groupFor(groupId: string): MenuGroup | undefined {
  return [DASHBOARD_GROUP, ...MENU_GROUPS].find((group) => group.id === groupId);
}
