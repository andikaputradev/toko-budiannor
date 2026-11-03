import { describe, expect, it } from 'vitest';
import { generateDataset } from '../../src/shared/data/generator';
import { createEventBus } from '../../src/shared/store/event-bus';
import {
  createPersistence,
  type ChannelLike,
  type StorageLike,
} from '../../src/shared/store/persistence';
import {
  createSessionPersistence,
  createStore,
  parseSession,
  SESSION_KEY,
} from '../../src/shared/store/store';

const dataset = generateDataset();

function createMemoryStorage(initial: Record<string, string> = {}): StorageLike & {
  readonly items: Map<string, string>;
} {
  const items = new Map(Object.entries(initial));
  return {
    items,
    getItem: (key) => items.get(key) ?? null,
    setItem: (key, value) => {
      items.set(key, value);
    },
    removeItem: (key) => {
      items.delete(key);
    },
  };
}

function createHub(): () => ChannelLike {
  const members: { readonly listeners: ((event: { readonly data: unknown }) => void)[] }[] = [];
  return () => {
    const member = { listeners: [] as ((event: { readonly data: unknown }) => void)[] };
    members.push(member);
    return {
      postMessage: (value) => {
        for (const other of members) {
          if (other !== member) {
            for (const listener of other.listeners) {
              listener({ data: structuredClone(value) });
            }
          }
        }
      },
      addEventListener: (_type, listener) => {
        member.listeners.push(listener);
      },
      close: () => undefined,
    };
  };
}

describe('event bus bertipe', () => {
  it('mengirim muatan ke pendengar sesuai jenis dan dapat berhenti berlangganan', () => {
    const bus = createEventBus<{ a: number; b: string }>();
    const received: (number | string)[] = [];
    const stop = bus.on('a', (value) => received.push(value));
    bus.on('b', (value) => received.push(value));
    bus.emit('a', 1);
    bus.emit('b', 'x');
    stop();
    bus.emit('a', 2);
    expect(received).toEqual([1, 'x']);
    bus.clear();
    bus.emit('b', 'y');
    expect(received).toEqual([1, 'x']);
  });
});

describe('persistensi aman', () => {
  const parse = (raw: unknown): number | undefined => (typeof raw === 'number' ? raw : undefined);

  it('menyimpan dan memuat nilai lewat storage', () => {
    const storage = createMemoryStorage();
    const persistence = createPersistence({ key: 'k', parse, storage, createChannel: undefined });
    expect(persistence.load()).toBeUndefined();
    expect(persistence.save(5)).toBe(true);
    expect(persistence.load()).toBe(5);
    persistence.clear();
    expect(persistence.load()).toBeUndefined();
  });

  it('tidak melempar galat bila storage rusak, penuh, atau tidak tersedia', () => {
    const broken: StorageLike = {
      getItem: () => {
        throw new Error('akses ditolak');
      },
      setItem: () => {
        throw new Error('penuh');
      },
      removeItem: () => {
        throw new Error('akses ditolak');
      },
    };
    const persistence = createPersistence({
      key: 'k',
      parse,
      storage: broken,
      createChannel: undefined,
    });
    expect(persistence.load()).toBeUndefined();
    expect(persistence.save(1)).toBe(false);
    expect(() => {
      persistence.clear();
    }).not.toThrow();
    const none = createPersistence({
      key: 'k',
      parse,
      storage: undefined,
      createChannel: undefined,
    });
    expect(none.save(1)).toBe(false);
    expect(none.load()).toBeUndefined();
  });

  it('mengabaikan JSON rusak dan nilai yang gagal divalidasi', () => {
    const storage = createMemoryStorage({ k: '{rusak' });
    const persistence = createPersistence({ key: 'k', parse, storage, createChannel: undefined });
    expect(persistence.load()).toBeUndefined();
    storage.setItem('k', JSON.stringify('bukan angka'));
    expect(persistence.load()).toBeUndefined();
  });

  it('menyiarkan nilai ke jendela lain lewat saluran', () => {
    const channel = createHub();
    const first = createPersistence({
      key: 'k',
      parse,
      storage: undefined,
      createChannel: channel,
    });
    const second = createPersistence({
      key: 'k',
      parse,
      storage: undefined,
      createChannel: channel,
    });
    const received: number[] = [];
    second.subscribe((value) => received.push(value));
    first.save(9);
    expect(received).toEqual([9]);
  });
});

describe('sesi dan store', () => {
  it('memvalidasi sesi tersimpan', () => {
    expect(parseSession(null)).toBeUndefined();
    expect(parseSession({ version: 2 })).toBeUndefined();
    expect(
      parseSession({
        version: 1,
        role: 'peran-palsu',
        online: true,
        reviewMode: false,
        scenario: {},
        negativeReview: [],
        stockOverrides: {},
      }),
    ).toBeUndefined();
  });

  it('mengganti peran dan konektivitas serta memancarkan peristiwa', () => {
    const store = createStore({ dataset });
    const events: string[] = [];
    store.bus.on('role', (payload) => events.push(`role:${payload.role}:${payload.userId}`));
    store.bus.on('connectivity', (payload) => events.push(`online:${String(payload.online)}`));
    store.setRole('kasir');
    store.setOnline(false);
    expect(store.getState().role).toBe('kasir');
    expect(store.getState().userId).toBe('U-3');
    expect(store.getState().online).toBe(false);
    expect(events).toEqual(['role:kasir:U-3', 'online:false']);
  });

  it('memicu limit ditolak untuk pelanggan nyata dengan keputusan dan pesan Lampiran C', () => {
    const store = createStore({ dataset });
    const event = store.triggerLimitRejected();
    expect(event?.kind).toBe('limit');
    if (event?.kind === 'limit') {
      expect(event.decision.ok).toBe(false);
      expect(store.getState().scenario.limitCustomerId).toBe(event.customerId);
    }
  });

  it('memicu stok negatif dan menandai barang untuk ditinjau tanpa mengulang barang sama', () => {
    const store = createStore({ dataset });
    const first = store.triggerNegativeStock();
    const second = store.triggerNegativeStock();
    expect(first?.kind).toBe('negative');
    expect(second?.kind).toBe('negative');
    if (first?.kind === 'negative' && second?.kind === 'negative') {
      expect(first.productId).not.toBe(second.productId);
      const product = store.getState().data.products.find((item) => item.id === first.productId);
      expect(product?.stock.display).toBeLessThan(0);
      expect(store.getState().negativeReview).toEqual([first.productId, second.productId]);
    }
  });

  it('mengatur ulang data ke keadaan awal', () => {
    const store = createStore({ dataset });
    store.setRole('kasir');
    store.setOnline(false);
    store.triggerNegativeStock();
    store.resetData();
    const state = store.getState();
    expect(state.role).toBe('owner');
    expect(state.online).toBe(true);
    expect(state.negativeReview).toEqual([]);
    expect(state.data.products[0]?.stock).toEqual(dataset.products[0]?.stock);
  });

  it('memulihkan sesi dari storage dan menyimpan perubahan', () => {
    const storage = createMemoryStorage();
    const first = createStore({
      dataset,
      persistence: createSessionPersistence({ storage, createChannel: undefined }),
    });
    first.setRole('supervisor');
    first.setOnline(false);
    first.triggerNegativeStock();
    expect(storage.items.has(SESSION_KEY)).toBe(true);
    const second = createStore({
      dataset,
      persistence: createSessionPersistence({ storage, createChannel: undefined }),
    });
    expect(second.getState().role).toBe('supervisor');
    expect(second.getState().online).toBe(false);
    expect(second.getState().negativeReview).toHaveLength(1);
    expect(second.getState().data.products.some((item) => item.stock.display < 0)).toBe(true);
  });

  it('menyinkronkan dua jendela lewat saluran tanpa saling memantul', () => {
    const channel = createHub();
    const make = () =>
      createStore({
        dataset,
        persistence: createSessionPersistence({ storage: undefined, createChannel: channel }),
      });
    const windowA = make();
    const windowB = make();
    let updates = 0;
    windowB.subscribe(() => {
      updates += 1;
    });
    windowA.setRole('frontliner');
    windowA.setOnline(false);
    expect(windowB.getState().role).toBe('frontliner');
    expect(windowB.getState().online).toBe(false);
    expect(updates).toBe(2);
  });

  it('menghormati Mode Tinjau dari opsi awal', () => {
    const store = createStore({ dataset, reviewMode: true });
    expect(store.getState().reviewMode).toBe(true);
    store.setReviewMode(false);
    expect(store.getState().reviewMode).toBe(false);
  });
});
