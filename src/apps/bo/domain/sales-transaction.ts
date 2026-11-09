import { formatRupiah } from '../../../shared/format';
import type { Customer, Dataset, SalesOrder } from '../../../shared/data/types';
import { calculateTieredDiscount } from './discount';

export interface SalesInvoiceLine {
  readonly id: string;
  readonly productId: string;
  readonly productName: string;
  readonly aliasName: string;
  readonly warehouse: 'toko' | 'gudang';
  readonly unit: string;
  readonly quantity: number;
  readonly unitPrice: number;
  readonly discountExpr: string;
  readonly lastSalePrice?: number | undefined;
}

export interface SalesInvoiceDraft {
  readonly invoiceNumber: string;
  readonly date: string;
  readonly soNumber: string;
  readonly customerId: string | undefined;
  readonly customerName: string;
  readonly customerAddress: string;
  readonly customerPhone: string;
  readonly notes: string;
  readonly salesPerson: string;
  readonly expedition: string;
  readonly paymentTerms: 'piutang' | 'tunai';
  readonly tempoDays: number;
  readonly paymentChannel: 'kas' | 'bank';
  readonly lines: readonly SalesInvoiceLine[];
  readonly subtotal: number;
  readonly invoiceDiscount: number;
  readonly expeditionFee: number;
  readonly grandTotal: number;
}

export interface CustomerCreditInfo {
  readonly totalPiutang: number;
  readonly piutangJatuhTempo: number;
  readonly creditLimit: number;
  readonly remainingCredit: number;
  readonly isOverlimit: boolean;
  readonly depositBalance: number;
}

export function calculateSalesTotals(
  lines: readonly SalesInvoiceLine[],
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

let invoiceCounter = 1234;

export function generateSalesInvoiceNumber(): string {
  invoiceCounter += 1;
  return `FJ2610${String(invoiceCounter).padStart(4, '0')}`;
}

export function createSalesInvoiceDraft(
  dataset: Dataset,
  defaultDate = dataset.referenceDate.slice(0, 10),
): SalesInvoiceDraft {
  const invoiceNumber = generateSalesInvoiceNumber();
  return {
    invoiceNumber,
    date: defaultDate,
    soNumber: '',
    customerId: undefined,
    customerName: '',
    customerAddress: '',
    customerPhone: '',
    notes: '',
    salesPerson: 'Salahudin',
    expedition: 'JNE Cargo',
    paymentTerms: 'piutang',
    tempoDays: 30,
    paymentChannel: 'kas',
    lines: [],
    subtotal: 0,
    invoiceDiscount: 0,
    expeditionFee: 0,
    grandTotal: 0,
  };
}

export function getCustomerCreditInfo(
  customer: Customer,
  currentInvoiceTotal = 0,
): CustomerCreditInfo {
  const invoices = customer.invoices;
  let totalPiutang = 0;
  let piutangJatuhTempo = 0;

  const today = new Date().toISOString().slice(0, 10);
  for (const inv of invoices) {
    const unpaid = Math.max(0, inv.amount - inv.paid);
    totalPiutang += unpaid;
    if (inv.dueAt && inv.dueAt < today && unpaid > 0) {
      piutangJatuhTempo += unpaid;
    }
  }

  const creditLimit = (customer as unknown as { creditLimit?: number }).creditLimit ?? 25_000_000;
  const depositBalance = 0; // Deposit pelanggan
  const remainingCredit = creditLimit - totalPiutang - currentInvoiceTotal;
  const isOverlimit = remainingCredit < 0;

  return {
    totalPiutang,
    piutangJatuhTempo,
    creditLimit,
    remainingCredit,
    isOverlimit,
    depositBalance,
  };
}

export function importFromSalesOrder(so: SalesOrder, dataset: Dataset): SalesInvoiceDraft {
  const customer = dataset.customers.find((c) => c.id === so.customerId);
  const lines: SalesInvoiceLine[] = so.lines.map((l, idx) => {
    const prod = dataset.products.find((p) => p.id === l.productId);
    return {
      id: `SOL-${idx + 1}`,
      productId: l.productId,
      productName: prod?.name ?? l.productId,
      aliasName: prod?.name ?? '',
      warehouse: 'toko',
      unit: l.unit,
      quantity: l.quantity,
      unitPrice: l.unitPrice,
      discountExpr: '',
      lastSalePrice: l.unitPrice,
    };
  });

  const totals = calculateSalesTotals(lines, 0, 0);

  return {
    invoiceNumber: generateSalesInvoiceNumber(),
    date: so.createdAt.slice(0, 10),
    soNumber: so.number,
    customerId: customer?.id,
    customerName: customer?.name ?? '',
    customerAddress: customer?.address ?? '',
    customerPhone: customer?.phone ?? '',
    notes: `Diimpor dari Sales Order ${so.number}`,
    salesPerson: 'Salahudin',
    expedition: 'JNE Cargo',
    paymentTerms: so.payment === 'piutang' ? 'piutang' : 'tunai',
    tempoDays: 30,
    paymentChannel: 'kas',
    lines,
    subtotal: totals.subtotal,
    invoiceDiscount: 0,
    expeditionFee: 0,
    grandTotal: totals.grandTotal,
  };
}

export function buildSalesInvoiceWhatsAppMessage(
  draft: SalesInvoiceDraft,
  storeName = 'Toko Budiannor',
): string {
  const linesSummary = draft.lines
    .map(
      (l, idx) =>
        `${idx + 1}. ${l.productName} (${l.quantity} ${l.unit}) = ${formatRupiah(l.quantity * l.unitPrice)}`,
    )
    .join('\n');

  return `*FAKTUR PENJUALAN - ${storeName.toUpperCase()}*
----------------------------------------
No. Faktur: *${draft.invoiceNumber}*
Tanggal: ${draft.date}
Kepada Yth: *${draft.customerName || 'Pelanggan'}*
Alamat: ${draft.customerAddress || '-'}

*Rincian Barang:*
${linesSummary || '- Tidak ada item -'}

----------------------------------------
Subtotal: ${formatRupiah(draft.subtotal)}
Diskon: ${formatRupiah(draft.invoiceDiscount)}
Ongkos Kirim/Ekspedisi: ${formatRupiah(draft.expeditionFee)}
*TOTAL AKHIR: ${formatRupiah(draft.grandTotal)}*
Status: *${draft.paymentTerms === 'piutang' ? 'Kredit / Tempo 30 Hari' : 'Tunai'}*

*Rekening Pembayaran Toko Budiannor:*
BCA: 018-889-2231 a/n Budiannor
Mandiri: 131-00-1122334 a/n CV Budiannor

Catatan Pengiriman: ${draft.notes || 'Terima kasih atas kepercayaan Anda.'}`;
}

export function generateWhatsAppUrl(phone: string, text: string): string {
  const cleanPhone = phone.replace(/[^0-9]/g, '');
  let formattedPhone = cleanPhone;
  if (formattedPhone.startsWith('0')) {
    formattedPhone = `62${formattedPhone.slice(1)}`;
  }
  return `https://wa.me/${formattedPhone}?text=${encodeURIComponent(text)}`;
}
