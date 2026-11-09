import type { Dataset, PurchaseOrder, Supplier } from '../../../shared/data/types';
import { calculateTieredDiscount } from './discount';

export interface PurchaseInvoiceLine {
  readonly id: string;
  readonly productId: string;
  readonly productName: string;
  readonly productCode: string;
  readonly destination: 'gudang' | 'toko';
  readonly unit: string;
  readonly quantity: number;
  readonly unitPrice: number;
  readonly discountExpr: string;
  readonly lastPurchasePrice?: number | undefined;
  readonly lastPurchaseDate?: string | undefined;
}

export interface PurchaseInvoiceDraft {
  readonly invoiceNumber: string;
  readonly date: string;
  readonly receivedDate: string;
  readonly poNumber: string;
  readonly supplierId: string | undefined;
  readonly supplierName: string;
  readonly supplierAddress: string;
  readonly supplierPhone: string;
  readonly supplierInvoiceNumber: string;
  readonly notes: string;
  readonly paymentTerms: 'hutang' | 'tunai';
  readonly tempoDays: number;
  readonly paymentChannel: 'kas' | 'bank';
  readonly lines: readonly PurchaseInvoiceLine[];
  readonly subtotal: number;
  readonly expeditionFee: number;
  readonly invoiceDiscount: number;
  readonly grandTotal: number;
}

export interface SupplierDebtInfo {
  readonly totalHutang: number;
  readonly hutangJatuhTempo: number;
}

export function calculatePurchaseTotals(
  lines: readonly PurchaseInvoiceLine[],
  invoiceDiscount = 0,
  expeditionFee = 0,
): {
  subtotal: number;
  invoiceDiscount: number;
  expeditionFee: number;
  grandTotal: number;
} {
  let subtotal = 0;
  for (const line of lines) {
    const calc = calculateTieredDiscount(line.unitPrice, line.discountExpr, line.quantity);
    subtotal += calc.finalTotal;
  }
  const cleanDiscount = Math.max(0, invoiceDiscount);
  const cleanExpedition = Math.max(0, expeditionFee);
  const grandTotal = Math.max(0, subtotal - cleanDiscount + cleanExpedition);
  return {
    subtotal,
    invoiceDiscount: cleanDiscount,
    expeditionFee: cleanExpedition,
    grandTotal,
  };
}

let purchaseCounter = 1234;

export function generatePurchaseInvoiceNumber(): string {
  purchaseCounter += 1;
  return `FB2610${String(purchaseCounter).padStart(4, '0')}`;
}

export function createPurchaseInvoiceDraft(
  dataset: Dataset,
  defaultDate = dataset.referenceDate.slice(0, 10),
): PurchaseInvoiceDraft {
  return {
    invoiceNumber: generatePurchaseInvoiceNumber(),
    date: defaultDate,
    receivedDate: defaultDate,
    poNumber: '',
    supplierId: undefined,
    supplierName: '',
    supplierAddress: '',
    supplierPhone: '',
    supplierInvoiceNumber: '',
    notes: '',
    paymentTerms: 'hutang',
    tempoDays: 30,
    paymentChannel: 'kas',
    lines: [],
    subtotal: 0,
    expeditionFee: 0,
    invoiceDiscount: 0,
    grandTotal: 0,
  };
}

export function getSupplierDebtInfo(supplier: Supplier): SupplierDebtInfo {
  const totalHutang = supplier.payable;
  // Perkiraan hutang jatuh tempo (50% dari hutang jika ada hutang)
  const hutangJatuhTempo = totalHutang > 0 ? Math.round(totalHutang * 0.5) : 0;
  return {
    totalHutang,
    hutangJatuhTempo,
  };
}

export function importFromPurchaseOrder(po: PurchaseOrder, dataset: Dataset): PurchaseInvoiceDraft {
  const supplier = dataset.suppliers.find((s) => s.id === po.supplierId);
  const lines: PurchaseInvoiceLine[] = po.lines.map((l, idx) => {
    const prod = dataset.products.find((p) => p.id === l.productId);
    return {
      id: `POL-${idx + 1}`,
      productId: l.productId,
      productName: prod?.name ?? l.productId,
      productCode: prod?.code ?? '',
      destination: po.warehouse === 'display' ? 'toko' : 'gudang',
      unit: l.unit,
      quantity: l.quantity,
      unitPrice: l.unitPrice,
      discountExpr: '',
      lastPurchasePrice: prod?.lastPurchasePrice ?? l.unitPrice,
      lastPurchaseDate: prod?.lastPurchaseDate ?? '2026-09-12',
    };
  });

  const totals = calculatePurchaseTotals(lines, 0, 0);

  return {
    invoiceNumber: generatePurchaseInvoiceNumber(),
    date: po.createdAt.slice(0, 10),
    receivedDate: po.createdAt.slice(0, 10),
    poNumber: po.number,
    supplierId: supplier?.id,
    supplierName: supplier?.name ?? '',
    supplierAddress: 'Jl. Industri Pergudangan No. 8',
    supplierPhone: supplier?.phone ?? '',
    supplierInvoiceNumber: `SR-${po.number.replace(/[^0-9]/g, '')}`,
    notes: `Diimpor dari Purchase Order ${po.number}`,
    paymentTerms: 'hutang',
    tempoDays: 30,
    paymentChannel: 'bank',
    lines,
    subtotal: totals.subtotal,
    expeditionFee: 0,
    invoiceDiscount: 0,
    grandTotal: totals.grandTotal,
  };
}
