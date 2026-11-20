import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SYSTEM_USERS,
  MATRIX_ROLES,
  SYSTEM_USERS_KEY,
  accessCycle,
  actionLabel,
  addSystemUser,
  changeSystemUser,
  createSystemUserStore,
  getStructuredRbacMatrix,
  lockReason,
  nextAccess,
  resetSystemUserPin,
  temporaryPin,
  validateUserDraft,
  type SystemUser,
  type UserDraft,
} from '../../../src/apps/bo/domain/settings-rbac';
import { FICTIONAL_USERS } from '../../../src/shared/data/generator';
import { PIN_PATTERN } from '../../../src/shared/domain/pin';
import { PERMISSION_ROWS, accessFor, defaultAccessFor } from '../../../src/shared/permissions';

const draft = (patch: Partial<UserDraft> = {}): UserDraft => ({
  fullName: 'Budi Santoso',
  username: 'budi.santoso',
  role: 'kasir',
  active: true,
  pin: '246810',
  ...patch,
});

function userAt(users: readonly SystemUser[], index: number): SystemUser {
  const user = users[index];
  if (user === undefined) {
    throw new Error(`Pengguna ke-${String(index)} tidak ada`);
  }
  return user;
}

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

describe('matriks hak akses yang dapat diedit', () => {
  const matrix = getStructuredRbacMatrix();

  it('memuat seluruh layar POS dan Back-Office, tanpa layar Owner dan Sales', () => {
    const codes = matrix.map((group) => group.screenCode);
    expect(codes).toHaveLength(34);
    expect(codes.filter((code) => code.startsWith('POS-'))).toHaveLength(12);
    expect(codes.filter((code) => code.startsWith('BO-'))).toHaveLength(22);
    expect(codes.some((code) => code.startsWith('OWN-') || code.startsWith('SALES-'))).toBe(false);
    const rows = PERMISSION_ROWS.filter(([code]) => /^(POS|BO)-/.test(code));
    expect(matrix.flatMap((group) => group.items)).toHaveLength(rows.length);
  });

  it('setiap sel sama dengan hak efektif accessFor, termasuk kolom Frontliner', () => {
    for (const group of matrix) {
      for (const item of group.items) {
        for (const role of MATRIX_ROLES) {
          expect(item[role], `${group.screenCode} ${item.action} ${role}`).toBe(
            accessFor(role, group.screenCode, item.action),
          );
        }
      }
    }
    const pos03 = matrix.find((group) => group.screenCode === 'POS-03');
    expect(pos03?.items.find((item) => item.action === 'Papan angka')?.frontliner).toBe('ya');
    expect(pos03?.items.find((item) => item.action === 'Diskon')?.frontliner).toBe('tidak');
    expect(pos03?.items.find((item) => item.action === 'Diskon')?.kasir).toBe('otorisasi');
  });

  it('menampilkan istilah Faktur menggantikan Invoice pada nama aksi', () => {
    expect(actionLabel('Cetak Ulang Invoice')).toBe('Cetak Ulang Faktur');
    expect(actionLabel('Hapus Bill')).toBe('Hapus Bill');
  });

  it('mengunci kolom Owner, layar yang tidak dapat dibuka perannya, layar masuk, dan Bayar Frontliner', () => {
    expect(lockReason('owner', 'POS-03', 'Diskon')).toBe('owner');
    expect(lockReason('kasir', 'BO-03', 'Tambah Barang')).toBe('layar');
    expect(lockReason('supervisor', 'BO-17', 'Tab laporan')).toBe('layar');
    expect(lockReason('frontliner', 'POS-04', 'Kembali')).toBe('layar');
    expect(lockReason('supervisor', 'BO-01', 'Masuk')).toBe('masuk');
    expect(lockReason('kasir', 'POS-01', 'Masuk')).toBe('masuk');
    expect(lockReason('frontliner', 'POS-02', 'Bayar')).toBe('bayar');
    expect(lockReason('supervisor', 'POS-05', 'Hapus Bill')).toBeUndefined();
    expect(lockReason('kasir', 'POS-03', 'Diskon')).toBeUndefined();
    expect(lockReason('frontliner', 'POS-05', 'Hapus Bill')).toBeUndefined();
  });

  it('status Otorisasi hanya tersedia bagi aksi yang mengenal otorisasi Owner', () => {
    expect(accessCycle('POS-03', 'Diskon')).toEqual(['ya', 'otorisasi', 'tidak']);
    expect(accessCycle('POS-03', 'Ubah Harga')).toEqual(['ya', 'otorisasi', 'tidak']);
    expect(accessCycle('BO-09', 'Koreksi Transaksi (Otorisasi Owner)')).toEqual([
      'ya',
      'otorisasi',
      'tidak',
    ]);
    expect(accessCycle('POS-05', 'Hapus Bill')).toEqual(['ya', 'tidak']);
    expect(accessCycle('BO-03', 'Simpan Barang')).toEqual(['ya', 'tidak']);
  });

  it('lingkar status berputar ya, otorisasi, tidak, lalu kembali ke ya', () => {
    expect(nextAccess('POS-03', 'Diskon', 'ya')).toBe('otorisasi');
    expect(nextAccess('POS-03', 'Diskon', 'otorisasi')).toBe('tidak');
    expect(nextAccess('POS-03', 'Diskon', 'tidak')).toBe('ya');
    expect(nextAccess('POS-05', 'Hapus Bill', 'ya')).toBe('tidak');
    expect(nextAccess('POS-05', 'Hapus Bill', 'tidak')).toBe('ya');
    expect(nextAccess('POS-05', 'Hapus Bill', 'otorisasi')).toBe('tidak');
  });

  it('tanpa penimpaan, hak efektif sama dengan hak bawaan untuk semua sel', () => {
    for (const group of matrix) {
      for (const item of group.items) {
        for (const role of MATRIX_ROLES) {
          expect(accessFor(role, group.screenCode, item.action)).toBe(
            defaultAccessFor(role, group.screenCode, item.action),
          );
        }
      }
    }
  });
});

describe('PIN 6 angka pada daftar pengguna', () => {
  it('semua PIN contoh (pengguna Pengaturan dan akun login) tepat 6 angka', () => {
    for (const user of DEFAULT_SYSTEM_USERS) {
      expect(user.pin, user.username).toMatch(PIN_PATTERN);
    }
    for (const user of FICTIONAL_USERS) {
      expect(user.pin, user.username).toMatch(PIN_PATTERN);
    }
  });

  it('menolak PIN pengguna baru yang bukan tepat 6 angka', () => {
    for (const pin of ['', '1234', '12345', '1234567', '12345a', '12 456']) {
      expect(validateUserDraft(DEFAULT_SYSTEM_USERS, draft({ pin })), pin).toBe('pin');
    }
    expect(validateUserDraft(DEFAULT_SYSTEM_USERS, draft({ pin: '246810' }))).toBeUndefined();
  });

  it('PIN baru saat mengubah pengguna boleh kosong, tetapi bila diisi harus 6 angka', () => {
    const kasir = userAt(DEFAULT_SYSTEM_USERS, 2);
    expect(validateUserDraft(DEFAULT_SYSTEM_USERS, draft({ pin: '' }), kasir.id)).toBeUndefined();
    expect(validateUserDraft(DEFAULT_SYSTEM_USERS, draft({ pin: '1234' }), kasir.id)).toBe('pin');
    const changed = changeSystemUser(DEFAULT_SYSTEM_USERS, kasir.id, draft({ pin: '' }));
    expect(changed.find((user) => user.id === kasir.id)?.pin).toBe(kasir.pin);
    const renewed = changeSystemUser(DEFAULT_SYSTEM_USERS, kasir.id, draft({ pin: '999000' }));
    expect(renewed.find((user) => user.id === kasir.id)?.pin).toBe('999000');
  });

  it('PIN sementara hasil Reset PIN selalu 6 angka', () => {
    for (let index = 0; index < 50; index += 1) {
      expect(temporaryPin()).toMatch(PIN_PATTERN);
    }
    const reset = resetSystemUserPin(DEFAULT_SYSTEM_USERS, 'USR-03', '000123');
    expect(reset.find((user) => user.id === 'USR-03')?.pin).toBe('000123');
    expect(reset.find((user) => user.id === 'USR-04')?.pin).toBe('123456');
  });
});

describe('tambah dan ubah pengguna', () => {
  it('menolak isian kosong dan username ganda (tanpa peka huruf besar)', () => {
    expect(validateUserDraft(DEFAULT_SYSTEM_USERS, draft({ fullName: '  ' }))).toBe('kosong');
    expect(validateUserDraft(DEFAULT_SYSTEM_USERS, draft({ username: '' }))).toBe('kosong');
    expect(validateUserDraft(DEFAULT_SYSTEM_USERS, draft({ username: 'KASIR_SITI' }))).toBe(
      'username-ganda',
    );
    expect(
      validateUserDraft(DEFAULT_SYSTEM_USERS, draft({ username: 'kasir_siti', pin: '' }), 'USR-03'),
    ).toBeUndefined();
  });

  it('menambah pengguna dengan nomor berikutnya, aktif, dan belum pernah masuk', () => {
    const next = addSystemUser(DEFAULT_SYSTEM_USERS, draft());
    expect(next).toHaveLength(DEFAULT_SYSTEM_USERS.length + 1);
    expect(next.at(-1)).toEqual({
      id: 'USR-06',
      username: 'budi.santoso',
      fullName: 'Budi Santoso',
      role: 'kasir',
      pin: '246810',
      active: true,
      lastLogin: 'Belum pernah',
    });
    expect(addSystemUser(next, draft({ username: 'lain.lagi' })).at(-1)?.id).toBe('USR-07');
  });

  it('mengubah nama, peran, dan status tanpa mengubah username', () => {
    const next = changeSystemUser(
      DEFAULT_SYSTEM_USERS,
      'USR-04',
      draft({
        fullName: ' Ahmad F. ',
        username: 'diabaikan',
        role: 'supervisor',
        active: false,
        pin: '',
      }),
    );
    const changed = next.find((user) => user.id === 'USR-04');
    expect(changed).toMatchObject({
      username: 'kasir_ahmad',
      fullName: 'Ahmad F.',
      role: 'supervisor',
      active: false,
      pin: '123456',
    });
  });

  it('Owner aktif terakhir tidak boleh dinonaktifkan atau diturunkan', () => {
    const owner = userAt(DEFAULT_SYSTEM_USERS, 0);
    const base = { fullName: owner.fullName, username: owner.username, pin: '' } as const;
    expect(
      validateUserDraft(
        DEFAULT_SYSTEM_USERS,
        draft({ ...base, role: 'owner', active: false }),
        owner.id,
      ),
    ).toBe('owner-terakhir');
    expect(
      validateUserDraft(
        DEFAULT_SYSTEM_USERS,
        draft({ ...base, role: 'supervisor', active: true }),
        owner.id,
      ),
    ).toBe('owner-terakhir');
    expect(
      validateUserDraft(
        DEFAULT_SYSTEM_USERS,
        draft({ ...base, role: 'owner', active: true }),
        owner.id,
      ),
    ).toBeUndefined();
  });

  it('Owner boleh diturunkan bila masih ada Owner aktif lain', () => {
    const second = addSystemUser(
      DEFAULT_SYSTEM_USERS,
      draft({ role: 'owner', username: 'owner.dua' }),
    );
    const owner = userAt(second, 0);
    const patch = draft({
      fullName: owner.fullName,
      username: owner.username,
      role: 'kasir',
      pin: '',
    });
    expect(validateUserDraft(second, patch, owner.id)).toBeUndefined();
    const inactive = second.map((user) =>
      user.id === 'USR-06' ? { ...user, active: false } : user,
    );
    expect(validateUserDraft(inactive, patch, owner.id)).toBe('owner-terakhir');
  });
});

describe('daftar pengguna tersimpan selama sesi', () => {
  it('memuat daftar bawaan bila penyimpanan kosong atau tidak tersedia', () => {
    expect(createSystemUserStore(new MemoryStorage()).load()).toBe(DEFAULT_SYSTEM_USERS);
    expect(createSystemUserStore(undefined).load()).toBe(DEFAULT_SYSTEM_USERS);
  });

  it('menyimpan dan memuat ulang perubahan', () => {
    const storage = new MemoryStorage();
    const users = addSystemUser(DEFAULT_SYSTEM_USERS, draft());
    createSystemUserStore(storage).save(users);
    expect(storage.values.has(SYSTEM_USERS_KEY)).toBe(true);
    expect(createSystemUserStore(storage).load()).toEqual(users);
    createSystemUserStore(storage).clear();
    expect(createSystemUserStore(storage).load()).toBe(DEFAULT_SYSTEM_USERS);
  });

  it('mengabaikan isi penyimpanan yang rusak', () => {
    for (const raw of ['bukan json', '{}', '[]', '[{"id":"USR-01"}]', '[1,2]']) {
      const storage = new MemoryStorage();
      storage.setItem(SYSTEM_USERS_KEY, raw);
      expect(createSystemUserStore(storage).load(), raw).toBe(DEFAULT_SYSTEM_USERS);
    }
  });
});
