import { formatRupiah } from '../../../shared/format';
import type { Dataset } from '../../../shared/data/types';
import { calculateTransactionAgeDays } from './transaction-list';

export type PartyType = 'pelanggan' | 'pemasok';

export interface PartyBalance {
  readonly partyId: string;
  readonly name: string;
  readonly phone: string;
  readonly address: string;
  readonly totalBalance: number;
  readonly overdueBalance: number;
  readonly invoicesCount: number;
  readonly type: PartyType;
}

export interface UnpaidInvoice {
  readonly invoiceNumber: string;
  readonly date: string;
  readonly dueDate: string;
  readonly amount: number;
  readonly paid: number;
  readonly remaining: number;
  readonly isOverdue: boolean;
  readonly ageDays: number;
}

export interface PaymentAllocation {
  readonly invoiceNumber: string;
  readonly amount: number;
  readonly remainingAfter: number;
}

export interface PaymentRecord {
  readonly id: string;
  readonly receiptNumber: string;
  readonly partyId: string;
  readonly partyName: string;
  readonly partyType: PartyType;
  readonly date: string;
  readonly method: 'kas' | 'bank' | 'giro' | 'deposit';
  readonly reference: string;
  readonly note: string;
  readonly totalAmount: number;
  readonly allocations: readonly PaymentAllocation[];
}

export function getReceivableBalances(dataset: Dataset): PartyBalance[] {
  const today = dataset.referenceDate.slice(0, 10);
  const result: PartyBalance[] = [];

  for (const cust of dataset.customers) {
    const invs = cust.invoices;
    let totalBalance = 0;
    let overdueBalance = 0;
    let count = 0;

    for (const inv of invs) {
      const remaining = Math.max(0, inv.amount - inv.paid);
      if (remaining > 0) {
        totalBalance += remaining;
        count += 1;
        if (inv.dueAt && inv.dueAt < today) {
          overdueBalance += remaining;
        }
      }
    }

    if (totalBalance > 0 || cust.invoices.length > 0) {
      result.push({
        partyId: cust.id,
        name: cust.name,
        phone: cust.phone && cust.phone !== '' ? cust.phone : '-',
        address: cust.address && cust.address !== '' ? cust.address : '-',
        totalBalance,
        overdueBalance,
        invoicesCount: count,
        type: 'pelanggan',
      });
    }
  }

  return result.sort((a, b) => b.totalBalance - a.totalBalance);
}

export function getPayableBalances(dataset: Dataset): PartyBalance[] {
  const result: PartyBalance[] = [];

  for (const supp of dataset.suppliers) {
    const total = supp.payable;
    if (total > 0) {
      const overdue = Math.round(total * 0.4);
      result.push({
        partyId: supp.id,
        name: supp.name,
        phone: supp.phone !== '' ? supp.phone : '-',
        address: 'Pergudangan Industri No. 8',
        totalBalance: total,
        overdueBalance: overdue,
        invoicesCount: Math.max(1, Math.ceil(total / 2_000_000)),
        type: 'pemasok',
      });
    }
  }

  return result.sort((a, b) => b.totalBalance - a.totalBalance);
}

export function getUnpaidInvoicesForParty(
  partyId: string,
  partyType: PartyType,
  dataset: Dataset,
): UnpaidInvoice[] {
  const today = dataset.referenceDate.slice(0, 10);

  if (partyType === 'pelanggan') {
    const customer = dataset.customers.find((c) => c.id === partyId);
    if (!customer) return [];

    const rawInvs = customer.invoices;
    const list: UnpaidInvoice[] = [];

    for (const inv of rawInvs) {
      const remaining = Math.max(0, inv.amount - inv.paid);
      if (remaining > 0) {
        const isOverdue = Boolean(inv.dueAt && inv.dueAt < today);
        const invDate = inv.issuedAt !== '' ? inv.issuedAt.slice(0, 10) : today;
        const dueDate = inv.dueAt ? inv.dueAt.slice(0, 10) : today;
        const age = calculateTransactionAgeDays(invDate, today);
        list.push({
          invoiceNumber: inv.id,
          date: invDate,
          dueDate,
          amount: inv.amount,
          paid: inv.paid,
          remaining,
          isOverdue,
          ageDays: age,
        });
      }
    }
    return list.sort((a, b) => a.date.localeCompare(b.date));
  }

  // Pemasok (Supplier)
  const supplier = dataset.suppliers.find((s) => s.id === partyId);
  if (!supplier) return [];

  const total = supplier.payable;
  if (total <= 0) return [];

  // Jika supplier belum memiliki invoice terurai, buat 1-3 faktur representatif
  const split1 = Math.round(total * 0.6);
  const split2 = total - split1;
  const list: UnpaidInvoice[] = [
    {
      invoiceNumber: `FB2609${supplier.id.replace(/[^0-9]/g, '')}1`,
      date: '2026-09-15',
      dueDate: '2026-10-15',
      amount: split1,
      paid: 0,
      remaining: split1,
      isOverdue: true,
      ageDays: 35,
    },
  ];

  if (split2 > 0) {
    list.push({
      invoiceNumber: `FB2610${supplier.id.replace(/[^0-9]/g, '')}2`,
      date: '2026-10-05',
      dueDate: '2026-11-05',
      amount: split2,
      paid: 0,
      remaining: split2,
      isOverdue: false,
      ageDays: 15,
    });
  }

  return list;
}

export function allocatePaymentFifo(
  invoices: readonly UnpaidInvoice[],
  paymentAmount: number,
): PaymentAllocation[] {
  let remainingBudget = Math.max(0, paymentAmount);
  const result: PaymentAllocation[] = [];

  for (const inv of invoices) {
    if (remainingBudget <= 0) {
      result.push({
        invoiceNumber: inv.invoiceNumber,
        amount: 0,
        remainingAfter: inv.remaining,
      });
      continue;
    }

    const payThis = Math.min(inv.remaining, remainingBudget);
    remainingBudget -= payThis;
    const remainingAfter = inv.remaining - payThis;

    result.push({
      invoiceNumber: inv.invoiceNumber,
      amount: payThis,
      remainingAfter,
    });
  }

  return result;
}

let receiptCounter = 100;

export function generatePaymentReceiptNumber(): string {
  receiptCounter += 1;
  return `KW2610${String(receiptCounter).padStart(4, '0')}`;
}

export function buildWhatsAppBillStatement(
  party: PartyBalance,
  invoices: readonly UnpaidInvoice[],
  storeName = 'Toko Budiannor',
): string {
  const invoiceRows = invoices
    .map(
      (inv, idx) =>
        `${idx + 1}. No: *${inv.invoiceNumber}* (${inv.date})\n   Tagihan: ${formatRupiah(inv.amount)} | Sisa: *${formatRupiah(inv.remaining)}*${inv.isOverdue ? ' (JATUH TEMPO)' : ''}`,
    )
    .join('\n');

  return `*TAGIHAN PIUTANG - ${storeName.toUpperCase()}*
----------------------------------------
Kepada Yth: *${party.name}*
Alamat: ${party.address}
Telepon: ${party.phone}

*Daftar Faktur Belum Lunas:*
${invoiceRows || '- Tidak ada tagihan terbuka -'}

----------------------------------------
*TOTAL TAGIHAN: ${formatRupiah(party.totalBalance)}*
${party.overdueBalance > 0 ? `Termasuk Jatuh Tempo: *${formatRupiah(party.overdueBalance)}*\n` : ''}
*Pembayaran dapat ditransfer ke:*
BCA: 018-889-2231 a/n Budiannor
Mandiri: 131-00-1122334 a/n CV Budiannor

Mohon konfirmasi setelah melakukan pembayaran. Terima kasih atas kerjasamanya.`;
}
