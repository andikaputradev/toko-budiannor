import { describe, expect, it } from 'vitest';
import { generateDataset } from '../../../src/shared/data/generator';
import { DAILY_TARGET } from '../../../src/apps/owner/domain/constants';
import { buildNotification } from '../../../src/apps/owner/domain/notifications';
import { pullDistance, shouldRefresh } from '../../../src/apps/owner/pull-refresh';
import { lateCustomer } from './support';

const data = generateDataset();
const now = new Date(data.referenceDate);

describe('notifikasi push simulasi', () => {
  it('membuat notifikasi stok di bawah minimum dengan jumlah dan barang paling kritis', () => {
    const item = buildNotification('stok', data, now, 'N-1');
    expect(item?.title).toBe('Stok di bawah minimum');
    expect(item?.body).toMatch(/^\d+ barang di bawah stok minimum\. Paling kritis: /);
    expect(item?.read).toBe(false);
    expect(buildNotification('stok', { ...data, products: [] }, now, 'N-2')).toBeUndefined();
  });

  it('membuat notifikasi piutang hanya bila terlambat lebih dari 7 hari', () => {
    const none = { ...data, customers: [lateCustomer(data, 7)] };
    expect(buildNotification('piutang', none, now, 'N-3')).toBeUndefined();
    const some = { ...data, customers: [lateCustomer(data, 8)] };
    const item = buildNotification('piutang', some, now, 'N-4');
    expect(item?.title).toBe('Piutang terlambat lebih dari 7 hari');
    expect(item?.body).toContain('Toko Uji Terlambat (8 hari)');
  });

  it('membuat notifikasi omzet hanya di bawah target harian', () => {
    const below = buildNotification('omzet', { ...data, sales: [] }, now, 'N-5');
    expect(below?.body).toContain('di bawah target');
    expect(below?.body).toContain('Rp 10.000.000');
    const sale = data.sales.at(-1);
    if (sale === undefined) {
      throw new Error('data kosong');
    }
    const big = { ...data, sales: [{ ...sale, total: DAILY_TARGET + 1 }] };
    expect(buildNotification('omzet', big, now, 'N-6')).toBeUndefined();
  });

  it('memakai waktu yang diberikan untuk notifikasi awal', () => {
    const earlier = new Date(now.getTime() - 60_000);
    expect(buildNotification('stok', data, now, 'N-7', earlier)?.at).toBe(earlier.toISOString());
  });
});

describe('tarik untuk muat ulang', () => {
  it('menghitung jarak tarik hanya dari posisi gulir paling atas dan membatasinya', () => {
    expect(pullDistance(100, 190, 0)).toBe(90);
    expect(pullDistance(100, 190, 5)).toBe(0);
    expect(pullDistance(100, 50, 0)).toBe(0);
    expect(pullDistance(0, 900, 0)).toBe(140);
  });

  it('memicu muat ulang pada ambang 70 px', () => {
    expect(shouldRefresh(69)).toBe(false);
    expect(shouldRefresh(70)).toBe(true);
  });
});
