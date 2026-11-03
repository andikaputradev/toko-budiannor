import { generateDataset } from '../../../src/shared/data/generator';
import type { Customer, Dataset } from '../../../src/shared/data/types';
import { createStore } from '../../../src/shared/store/store';
import { createMemoryVault } from '../../../src/apps/owner/domain/auth';
import { createOwnerSession } from '../../../src/apps/owner/owner-session';

export function need<T>(value: T | undefined): T {
  if (value === undefined) {
    throw new Error('data uji kosong');
  }
  return value;
}

export function fakeStorage(): Storage {
  const map = new Map<string, string>();
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => {
      map.set(key, value);
    },
    removeItem: (key) => {
      map.delete(key);
    },
    clear: () => {
      map.clear();
    },
    key: (index) => [...map.keys()][index] ?? null,
    get length() {
      return map.size;
    },
  };
}

export function lateCustomer(base: Dataset, daysLate: number, id = 'C-900'): Customer {
  const reference = new Date(base.referenceDate);
  const due = new Date(reference.getTime() - daysLate * 24 * 60 * 60 * 1000);
  return {
    id,
    code: 'C0900',
    name: 'Toko Uji Terlambat',
    phone: '081234567890',
    tier: 'grosir',
    limit: 5_000_000,
    invoices: [
      {
        id: 'INV-900',
        issuedAt: '2026-09-01',
        dueAt: due.toISOString().slice(0, 10),
        amount: 1_000_000,
        paid: 0,
      },
    ],
  };
}

export function setup(options: { online?: boolean; signedIn?: boolean } = {}) {
  const dataset = generateDataset();
  const store = createStore({ dataset });
  let now = 1_000_000;
  const vault = createMemoryVault();
  const pending: (() => void)[] = [];
  const session = createOwnerSession(store, {
    clock: () => now,
    vault,
    schedule: (run) => {
      run();
    },
  });
  if (options.signedIn ?? true) {
    store.setOnline(true);
    const result = session.login('haris.owner', 'Kunci2026A');
    if (!result.ok) {
      throw new Error('login uji gagal');
    }
  }
  store.setOnline(options.online ?? true);
  return {
    dataset,
    store,
    session,
    vault,
    pending,
    advance: (ms: number) => (now += ms),
  };
}
