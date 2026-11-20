import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ROLES } from '../../src/shared/data/types';

// Penimpaan hak akses yang diatur Owner. Modul dimuat ulang pada tiap uji karena penimpaan dibaca dari
// localStorage saat modul dimuat; lingkungan uji (node) tidak punya localStorage sehingga dibuat sendiri.

const KEY = 'budiannor.hak-akses';

class MemoryStorage {
  readonly values = new Map<string, string>();
  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
  removeItem(key: string): void {
    this.values.delete(key);
  }
}

let storage: MemoryStorage;

async function load(): Promise<typeof import('../../src/shared/permissions')> {
  vi.resetModules();
  return import('../../src/shared/permissions');
}

beforeEach(() => {
  storage = new MemoryStorage();
  vi.stubGlobal('localStorage', storage);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe('penimpaan hak akses oleh Owner', () => {
  it('tanpa penimpaan, perilaku sama dengan matriks bawaan di seluruh aturan dan peran', async () => {
    const permissions = await load();
    for (const rule of permissions.PERMISSION_RULES) {
      for (const role of ROLES) {
        expect(permissions.accessFor(role, rule.screen, rule.action)).toBe(
          permissions.defaultAccessFor(role, rule.screen, rule.action),
        );
      }
    }
    expect(permissions.accessFor('kasir', 'POS-05', 'Hapus Bill')).toBe('tidak');
    expect(permissions.accessFor('kasir', 'POS-03', 'Diskon')).toBe('otorisasi');
    expect(permissions.accessFor('frontliner', 'POS-03', 'Papan angka')).toBe('ya');
    expect(permissions.accessFor('frontliner', 'POS-02', 'Bayar')).toBe('tidak');
  });

  it('mencabut dan memberi hak langsung berlaku pada accessFor, isAllowed, dan needsOwnerAuthorization', async () => {
    const permissions = await load();
    expect(permissions.setAccessOverride('supervisor', 'POS-05', 'Hapus Bill', 'tidak')).toBe(true);
    expect(permissions.accessFor('supervisor', 'POS-05', 'Hapus Bill')).toBe('tidak');
    expect(permissions.isAllowed('supervisor', 'POS-05', 'Hapus Bill')).toBe(false);

    expect(permissions.setAccessOverride('kasir', 'POS-05', 'Hapus Bill', 'ya')).toBe(true);
    expect(permissions.isAllowed('kasir', 'POS-05', 'Hapus Bill')).toBe(true);

    expect(permissions.setAccessOverride('kasir', 'POS-03', 'Diskon', 'ya')).toBe(true);
    expect(permissions.needsOwnerAuthorization('kasir', 'POS-03', 'Diskon')).toBe(false);
    expect(permissions.isAllowed('kasir', 'POS-03', 'Diskon')).toBe(true);

    expect(permissions.setAccessOverride('frontliner', 'POS-03', 'Diskon', 'otorisasi')).toBe(true);
    expect(permissions.needsOwnerAuthorization('frontliner', 'POS-03', 'Diskon')).toBe(true);
    expect(permissions.isAllowed('frontliner', 'POS-03', 'Diskon')).toBe(false);

    expect(permissions.setAccessOverride('supervisor', 'BO-04', 'Simpan Harga', 'ya')).toBe(true);
    expect(permissions.isAllowed('supervisor', 'BO-04', 'Simpan Harga')).toBe(true);
    // Peran lain pada aksi yang sama tidak ikut berubah.
    expect(permissions.accessFor('owner', 'POS-05', 'Hapus Bill')).toBe('ya');
    expect(permissions.accessFor('frontliner', 'POS-05', 'Hapus Bill')).toBe('tidak');
  });

  it('menyimpan ke localStorage dan memuatnya kembali saat modul dimuat', async () => {
    const first = await load();
    first.setAccessOverride('supervisor', 'POS-05', 'Hapus Bill', 'tidak');
    first.setAccessOverride('kasir', 'POS-03', 'Diskon', 'ya');
    expect(JSON.parse(storage.values.get(KEY) ?? '[]')).toEqual([
      ['supervisor|POS-05|Hapus Bill', 'tidak'],
      ['kasir|POS-03|Diskon', 'ya'],
    ]);

    const second = await load();
    expect(second.accessFor('supervisor', 'POS-05', 'Hapus Bill')).toBe('tidak');
    expect(second.accessFor('kasir', 'POS-03', 'Diskon')).toBe('ya');
    expect(second.accessFor('kasir', 'POS-05', 'Hapus Bill')).toBe('tidak');
  });

  it('mengembalikan ke bawaan lewat nilai sama dengan bawaan dan lewat clearAccessOverrides', async () => {
    const permissions = await load();
    permissions.setAccessOverride('supervisor', 'POS-05', 'Hapus Bill', 'tidak');
    permissions.setAccessOverride('supervisor', 'POS-05', 'Hapus Bill', 'ya');
    expect(storage.values.get(KEY)).toBe('[]');
    expect(permissions.accessFor('supervisor', 'POS-05', 'Hapus Bill')).toBe('ya');

    permissions.setAccessOverride('supervisor', 'POS-05', 'Hapus Bill', 'tidak');
    permissions.setAccessOverride('kasir', 'POS-03', 'Diskon', 'ya');
    permissions.clearAccessOverrides();
    expect(storage.values.get(KEY)).toBe('[]');
    expect(permissions.accessFor('supervisor', 'POS-05', 'Hapus Bill')).toBe('ya');
    expect(permissions.accessFor('kasir', 'POS-03', 'Diskon')).toBe('otorisasi');
    expect((await load()).accessFor('kasir', 'POS-03', 'Diskon')).toBe('otorisasi');
  });

  it('Owner tidak dapat dibatasi agar tidak terkunci', async () => {
    const permissions = await load();
    expect(permissions.canOverrideAccess('owner', 'POS-05', 'Hapus Bill')).toBe(false);
    expect(permissions.setAccessOverride('owner', 'POS-05', 'Hapus Bill', 'tidak')).toBe(false);
    expect(permissions.accessFor('owner', 'POS-05', 'Hapus Bill')).toBe('ya');
    expect(storage.values.has(KEY)).toBe(false);
  });

  it('peran yang tidak boleh membuka layar tetap mengikuti canOpenScreen', async () => {
    const permissions = await load();
    // Kasir tidak dapat membuka layar Back-Office; Supervisor tidak dapat membuka Laba Rugi.
    expect(permissions.canOpenScreen('kasir', 'BO-03')).toBe(false);
    expect(permissions.setAccessOverride('kasir', 'BO-03', 'Tambah Barang', 'ya')).toBe(false);
    expect(permissions.accessFor('kasir', 'BO-03', 'Tambah Barang')).toBe('tidak');
    expect(permissions.setAccessOverride('supervisor', 'BO-17', 'Tab laporan', 'ya')).toBe(false);
    expect(permissions.accessFor('supervisor', 'BO-17', 'Tab laporan')).toBe('tidak');
    // Frontliner hanya membuka POS-01, POS-02, POS-03, dan POS-05.
    expect(permissions.setAccessOverride('frontliner', 'POS-04', 'Kembali', 'ya')).toBe(false);
    expect(permissions.accessFor('frontliner', 'POS-04', 'Kembali')).toBe('tidak');
    expect(permissions.canOverrideAccess('frontliner', 'POS-05', 'Hapus Bill')).toBe(true);
  });

  it('Frontliner tidak dapat diberi Bayar karena layar bayar tertutup baginya', async () => {
    const permissions = await load();
    expect(permissions.canOverrideAccess('frontliner', 'POS-02', 'Bayar')).toBe(false);
    expect(permissions.setAccessOverride('frontliner', 'POS-02', 'Bayar', 'ya')).toBe(false);
    expect(permissions.isAllowed('frontliner', 'POS-02', 'Bayar')).toBe(false);
  });

  it('aksi yang tidak ada pada matriks tetap ditolak', async () => {
    const permissions = await load();
    expect(permissions.canOverrideAccess('supervisor', 'POS-05', 'Aksi palsu')).toBe(false);
    expect(permissions.setAccessOverride('supervisor', 'POS-05', 'Aksi palsu', 'ya')).toBe(false);
    expect(permissions.accessFor('supervisor', 'POS-05', 'Aksi palsu')).toBe('tidak');
  });

  it('mengabaikan isi penyimpanan yang rusak atau bernilai tidak sah', async () => {
    for (const raw of [
      'bukan json',
      '{"a":1}',
      '42',
      'null',
      '[["x"]]',
      '[["supervisor|POS-05|Hapus Bill","bebas"]]',
    ]) {
      storage.values.set(KEY, raw);
      const permissions = await load();
      expect(permissions.accessFor('supervisor', 'POS-05', 'Hapus Bill'), raw).toBe('ya');
    }
    storage.values.set(KEY, '[["supervisor|POS-05|Hapus Bill","tidak"],["rusak",1]]');
    expect((await load()).accessFor('supervisor', 'POS-05', 'Hapus Bill')).toBe('tidak');
  });

  it('tetap berfungsi di sesi ini bila penyimpanan menolak menulis atau tidak ada', async () => {
    vi.stubGlobal('localStorage', {
      getItem: () => null,
      setItem: () => {
        throw new Error('penuh');
      },
      removeItem: () => undefined,
    });
    const blocked = await load();
    expect(blocked.setAccessOverride('supervisor', 'POS-05', 'Hapus Bill', 'tidak')).toBe(true);
    expect(blocked.accessFor('supervisor', 'POS-05', 'Hapus Bill')).toBe('tidak');

    vi.unstubAllGlobals();
    const absent = await load();
    expect(absent.setAccessOverride('kasir', 'POS-03', 'Diskon', 'ya')).toBe(true);
    expect(absent.accessFor('kasir', 'POS-03', 'Diskon')).toBe('ya');
  });
});
