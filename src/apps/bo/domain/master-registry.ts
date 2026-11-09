import type { Store } from '../../../shared/store/store';

/**
 * Data master yang belum punya tabel sendiri pada dataset bersama disimpan di sini, satu
 * kumpulan per Store: kode dan keterangan kategori atau merk, profil Sales, dan daftar
 * Ekspedisi. Isinya hidup selama sesi simulasi dan dikembalikan ke awal saat data direset.
 */
export interface CatalogMeta {
  code: string;
  note: string;
}

export type SalesRole = 'sales' | 'frontliner';

export interface SalesProfile {
  readonly id: string;
  /** pengguna: milik akun aplikasi; manual: sales yang dicatat langsung pada master. */
  readonly source: 'pengguna' | 'manual';
  name: string;
  code: string;
  phone: string;
  role: SalesRole;
  commission: number;
  target: number;
  note: string;
}

export interface ExpeditionRecord {
  readonly id: string;
  code: string;
  name: string;
  phone: string;
  address: string;
  baseFee: number;
  note: string;
  /** Dipakai sebagai pilihan awal pada Surat Jalan, sehingga tidak boleh dihapus. */
  readonly builtIn: boolean;
}

export interface MasterRegistry {
  readonly categories: Map<string, CatalogMeta>;
  readonly brands: Map<string, CatalogMeta>;
  readonly sales: Map<string, SalesProfile>;
  readonly expeditions: Map<string, ExpeditionRecord>;
}

export interface SupplierProfile {
  readonly code: string;
  readonly address: string;
}

/** Profil awal pemasok contoh; dipakai selama pemasok belum disimpan ulang dari layar master. */
export const SUPPLIER_PROFILES: Readonly<Record<string, SupplierProfile>> = {
  'V-001': { code: 'PM001', address: 'Jl. Raya Industri No. 12, Surabaya' },
  'V-002': { code: 'PM002', address: 'Jl. Margomulyo Indah Blok C-7, Surabaya' },
  'V-003': { code: 'PM003', address: 'Jl. Rungkut Industri III No. 5, Surabaya' },
  'V-004': { code: 'PM004', address: 'Jl. Tambak Osowilangun No. 30, Surabaya' },
  'V-005': { code: 'PM005', address: 'Jl. Kali Rungkut No. 18, Surabaya' },
  'V-006': { code: 'PM006', address: 'Jl. Raya Gresik Km 9, Gresik' },
};

/** Nomor telepon dan alamat awal untuk akun berperan sales atau frontliner. */
export const SALES_PROFILES: Readonly<Record<string, { readonly phone: string }>> = {
  'U-5': { phone: '081355500105' },
  'U-6': { phone: '081355500106' },
};

export const DEFAULT_COMMISSION: Readonly<Record<SalesRole, number>> = {
  sales: 1,
  frontliner: 0.5,
};

export const DEFAULT_TARGET: Readonly<Record<SalesRole, number>> = {
  sales: 150_000_000,
  frontliner: 60_000_000,
};

const registries = new WeakMap<Store, MasterRegistry>();

function seedExpeditions(): ExpeditionRecord[] {
  return [
    {
      id: 'EX-001',
      code: 'EX001',
      name: 'JNE Cargo',
      phone: '081355500201',
      address: 'Jl. Ahmad Yani No. 45, Surabaya',
      baseFee: 150_000,
      note: 'Pilihan awal Surat Jalan',
      builtIn: true,
    },
    {
      id: 'EX-002',
      code: 'EX002',
      name: 'Dakota Cargo',
      phone: '081355500202',
      address: 'Jl. Kenjeran No. 210, Surabaya',
      baseFee: 175_000,
      note: 'Pengiriman antar pulau',
      builtIn: false,
    },
    {
      id: 'EX-003',
      code: 'EX003',
      name: 'Indah Logistik',
      phone: '081355500203',
      address: 'Jl. Raya Sidoarjo No. 88, Sidoarjo',
      baseFee: 125_000,
      note: 'Cargo darat Jawa dan Bali',
      builtIn: false,
    },
    {
      id: 'EX-004',
      code: 'EX004',
      name: 'Armada Truk Toko',
      phone: '081355500204',
      address: 'Gudang Besar Toko Budiannor',
      baseFee: 100_000,
      note: 'Armada milik toko, pengiriman dalam kota',
      builtIn: false,
    },
  ];
}

function seedSales(): SalesProfile[] {
  return [
    {
      id: 'SL-001',
      source: 'manual',
      name: 'Salahudin',
      code: 'SL001',
      phone: '081355500107',
      role: 'sales',
      commission: 1,
      target: 150_000_000,
      note: 'Sales kanvas area Surabaya',
    },
  ];
}

function fill(registry: MasterRegistry): void {
  registry.categories.clear();
  registry.brands.clear();
  registry.sales.clear();
  registry.expeditions.clear();
  for (const profile of seedSales()) {
    registry.sales.set(profile.id, profile);
  }
  for (const record of seedExpeditions()) {
    registry.expeditions.set(record.id, record);
  }
}

export function registryOf(store: Store): MasterRegistry {
  const found = registries.get(store);
  if (found !== undefined) {
    return found;
  }
  const created: MasterRegistry = {
    categories: new Map(),
    brands: new Map(),
    sales: new Map(),
    expeditions: new Map(),
  };
  fill(created);
  registries.set(store, created);
  store.bus.on('reset', () => {
    fill(created);
  });
  return created;
}
