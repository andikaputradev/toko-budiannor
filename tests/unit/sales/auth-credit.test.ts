import { describe, expect, it } from 'vitest';
import { generateDataset } from '../../../src/shared/data/generator';
import { checkLogin } from '../../../src/apps/bo/domain/auth';
import {
  checkSalesLogin,
  createMemoryVault,
  createStorageVault,
} from '../../../src/apps/sales/domain/auth';
import { buildOrderCopy } from '../../../src/apps/sales/domain/copy';
import { creditWarning } from '../../../src/apps/sales/domain/credit';
import { isValidPhone, normalizePhone } from '../../../src/apps/sales/sales-session';
import { checkReceivable } from '../../../src/shared/data/receivable';
import { fakeStorage, lateCustomer } from '../owner/support';
import { need } from './support';

const data = generateDataset();
const users = data.users;
const now = new Date(data.referenceDate);

describe('login Sales Lapangan', () => {
  it('memeriksa isian kosong, kombinasi salah, akun nonaktif, dan peran bukan Sales', () => {
    expect(checkSalesLogin(users, '', 'x', true, [])).toEqual({
      kind: 'error',
      messageId: 'MSG-052',
    });
    expect(checkSalesLogin(users, 'budi.sales', '', true, [])).toEqual({
      kind: 'error',
      messageId: 'MSG-053',
    });
    expect(checkSalesLogin(users, 'budi.sales', 'salah', true, [])).toEqual({
      kind: 'error',
      messageId: 'MSG-054',
    });
    expect(checkSalesLogin(users, 'haris.owner', 'Kunci2026A', true, [])).toEqual({
      kind: 'label',
      labelKey: 'hanyaSales',
    });
    const inactive = users.map((user) => (user.id === 'U-6' ? { ...user, active: false } : user));
    expect(checkSalesLogin(inactive, 'budi.sales', 'Kunci2026F', true, [])).toEqual({
      kind: 'error',
      messageId: 'MSG-020',
    });
  });

  it('mengizinkan masuk offline hanya pada HP yang pernah dipakai masuk', () => {
    expect(checkSalesLogin(users, 'budi.sales', 'Kunci2026F', false, [])).toEqual({
      kind: 'label',
      labelKey: 'masukPertamaButuhInternet',
    });
    expect(checkSalesLogin(users, 'budi.sales', 'Kunci2026F', false, ['U-6']).kind).toBe('ok');
    expect(checkSalesLogin(users, 'budi.sales', 'Kunci2026F', true, []).kind).toBe('ok');
  });

  it('menolak akun Sales pada Back-Office', () => {
    const outcome = checkLogin(
      users,
      'budi.sales',
      'Kunci2026F',
      { failures: 0, lockedUntil: undefined },
      0,
    );
    expect(outcome).toMatchObject({ kind: 'error', messageId: 'MSG-003' });
  });

  it('menyimpan sesi dan perangkat dikenal pada brankas memori dan penyimpanan lokal', () => {
    const memory = createMemoryVault();
    memory.write({ userId: 'U-6', expiresAt: 9 });
    memory.remember('U-6');
    memory.remember('U-6');
    expect(memory.read()).toEqual({ userId: 'U-6', expiresAt: 9 });
    expect(memory.known()).toEqual(['U-6']);
    memory.clear();
    expect(memory.read()).toBeUndefined();
    expect(memory.known()).toEqual(['U-6']);

    const storage = fakeStorage();
    const vault = createStorageVault(storage);
    vault.write({ userId: 'U-6', expiresAt: 5 });
    vault.remember('U-6');
    expect(vault.read()).toEqual({ userId: 'U-6', expiresAt: 5 });
    expect(vault.known()).toEqual(['U-6']);
    storage.setItem('tb-pos-sales-session', '{rusak');
    storage.setItem('tb-pos-sales-known', '{rusak');
    expect(vault.read()).toBeUndefined();
    expect(vault.known()).toEqual([]);
    expect(createStorageVault(undefined).known()).toEqual([]);
  });
});

describe('validasi piutang Sales', () => {
  it('menyusun kalimat piutang terlambat dengan jumlah dan hari', () => {
    const customer = { ...lateCustomer(data, 12), limit: 900_000_000 };
    const decision = checkReceivable(customer, 1000, now);
    const warning = creditWarning(decision, customer, now);
    expect(warning?.reason).toBe('overdue');
    expect(warning?.text).toBe(
      'Pelanggan ini ada piutang terlambat Rp 1.000.000, sudah 12 hari. Lanjutkan? Butuh Approval Owner.',
    );
  });

  it('menyusun kalimat melebihi limit dan mengabaikan keputusan lolos', () => {
    const customer = { ...lateCustomer(data, 0), invoices: [], limit: 1000 };
    const warning = creditWarning(checkReceivable(customer, 5000, now), customer, now);
    expect(warning?.reason).toBe('over-limit');
    expect(warning?.text).toContain('melebihi sisa limit');
    expect(warning?.text.endsWith('Butuh Approval Owner.')).toBe(true);
    expect(creditWarning({ ok: true }, customer, now)).toBeUndefined();
    expect(creditWarning(checkReceivable(undefined, 1, now), undefined, now)).toBeUndefined();
  });
});

describe('salinan SO dan nomor WhatsApp', () => {
  it('memvalidasi nomor WhatsApp sembilan sampai empat belas angka', () => {
    expect(isValidPhone('0812-3456-7890')).toBe(true);
    expect(isValidPhone('+62 812 3456 7890')).toBe(true);
    expect(isValidPhone('12')).toBe(false);
    expect(isValidPhone('0712345678')).toBe(false);
    expect(normalizePhone('0812 3456-7890')).toBe('081234567890');
  });

  it('menyusun salinan SO lengkap dengan DP dan sisa tagihan', () => {
    const product = need(data.products[0]);
    const lines = buildOrderCopy(
      {
        id: 'SO-0001',
        number: 'SO-0001',
        createdAt: data.referenceDate,
        createdBy: 'U-6',
        customerId: undefined,
        lines: [{ productId: product.id, unit: 'Sak', quantity: 2, unitPrice: 50000 }],
        total: 100000,
        payment: 'dp',
        downPayment: 30000,
        status: 'draf',
        source: 'sales',
      },
      {
        salesName: 'Budi Lapangan',
        customerName: 'Pelanggan umum',
        product: (id) => data.products.find((item) => item.id === id),
        statusText: 'Draf',
      },
    );
    const text = lines.join('\n');
    expect(lines[0]).toBe('SALINAN SALES ORDER');
    expect(text).toContain('No. SO: SO-0001');
    expect(text).toContain('Sales: Budi Lapangan');
    expect(text).toContain('2 Sak x Rp 50.000 = Rp 100.000');
    expect(text).toContain('Total Sales Order: Rp 100.000');
    expect(text).toContain('Uang muka (DP): Rp 30.000');
    expect(text).toContain('Sisa tagihan: Rp 70.000');
  });
});
