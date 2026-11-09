import { wibDate } from '../../../shared/data/receivable';
import type { Customer, DepositEntry } from '../../../shared/data/types';
import { parseAmount, settleInvoices } from '../../../shared/domain/receivables';
import { formatRupiah } from '../../../shared/format';
import { label, message } from '../../../shared/messages';

export type DepositFilter = 'bersaldo' | 'semua';

export interface DepositRow {
  readonly customer: Customer;
  readonly deposit: number;
  readonly outstanding: number;
}

export type AmountCheck =
  { readonly ok: true; readonly amount: number } | { readonly ok: false; readonly text: string };

export interface UseAllocation {
  readonly id: string;
  readonly dueAt: string;
  readonly remaining: number;
  readonly pay: number;
  readonly after: number;
}

export interface HistoryRow {
  readonly id: string;
  readonly number: string;
  readonly at: string;
  readonly description: string;
  readonly inflow: number;
  readonly outflow: number;
  readonly balance: number;
  readonly entry: DepositEntry | undefined;
}

export function depositOf(customer: Customer): number {
  return Math.max(0, customer.deposit ?? 0);
}

export function receivableOf(customer: Customer): number {
  return customer.invoices.reduce(
    (sum, invoice) => sum + Math.max(0, invoice.amount - invoice.paid),
    0,
  );
}

export function depositRows(
  customers: readonly Customer[],
  query: string,
  filter: DepositFilter,
): DepositRow[] {
  const wanted = query.trim().toLowerCase();
  return customers
    .filter((customer) => {
      if (filter === 'bersaldo' && depositOf(customer) <= 0) {
        return false;
      }
      return (
        wanted === '' ||
        customer.name.toLowerCase().includes(wanted) ||
        customer.code.toLowerCase().includes(wanted) ||
        customer.phone.includes(wanted)
      );
    })
    .map((customer) => ({
      customer,
      deposit: depositOf(customer),
      outstanding: receivableOf(customer),
    }))
    .sort(
      (first, second) =>
        second.deposit - first.deposit || first.customer.name.localeCompare(second.customer.name),
    );
}

export function totalDeposit(customers: readonly Customer[]): number {
  return customers.reduce((sum, customer) => sum + depositOf(customer), 0);
}

export function holderCount(customers: readonly Customer[]): number {
  return customers.filter((customer) => depositOf(customer) > 0).length;
}

export function parseMoney(raw: string): number {
  return parseAmount(raw);
}

export function maxUsable(customer: Customer): number {
  return Math.min(depositOf(customer), receivableOf(customer));
}

export function checkTopUp(raw: string): AmountCheck {
  const amount = parseMoney(raw);
  return amount > 0 ? { ok: true, amount } : { ok: false, text: message('MSG-029') };
}

export function checkUse(customer: Customer, raw: string): AmountCheck {
  const amount = parseMoney(raw);
  if (amount <= 0) {
    return { ok: false, text: message('MSG-029') };
  }
  const balance = depositOf(customer);
  if (amount > balance) {
    return {
      ok: false,
      text: label('boDepositMelebihiSaldo', { saldo: formatRupiah(balance) }),
    };
  }
  const owed = receivableOf(customer);
  if (amount > owed) {
    return { ok: false, text: message('MSG-087', { saldo: formatRupiah(owed) }) };
  }
  return { ok: true, amount };
}

// Rincian faktur yang akan lunas lebih dulu: urutan jatuh tempo terlama, sama dengan pembayaran piutang.
export function previewUse(customer: Customer, amount: number): UseAllocation[] {
  const settled = settleInvoices(customer.invoices, amount);
  const paidAfter = new Map(settled.map((invoice) => [invoice.id, invoice.paid]));
  return customer.invoices
    .filter((invoice) => invoice.amount - invoice.paid > 0)
    .sort((first, second) => first.dueAt.localeCompare(second.dueAt))
    .map((invoice) => {
      const remaining = invoice.amount - invoice.paid;
      const pay = Math.max(0, (paidAfter.get(invoice.id) ?? invoice.paid) - invoice.paid);
      return { id: invoice.id, dueAt: invoice.dueAt, remaining, pay, after: remaining - pay };
    });
}

export function applyTopUp(customer: Customer, amount: number): Customer {
  return { ...customer, deposit: depositOf(customer) + amount };
}

export function applyUse(customer: Customer, amount: number): Customer {
  return {
    ...customer,
    deposit: depositOf(customer) - amount,
    invoices: settleInvoices(customer.invoices, amount),
  };
}

function describeEntry(entry: DepositEntry): string {
  const base =
    entry.kind === 'setor'
      ? label(entry.method === 'transfer' ? 'boDepositKetSetorTransfer' : 'boDepositKetSetorTunai')
      : entry.kind === 'pakai'
        ? label('boDepositKetPakai')
        : label('boDepositKetRetur', { nomor: entry.reference });
  return entry.note.trim() === '' ? base : `${base}: ${entry.note.trim()}`;
}

// Riwayat dari yang terbaru. Saldo awal dihitung dari saldo kini dikurangi seluruh mutasi tercatat,
// sehingga deposit bawaan data contoh tetap tampil sebagai baris pembuka.
export function depositHistory(customer: Customer, entries: readonly DepositEntry[]): HistoryRow[] {
  const mine = entries
    .filter((entry) => entry.customerId === customer.id)
    .sort(
      (first, second) => first.at.localeCompare(second.at) || first.id.localeCompare(second.id),
    );
  const net = mine.reduce(
    (sum, entry) => sum + (entry.kind === 'pakai' ? -entry.amount : entry.amount),
    0,
  );
  const opening = Math.max(0, depositOf(customer) - net);
  const rows: HistoryRow[] = mine.map((entry) => ({
    id: entry.id,
    number: entry.number,
    at: entry.at,
    description: describeEntry(entry),
    inflow: entry.kind === 'pakai' ? 0 : entry.amount,
    outflow: entry.kind === 'pakai' ? entry.amount : 0,
    balance: entry.balanceAfter,
    entry,
  }));
  rows.reverse();
  if (opening > 0) {
    rows.push({
      id: `${customer.id}-awal`,
      number: '',
      at: '',
      description: label('boDepositSaldoAwal'),
      inflow: opening,
      outflow: 0,
      balance: opening,
      entry: undefined,
    });
  }
  return rows;
}

export function todayTotals(
  entries: readonly DepositEntry[],
  day: string,
): { readonly inflow: number; readonly outflow: number } {
  const today = entries.filter((entry) => wibDate(new Date(entry.at)) === day);
  return {
    inflow: today.filter((entry) => entry.kind !== 'pakai').reduce((sum, e) => sum + e.amount, 0),
    outflow: today.filter((entry) => entry.kind === 'pakai').reduce((sum, e) => sum + e.amount, 0),
  };
}
