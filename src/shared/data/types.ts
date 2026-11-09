export type Tier = 'eceran' | 'grosir' | 'kontraktor';
export type WarehouseId = 'display' | 'besar';
export type Role = 'owner' | 'supervisor' | 'kasir' | 'frontliner' | 'sales';

export const TIERS: readonly Tier[] = ['eceran', 'grosir', 'kontraktor'];
export const WAREHOUSES: readonly WarehouseId[] = ['display', 'besar'];
export const ROLES: readonly Role[] = ['owner', 'supervisor', 'kasir', 'frontliner', 'sales'];

export interface UnitDef {
  readonly code: string;
  readonly name: string;
  readonly factor: number;
  readonly barcode?: string | undefined;
}

export type TierPrices = Readonly<Record<Tier, number>>;
export type Stock = Readonly<Record<WarehouseId, number>>;

export interface Product {
  readonly id: string;
  readonly code: string;
  readonly barcode: string;
  readonly name: string;
  readonly brand: string;
  readonly category: string;
  readonly baseUnit: string;
  readonly allowDecimal: boolean;
  readonly units: readonly UnitDef[];
  readonly prices: Readonly<Record<string, TierPrices>>;
  readonly hpp: number;
  readonly minStock: number;
  readonly stock: Stock;
  readonly active?: boolean | undefined;
  readonly defaultUnit?: string | undefined;
  readonly photoName?: string | undefined;
  readonly minByWarehouse?: Readonly<Record<WarehouseId, number>> | undefined;
  readonly incoming?: number | undefined;
  readonly photoUrl?: string | undefined;
  readonly pinned?: boolean | undefined;
  readonly rak?: string | undefined;
  readonly weight?: number | undefined;
  readonly salesCommission?: { readonly percent: number; readonly nominal: number } | undefined;
  readonly promo?: { readonly percent: number; readonly nominal: number } | undefined;
  readonly notes?: string | undefined;
  readonly supplierName?: string | undefined;
  readonly lastPurchaseDate?: string | undefined;
  readonly lastPurchasePrice?: number | undefined;
  readonly hppAvg?: number | undefined;
  readonly initialStock?:
    | {
        readonly date?: string;
        readonly quantity?: number;
        readonly unit?: string;
        readonly unitPrice?: number;
        readonly warehouse?: string;
      }
    | undefined;
}

// Catatan pembayaran invoice (piutang atau hutang) yang dibuat saat aplikasi berjalan.
export interface InvoicePayment {
  readonly at: string;
  readonly amount: number;
  readonly method: 'tunai' | 'transfer' | 'qris';
}

export interface ReceivableInvoice {
  readonly id: string;
  readonly issuedAt: string;
  readonly dueAt: string;
  readonly amount: number;
  readonly paid: number;
  readonly payments?: readonly InvoicePayment[] | undefined;
}

export interface Customer {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly phone: string;
  readonly tier: Tier;
  readonly limit: number;
  readonly invoices: readonly ReceivableInvoice[];
  readonly address?: string | undefined;
  readonly dueDays?: number | undefined;
  readonly pinned?: boolean | undefined;
  // Master Pelanggan: false berarti dinonaktifkan (disembunyikan dari daftar master, data tetap).
  readonly active?: boolean | undefined;
  // Saldo deposit pelanggan (uang titipan yang dapat dipakai melunasi piutang); kosong berarti 0.
  readonly deposit?: number | undefined;
}

export interface AppUser {
  readonly id: string;
  readonly name: string;
  readonly role: Role;
  readonly pin: string;
  readonly username: string;
  readonly password: string;
  readonly active: boolean;
}

export interface LineDiscount {
  readonly kind: 'persen' | 'nominal';
  readonly value: number;
}

// unitPrice adalah harga efektif; listPrice menyimpan harga asli saat kasir mengubah harga.
export interface BillLine {
  readonly productId: string;
  readonly unit: string;
  readonly quantity: number;
  readonly unitPrice: number;
  readonly discount?: LineDiscount | undefined;
  readonly listPrice?: number | undefined;
  readonly note?: string | undefined;
  readonly sellerId?: string | undefined;
}

export interface HeldBill {
  readonly id: string;
  readonly number: string;
  readonly createdAt: string;
  readonly userId: string;
  readonly customerId: string | undefined;
  readonly lines: readonly BillLine[];
}

export type PaymentMethod = 'tunai' | 'qris' | 'edc' | 'transfer' | 'dp' | 'piutang';
export type PaidMethod = Exclude<PaymentMethod, 'dp' | 'piutang'>;

export type RefundMethod = 'tunai' | 'qris' | 'edc' | 'transfer';

export interface SalePayment {
  readonly method: PaymentMethod;
  readonly amount: number;
  readonly via?: PaymentMethod | undefined;
  readonly channel?: string | undefined;
}

export interface SaleTerms {
  readonly dueDays: number;
  readonly dueDate: string;
}

export interface Sale {
  readonly id: string;
  readonly number: string;
  readonly createdAt: string;
  readonly cashierId: string;
  readonly customerId: string | undefined;
  readonly lines: readonly BillLine[];
  readonly total: number;
  readonly payment: PaymentMethod;
  readonly paid: number;
  readonly payments?: readonly SalePayment[] | undefined;
  readonly terms?: SaleTerms | undefined;
  readonly dp?: number | undefined;
}

export type SyncStatus = 'menunggu' | 'mengirim' | 'gagal' | 'terkirim';
export type SyncKind = 'transaksi' | 'biaya' | 'pelanggan' | 'otorisasi';

export interface SyncItem {
  readonly id: string;
  readonly saleNumber: string;
  readonly createdAt: string;
  readonly status: SyncStatus;
  readonly kind: SyncKind;
  readonly total: number;
}

export type ActivityKind =
  | 'masuk'
  | 'transaksi'
  | 'koreksi'
  | 'otorisasi'
  | 'mutasi'
  | 'opname'
  | 'impor'
  | 'cetak'
  | 'pengguna'
  | 'harga';

export interface ActivityEvent {
  readonly id: string;
  readonly at: string;
  readonly userId: string;
  readonly device: string;
  readonly ip: string;
  readonly kind: ActivityKind;
  readonly detail: string;
}

export interface DailyRevenue {
  readonly date: string;
  readonly revenue: number;
  readonly count: number;
}

// Faktur pembelian dari supplier. Sisa = amount dikurangi paid; lines berjumlah sama dengan amount.
export interface PayableInvoice {
  readonly id: string;
  readonly issuedAt: string;
  readonly dueAt: string;
  readonly amount: number;
  readonly paid: number;
  readonly lines: readonly BillLine[];
  readonly payments?: readonly InvoicePayment[] | undefined;
}

export interface Supplier {
  readonly id: string;
  readonly name: string;
  readonly phone: string;
  readonly payable: number;
  readonly invoices?: readonly PayableInvoice[] | undefined;
  // Master Pemasok: kode, alamat, dan status aktif (false berarti dinonaktifkan).
  readonly code?: string | undefined;
  readonly address?: string | undefined;
  readonly active?: boolean | undefined;
}

export interface ExpenseRecord {
  readonly id: string;
  readonly date: string;
  readonly category: string;
  readonly note: string;
  readonly amount: number;
  readonly source: 'kasir' | 'back-office';
}

export type ApprovalKind = 'diskon' | 'piutang' | 'koreksi';
export type ApprovalStatus = 'menunggu' | 'disetujui' | 'ditolak';

export interface ApprovalRequest {
  readonly id: string;
  readonly kind: ApprovalKind;
  readonly status: ApprovalStatus;
  readonly requestedBy: string;
  readonly at: string;
  readonly reference: string;
  readonly amount: number;
  readonly customerId: string | undefined;
  readonly detail: string;
  readonly decidedBy: string | undefined;
  readonly decidedAt: string | undefined;
  readonly note: string | undefined;
}

export interface SalesOrder {
  readonly id: string;
  readonly number: string;
  readonly createdAt: string;
  readonly createdBy: string;
  readonly customerId: string | undefined;
  readonly lines: readonly BillLine[];
  readonly total: number;
  readonly payment: PaymentMethod;
  readonly downPayment: number;
  readonly status: 'draf';
  readonly source: 'owner' | 'sales';
  readonly approvalId?: string | undefined;
  readonly synced?: boolean | undefined;
}

export interface PurchaseOrderLine {
  readonly productId: string;
  readonly unit: string;
  readonly quantity: number;
  readonly unitPrice: number;
}

export interface PurchaseOrder {
  readonly id: string;
  readonly number: string;
  readonly createdAt: string;
  readonly createdBy: string;
  readonly supplierId: string;
  readonly warehouse: WarehouseId;
  readonly lines: readonly PurchaseOrderLine[];
  readonly total: number;
  readonly status: 'draf' | 'dipesan' | 'diterima-sebagian' | 'diterima';
}

// Retur yang dicatat di Back-Office (BO-10). Penjualan: barang kembali dari pelanggan; pembelian:
// barang dikembalikan ke pemasok. `applied` memotong piutang atau hutang, `toDeposit` menambah
// deposit pelanggan, `cash` adalah uang tunai atau transfer yang dikembalikan atau diterima.
export type ReturnNoteKind = 'penjualan' | 'pembelian';
export type ReturnNoteSettlement = 'tunai' | 'transfer' | 'potong' | 'deposit';
export type ReturnNoteStatus = 'selesai' | 'menunggu';

export interface ReturnNoteLine {
  readonly index: number;
  readonly productId: string;
  readonly unit: string;
  readonly quantity: number;
  readonly value: number;
}

export interface ReturnNote {
  readonly id: string;
  readonly number: string;
  readonly kind: ReturnNoteKind;
  readonly at: string;
  readonly userId: string;
  readonly sourceNumber: string;
  readonly partyId: string | undefined;
  readonly partyName: string;
  readonly lines: readonly ReturnNoteLine[];
  readonly total: number;
  readonly settlement: ReturnNoteSettlement;
  readonly warehouse: WarehouseId;
  readonly applied: number;
  readonly toDeposit: number;
  readonly cash: number;
  readonly reason: string;
  readonly status: ReturnNoteStatus;
}

// Mutasi saldo deposit pelanggan: setoran, pemakaian untuk piutang, atau kredit dari retur.
export type DepositEntryKind = 'setor' | 'pakai' | 'retur';

export interface DepositEntry {
  readonly id: string;
  readonly number: string;
  readonly kind: DepositEntryKind;
  readonly at: string;
  readonly userId: string;
  readonly customerId: string;
  readonly amount: number;
  readonly balanceAfter: number;
  readonly method: 'tunai' | 'transfer' | undefined;
  readonly reference: string;
  readonly note: string;
}

export interface Dataset {
  readonly seed: number;
  readonly referenceDate: string;
  readonly products: readonly Product[];
  readonly customers: readonly Customer[];
  readonly users: readonly AppUser[];
  readonly bills: readonly HeldBill[];
  readonly sales: readonly Sale[];
  readonly queue: readonly SyncItem[];
  readonly dailyRevenue: readonly DailyRevenue[];
  readonly suppliers: readonly Supplier[];
  readonly expenses: readonly ExpenseRecord[];
  readonly approvals: readonly ApprovalRequest[];
}
