import { describe, expect, it } from 'vitest';
import { generateDataset } from '../../src/shared/data/generator';
import { totalStock } from '../../src/shared/data/units';
import { need } from './bo/support';
import { createStore } from '../../src/shared/store/store';

const dataset = generateDataset();
const first = need(dataset.products[0]);

describe('store untuk Back-Office', () => {
  it('mengganti barang yang diubah dan menambah barang baru tanpa menghilangkan stok', () => {
    const store = createStore({ dataset });
    store.setStock(first.id, { display: 7, besar: 3 });
    store.saveProduct({ ...first, name: 'Nama Baru' });
    const edited = store.getState().data.products[0];
    expect(edited?.name).toBe('Nama Baru');
    expect(edited?.stock).toEqual({ display: 7, besar: 3 });
    store.saveProduct({ ...first, id: 'P-3601', code: 'B3601', stock: { display: 0, besar: 0 } });
    expect(store.getState().data.products).toHaveLength(3601);
    store.saveProduct({ ...first, id: 'P-3601', code: 'B3601', name: 'Ubah Lagi' });
    expect(store.getState().data.products).toHaveLength(3601);
    expect(store.getState().data.products.at(-1)?.name).toBe('Ubah Lagi');
  });

  it('mengatur stok absolut dan menandai negatif hanya sekali', () => {
    const store = createStore({ dataset });
    expect(store.setStock(first.id, { display: 1, besar: 1 })).toBe(false);
    expect(store.setStock(first.id, { display: -2, besar: 0 })).toBe(true);
    expect(store.setStock(first.id, { display: -3, besar: 0 })).toBe(true);
    expect(store.getState().negativeReview).toEqual([first.id]);
    expect(totalStock(need(store.getState().data.products[0]))).toBe(-3);
    store.markReviewed(first.id);
    expect(store.getState().negativeReview).toEqual([]);
  });

  it('mencatat log aktivitas dengan nomor urut dan mengosongkannya saat atur ulang', () => {
    const store = createStore({ dataset });
    const entry = store.logActivity({
      at: '2026-10-19T03:00:05.000Z',
      userId: 'U-2',
      device: 'Back-Office PC',
      ip: '192.168.1.20',
      kind: 'mutasi',
      detail: 'M-0002',
    });
    expect(entry.id).toBe('A-1');
    store.logActivity({ ...entry, kind: 'harga' });
    expect(store.getState().activity.map((item) => item.id)).toEqual(['A-1', 'A-2']);
    store.resetData();
    expect(store.getState().activity).toEqual([]);
  });

  it('melaporkan antrean POS hanya bila berubah dan mengembalikannya saat atur ulang', () => {
    const store = createStore({ dataset });
    expect(store.getState().posQueue).toBe(3);
    let notified = 0;
    store.subscribe(() => {
      notified += 1;
    });
    store.reportQueue(3);
    expect(notified).toBe(0);
    store.reportQueue(5);
    expect(store.getState().posQueue).toBe(5);
    store.resetData();
    expect(store.getState().posQueue).toBe(3);
  });

  it('membangkitkan omzet harian 31 hari yang konsisten dan akun BO fiktif', () => {
    expect(dataset.dailyRevenue).toHaveLength(31);
    expect(dataset.dailyRevenue.at(-1)?.date).toBe('2026-10-19');
    expect(JSON.stringify(generateDataset().dailyRevenue)).toBe(
      JSON.stringify(dataset.dailyRevenue),
    );
    for (const user of dataset.users) {
      expect(user.username).toMatch(/^[a-z0-9.]{4,30}$/);
      expect(user.password.length).toBeGreaterThanOrEqual(8);
    }
  });
});
