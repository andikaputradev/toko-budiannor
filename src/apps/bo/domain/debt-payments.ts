import type { Customer, Dataset, InvoicePayment, Supplier } from '../../../shared/data/types';
import type { PartyType, UnpaidInvoice } from './receivable-payable';

// Pembayaran piutang pelanggan dan hutang pemasok (gambar klien 22 dan 23). Satu dokumen membayar
// satu pihak dan boleh melunasi beberapa faktur sekaligus.
export type PayMethod = 'tunai' | 'transfer' | 'qris' | 'edc';

export const PAY_METHODS: readonly { readonly value: PayMethod; readonly text: string }[] = [
  { value: 'tunai', text: 'Tunai' },
  { value: 'transfer', text: 'Transfer' },
  { value: 'qris', text: 'QRIS' },
  { value: 'edc', text: 'EDC' },
];

export const CASH_ACCOUNTS: readonly string[] = ['Kas', 'Bank'];

export function methodText(method: PayMethod): string {
  return PAY_METHODS.find((item) => item.value === method)?.text ?? method;
}

// Teks Metode Bayar dan Kas / Bank pada daftar: pembayaran Split memuat kedua bagian ("Tunai + Transfer",
// "Kas + Bank"); teks yang sama ditulis sekali.
function joined(values: readonly string[]): string {
  return [...new Set(values)].join(' + ');
}

export function paymentMethodText(payment: DebtPayment): string {
  const parts = payment.parts ?? [{ method: payment.method, account: payment.account, amount: 0 }];
  return joined(parts.map((part) => methodText(part.method)));
}

export function paymentAccountText(payment: DebtPayment): string {
  const parts = payment.parts ?? [{ method: payment.method, account: payment.account, amount: 0 }];
  return joined(parts.map((part) => part.account));
}

export interface DebtAllocation {
  readonly invoiceNumber: string;
  readonly amount: number;
}

// Satu bagian pembayaran: cara bayar, kas atau bank, dan nominalnya. Pembayaran biasa satu bagian;
// pembayaran Split dua bagian, mis. tunai 75.000 dan transfer 25.000 untuk bayar 100.000.
export interface DebtPaymentPart {
  readonly method: PayMethod;
  readonly account: string;
  readonly amount: number;
}

export interface DebtPayment {
  readonly number: string;
  readonly type: PartyType;
  readonly date: string;
  readonly partyId: string;
  readonly partyName: string;
  readonly method: PayMethod;
  readonly account: string;
  readonly total: number;
  readonly note: string;
  readonly userId: string;
  readonly allocations: readonly DebtAllocation[];
  // Dua bagian bila dibayar Split; method dan account di atas mengikuti bagian pertama.
  readonly parts?: readonly DebtPaymentPart[] | undefined;
}

// Isian Split pada formulir: bagian kedua (Cara Bayar, Kas / Bank, Nominal) dan nominal bagian pertama.
// Jumlah kedua nominal harus sama dengan total pembayaran faktur.
export interface SplitDraft {
  readonly method: PayMethod | '';
  readonly account: string;
  readonly firstAmount: number;
  readonly amount: number;
}

export interface DebtPaymentDraft {
  readonly type: PartyType;
  readonly date: string;
  readonly partyId: string;
  readonly note: string;
  readonly method: PayMethod;
  readonly account: string;
  // Jumlah bayar per nomor faktur.
  readonly allocations: Readonly<Record<string, number>>;
  // Kosong bila Split tidak dicentang.
  readonly split?: SplitDraft | undefined;
}

export function numberPrefix(type: PartyType): string {
  return type === 'pelanggan' ? 'PP' : 'PH';
}

export function formatPaymentNumber(type: PartyType, sequence: number): string {
  return `${numberPrefix(type)}-${String(sequence).padStart(4, '0')}`;
}

export function nextPaymentSequence(payments: readonly DebtPayment[], type: PartyType): number {
  return (
    payments
      .filter((payment) => payment.type === type)
      .reduce((max, payment) => Math.max(max, Number(payment.number.slice(3)) || 0), 0) + 1
  );
}

// Riwayat contoh pada Daftar Pembayaran. Hanya catatan: saldo pada data sudah memperhitungkannya.
// Total pembayaran piutang pada tanggal acuan sengaja 17.850.000 seperti pada gambar klien.
export function seedDebtPayments(dataset: Dataset, ownerId: string): readonly DebtPayment[] {
  const today = dataset.referenceDate.slice(0, 10);
  const day = (offset: number): string => {
    const date = new Date(`${today}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() + offset);
    return date.toISOString().slice(0, 10);
  };
  const customers = dataset.customers.filter((customer) => customer.invoices.length > 0);
  const suppliers = dataset.suppliers.filter((supplier) => supplier.payable > 0);
  const users = dataset.users;
  const staff = (index: number): string => users[index % Math.max(1, users.length)]?.id ?? ownerId;
  const make = (
    type: PartyType,
    sequence: number,
    date: string,
    party: { readonly id: string; readonly name: string } | undefined,
    method: PayMethod,
    account: string,
    total: number,
    note: string,
    userId: string,
  ): DebtPayment[] =>
    party === undefined
      ? []
      : [
          {
            number: formatPaymentNumber(type, sequence),
            type,
            date,
            partyId: party.id,
            partyName: party.name,
            method,
            account,
            total,
            note,
            userId,
            allocations: [],
          },
        ];
  return [
    ...make('pelanggan', 1, day(-12), customers[3], 'edc', 'Bank', 7_500_000, 'Lunas', staff(1)),
    ...make('pelanggan', 2, day(-6), customers[2], 'transfer', 'Bank', 2_000_000, '', staff(2)),
    ...make('pelanggan', 3, day(-1), customers[0], 'tunai', 'Kas', 3_500_000, '', ownerId),
    ...make(
      'pelanggan',
      4,
      day(0),
      customers[0],
      'tunai',
      'Kas',
      5_000_000,
      'Janji sisa minggu depan',
      ownerId,
    ),
    ...make('pelanggan', 5, day(0), customers[1], 'transfer', 'Bank', 200_000, '', staff(2)),
    ...make('pelanggan', 6, day(0), customers[4], 'edc', 'Bank', 12_650_000, 'Lunas', staff(1)),
    ...make('pemasok', 1, day(-14), suppliers[0], 'transfer', 'Bank', 10_000_000, '', ownerId),
    ...make('pemasok', 2, day(-4), suppliers[1], 'tunai', 'Kas', 2_500_000, 'Cicilan', ownerId),
    ...make('pemasok', 3, day(0), suppliers[2], 'transfer', 'Bank', 6_000_000, '', ownerId),
  ];
}

export type PaymentIssue = 'pihak' | 'tanggal' | 'nominal' | 'lebih' | 'splitCara' | 'splitJumlah';

export type PaymentCheck =
  | {
      readonly ok: true;
      readonly total: number;
      readonly allocations: readonly DebtAllocation[];
      // Hanya ada pada pembayaran Split.
      readonly parts?: readonly DebtPaymentPart[];
    }
  | { readonly ok: false; readonly issue: PaymentIssue; readonly invoiceNumber?: string };

// Pemeriksaan sebelum menyimpan: pihak terpilih, tanggal terisi, ada nominal, dan tiap alokasi tidak
// melebihi sisa fakturnya. Pada Split, bagian kedua harus memilih cara bayar dan kas atau bank yang
// berbeda dari bagian pertama, kedua nominal terisi, dan jumlahnya sama dengan total.
export function checkPayment(
  draft: DebtPaymentDraft,
  invoices: readonly UnpaidInvoice[],
): PaymentCheck {
  if (draft.partyId === '') {
    return { ok: false, issue: 'pihak' };
  }
  if (draft.date === '') {
    return { ok: false, issue: 'tanggal' };
  }
  const allocations: DebtAllocation[] = [];
  for (const invoice of invoices) {
    const amount = Math.round(draft.allocations[invoice.invoiceNumber] ?? 0);
    if (amount <= 0) {
      continue;
    }
    if (amount > invoice.remaining) {
      return { ok: false, issue: 'lebih', invoiceNumber: invoice.invoiceNumber };
    }
    allocations.push({ invoiceNumber: invoice.invoiceNumber, amount });
  }
  const total = allocations.reduce((sum, item) => sum + item.amount, 0);
  if (total <= 0) {
    return { ok: false, issue: 'nominal' };
  }
  const split = draft.split;
  if (split === undefined) {
    return { ok: true, total, allocations };
  }
  if (
    split.method === '' ||
    split.account === '' ||
    (split.method === draft.method && split.account === draft.account)
  ) {
    return { ok: false, issue: 'splitCara' };
  }
  const first = Math.round(split.firstAmount);
  const second = Math.round(split.amount);
  if (first <= 0 || second <= 0 || first + second !== total) {
    return { ok: false, issue: 'splitJumlah' };
  }
  return {
    ok: true,
    total,
    allocations,
    parts: [
      { method: draft.method, account: draft.account, amount: first },
      { method: split.method, account: split.account, amount: second },
    ],
  };
}

// Pelanggan setelah pembayaran: `paid` tiap faktur bertambah sebesar alokasinya. Pada Split, faktur
// dilunasi dengan bagian pertama dulu; bagian yang habis dilanjutkan dengan bagian berikutnya, jadi
// satu faktur bisa memuat dua catatan bayar.
export function applyToCustomer(
  customer: Customer,
  allocations: readonly DebtAllocation[],
  date: string,
  how: PayMethod | readonly DebtPaymentPart[],
): Customer {
  const byInvoice = new Map(allocations.map((item) => [item.invoiceNumber, item.amount]));
  const queue =
    typeof how === 'string'
      ? [{ method: how, left: Number.POSITIVE_INFINITY }]
      : how.map((part) => ({ method: part.method, left: part.amount }));
  return {
    ...customer,
    invoices: customer.invoices.map((invoice) => {
      const amount = byInvoice.get(invoice.id);
      if (amount === undefined) {
        return invoice;
      }
      const recorded: InvoicePayment[] = [];
      let rest = amount;
      for (const part of queue) {
        const take = Math.min(rest, part.left);
        if (take > 0) {
          recorded.push({
            method: part.method === 'edc' ? 'transfer' : part.method,
            at: date,
            amount: take,
          });
          part.left -= take;
          rest -= take;
        }
      }
      return {
        ...invoice,
        paid: invoice.paid + amount,
        payments: [...(invoice.payments ?? []), ...recorded],
      };
    }),
  };
}

// Pemasok setelah pembayaran: hutang berkurang sebesar total (tidak negatif).
export function applyToSupplier(supplier: Supplier, total: number): Supplier {
  return { ...supplier, payable: Math.max(0, supplier.payable - total) };
}

// Pembagian otomatis (FIFO): faktur terlama dilunasi lebih dulu sampai nominal habis.
export function distribute(
  invoices: readonly UnpaidInvoice[],
  nominal: number,
): Record<string, number> {
  let budget = Math.max(0, Math.round(nominal));
  const result: Record<string, number> = {};
  for (const invoice of invoices) {
    const pay = Math.min(invoice.remaining, budget);
    result[invoice.invoiceNumber] = pay;
    budget -= pay;
  }
  return result;
}

export function sumAllocations(allocations: Readonly<Record<string, number>>): number {
  return Object.values(allocations).reduce((sum, value) => sum + (value > 0 ? value : 0), 0);
}
