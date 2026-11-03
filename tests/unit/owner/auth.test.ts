import { describe, expect, it } from 'vitest';
import { generateDataset } from '../../../src/shared/data/generator';
import {
  checkOwnerLogin,
  createMemoryVault,
  createStorageVault,
} from '../../../src/apps/owner/domain/auth';
import { fakeStorage } from './support';

const users = generateDataset().users;

describe('login Monitoring Owner', () => {
  it('memeriksa isian kosong dan kombinasi salah dengan pesan Lampiran C', () => {
    expect(checkOwnerLogin(users, ' ', 'x')).toEqual({ kind: 'error', messageId: 'MSG-052' });
    expect(checkOwnerLogin(users, 'haris.owner', '')).toEqual({
      kind: 'error',
      messageId: 'MSG-053',
    });
    expect(checkOwnerLogin(users, 'haris.owner', 'salah')).toEqual({
      kind: 'error',
      messageId: 'MSG-054',
    });
  });

  it('hanya menerima Owner aktif dan menolak peran lain dengan MSG-118', () => {
    expect(checkOwnerLogin(users, 'haris.owner', 'Kunci2026A').kind).toBe('ok');
    for (const [name, pass] of [
      ['sinta.spv', 'Kunci2026B'],
      ['dewi.kasir', 'Kunci2026C'],
      ['agus.front', 'Kunci2026E'],
    ] as const) {
      expect(checkOwnerLogin(users, name, pass)).toEqual({ kind: 'error', messageId: 'MSG-118' });
    }
    const inactive = users.map((user) => (user.id === 'U-1' ? { ...user, active: false } : user));
    expect(checkOwnerLogin(inactive, 'haris.owner', 'Kunci2026A')).toEqual({
      kind: 'error',
      messageId: 'MSG-020',
    });
  });

  it('menyimpan sesi pada brankas memori dan penyimpanan lokal serta mengabaikan data rusak', () => {
    const memory = createMemoryVault();
    memory.write({ userId: 'U-1', expiresAt: 5 });
    expect(memory.read()).toEqual({ userId: 'U-1', expiresAt: 5 });
    memory.clear();
    expect(memory.read()).toBeUndefined();

    const storage = fakeStorage();
    const vault = createStorageVault(storage);
    expect(vault.read()).toBeUndefined();
    vault.write({ userId: 'U-1', expiresAt: 99 });
    expect(vault.read()).toEqual({ userId: 'U-1', expiresAt: 99 });
    storage.setItem('tb-pos-owner-session', '{rusak');
    expect(vault.read()).toBeUndefined();
    storage.setItem('tb-pos-owner-session', JSON.stringify({ userId: 1 }));
    expect(vault.read()).toBeUndefined();
    vault.clear();
    expect(storage.length).toBe(0);
    expect(createStorageVault(undefined).read()).toBeUndefined();
  });
});
