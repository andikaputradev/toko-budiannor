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
}

export interface ReceivableInvoice {
  readonly id: string;
  readonly issuedAt: string;
  readonly dueAt: string;
  readonly amount: number;
  readonly paid: number;
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

export interface BillLine {
  readonly productId: string;
  readonly unit: string;
  readonly quantity: number;
  readonly unitPrice: number;
}

export interface HeldBill {
  readonly id: string;
  readonly number: string;
  readonly createdAt: string;
  readonly userId: string;
  readonly customerId: string | undefined;
  readonly lines: readonly BillLine[];
}

export type PaymentMethod = 'tunai' | 'qris' | 'transfer' | 'dp' | 'piutang';

export type RefundMethod = 'tunai' | 'qris' | 'edc' | 'transfer';

export interface SalePayment {
  readonly method: PaymentMethod;
  readonly amount: number;
  readonly via?: PaymentMethod | undefined;
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

export interface Supplier {
  readonly id: string;
  readonly name: string;
  readonly phone: string;
  readonly payable: number;
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
