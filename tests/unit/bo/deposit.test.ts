import { describe, expect, it } from 'vitest';
import type { Customer, DepositEntry } from '../../../src/shared/data/types';
import {
  applyTopUp,
  applyUse,
  checkTopUp,
  checkUse,
  depositHistory,
  depositOf,
  depositRows,
  holderCount,
  maxUsable,
  previewUse,
  receivableOf,
  totalDeposit,
} from '../../../src/apps/bo/domain/deposit';

const SAMPLE_CUSTOMER: Customer = {
  id: 'C-001',
  code: 'PEL-001',
  name: 'Toko Bangunan Berkah',
  phone: '081234567890',
  address: 'Jl. Ahmad Yani Km 33',
  tier: 'grosir',
  limit: 50000000,
  dueDays: 30,
  deposit: 5000000,
  invoices: [
    { id: 'INV-01', issuedAt: '2026-10-01', amount: 3000000, paid: 1000000, dueAt: '2026-10-10' },
    { id: 'INV-02', issuedAt: '2026-10-01', amount: 4000000, paid: 0, dueAt: '2026-10-25' },
  ],
};

const SAMPLE_CUSTOMER_2: Customer = {
  id: 'C-002',
  code: 'PEL-002',
  name: 'Pak Joko Sentosa',
  phone: '081987654321',
  address: 'Jl. Pangeran Antasari',
  tier: 'eceran',
  limit: 0,
  dueDays: 0,
  deposit: 0,
  invoices: [],
};

describe('Domain Deposit Pelanggan Back-Office', () => {
  it('dapat membaca saldo deposit dan sisa piutang pelanggan', () => {
    expect(depositOf(SAMPLE_CUSTOMER)).toBe(5000000);
    expect(depositOf(SAMPLE_CUSTOMER_2)).toBe(0);

    // Sisa piutang: (3jt - 1jt) + 4jt = 6jt
    expect(receivableOf(SAMPLE_CUSTOMER)).toBe(6000000);
    expect(receivableOf(SAMPLE_CUSTOMER_2)).toBe(0);
  });

  it('dapat menghitung total deposit dan jumlah pemilik deposit', () => {
    const list = [SAMPLE_CUSTOMER, SAMPLE_CUSTOMER_2];
    expect(totalDeposit(list)).toBe(5000000);
    expect(holderCount(list)).toBe(1);
  });

  it('dapat memfilter daftar deposit berdasarkan kriteria dan pencarian', () => {
    const list = [SAMPLE_CUSTOMER, SAMPLE_CUSTOMER_2];

    const withBalanceOnly = depositRows(list, '', 'bersaldo');
    expect(withBalanceOnly.length).toBe(1);
    expect(withBalanceOnly[0]?.customer.id).toBe('C-001');

    const allRows = depositRows(list, '', 'semua');
    expect(allRows.length).toBe(2);

    const searched = depositRows(list, 'Joko', 'semua');
    expect(searched.length).toBe(1);
    expect(searched[0]?.customer.id).toBe('C-002');
  });

  it('dapat memvalidasi nominal top-up setor deposit', () => {
    const valid = checkTopUp('1.500.000');
    expect(valid.ok).toBe(true);
    if (valid.ok) {
      expect(valid.amount).toBe(1500000);
    }

    const invalidZero = checkTopUp('0');
    expect(invalidZero.ok).toBe(false);

    const invalidText = checkTopUp('abc');
    expect(invalidText.ok).toBe(false);
  });

  it('dapat memvalidasi pemakaian deposit untuk pelunasan piutang', () => {
    expect(maxUsable(SAMPLE_CUSTOMER)).toBe(5000000); // min(5jt, 6jt)

    // Valid pemakaian
    const valid = checkUse(SAMPLE_CUSTOMER, '2.000.000');
    expect(valid.ok).toBe(true);

    // Melebihi deposit (saldo 5jt, minta 7jt)
    const overDeposit = checkUse(SAMPLE_CUSTOMER, '7.000.000');
    expect(overDeposit.ok).toBe(false);

    // Pemakaian nol atau minus
    const invalidZero = checkUse(SAMPLE_CUSTOMER, '0');
    expect(invalidZero.ok).toBe(false);
  });

  it('dapat membuat pratinjau alokasi faktur FIFO saat deposit digunakan', () => {
    const allocation = previewUse(SAMPLE_CUSTOMER, 2500000);
    expect(allocation.length).toBe(2);

    // Faktur pertama (sisa 2jt) dilunasi penuh
    expect(allocation[0]?.id).toBe('INV-01');
    expect(allocation[0]?.pay).toBe(2000000);
    expect(allocation[0]?.after).toBe(0);

    // Faktur kedua (sisa 4jt) terbayar 500rb
    expect(allocation[1]?.id).toBe('INV-02');
    expect(allocation[1]?.pay).toBe(500000);
    expect(allocation[1]?.after).toBe(3500000);
  });

  it('dapat memperbarui data pelanggan saat setor dan pakai deposit', () => {
    const toppedUp = applyTopUp(SAMPLE_CUSTOMER, 1000000);
    expect(toppedUp.deposit).toBe(6000000);

    const used = applyUse(SAMPLE_CUSTOMER, 2000000);
    expect(used.deposit).toBe(3000000);
    expect(receivableOf(used)).toBe(4000000);
  });

  it('dapat menyusun riwayat mutasi deposit pelanggan', () => {
    const entries: readonly DepositEntry[] = [
      {
        id: 'DEP-01',
        number: 'DEP/2610/0001',
        at: '2026-10-19T09:00:00.000Z',
        customerId: 'C-001',
        kind: 'setor',
        method: 'transfer',
        amount: 5000000,
        balanceAfter: 5000000,
        reference: '',
        note: 'Transfer BCA awal',
        userId: 'u-kasir',
      },
    ];

    const history = depositHistory(SAMPLE_CUSTOMER, entries);
    expect(history.length).toBeGreaterThan(0);
    expect(history[0]?.inflow).toBe(5000000);
  });
});
