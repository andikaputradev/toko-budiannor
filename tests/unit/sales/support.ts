import { generateDataset } from '../../../src/shared/data/generator';
import type { Product } from '../../../src/shared/data/types';
import { createStore } from '../../../src/shared/store/store';
import { createMemoryVault } from '../../../src/apps/sales/domain/auth';
import { createSalesSession } from '../../../src/apps/sales/sales-session';

export function need<T>(value: T | undefined): T {
  if (value === undefined) {
    throw new Error('data uji kosong');
  }
  return value;
}

export function setup(options: { online?: boolean; signedIn?: boolean } = {}) {
  const dataset = generateDataset();
  const store = createStore({ dataset });
  const vault = createMemoryVault();
  let now = 1_000_000;
  const session = createSalesSession(store, {
    clock: () => now,
    vault,
    schedule: (run) => {
      run();
    },
  });
  if (options.signedIn ?? true) {
    store.setOnline(true);
    const result = session.login('budi.sales', 'Kunci2026F');
    if (!result.ok) {
      throw new Error('login uji gagal');
    }
  }
  store.setOnline(options.online ?? true);
  const product: Product = need(dataset.products[0]);
  return {
    dataset,
    store,
    session,
    vault,
    product,
    advance: (ms: number) => (now += ms),
  };
}

// Barang uji tetap, tidak bergantung pada data bangkitan: Kg (dasar) dan Sak (isi 40 Kg).
export function fixtureProduct(overrides: Partial<Product> = {}): Product {
  return {
    id: 'P-UJI',
    code: 'U0001',
    barcode: '8990000000999',
    name: 'Semen Uji',
    brand: 'Merk Uji',
    category: 'Bahan Dasar',
    baseUnit: 'Kg',
    allowDecimal: true,
    units: [
      { code: 'Kg', name: 'Kg', factor: 1 },
      { code: 'Sak', name: 'Sak', factor: 40 },
    ],
    prices: {
      Kg: { eceran: 1400, grosir: 1300 },
      Sak: { eceran: 54900, grosir: 51000 },
    },
    hpp: 1000,
    minStock: 800,
    stock: { display: 2496.667, besar: 12787.302 },
    ...overrides,
  };
}
