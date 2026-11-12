import { describe, expect, it } from 'vitest';
import { generateDataset } from '../../../src/shared/data/generator';
import {
  checkPin,
  INITIAL_GUARD,
  LOCK_MS,
  ownerPinOwner,
  pinBelongsToNonOwner,
} from '../../../src/apps/pos/domain/pin';

const users = generateDataset().users;
const START = 1_000_000;

describe('sisa percobaan PIN', () => {
  it('menolak format selain 4 sampai 6 angka tanpa menghitung percobaan', () => {
    for (const entered of ['', '123', '1234567', 'abcd', '12 34']) {
      const outcome = checkPin('123456', entered, INITIAL_GUARD, START);
      expect(outcome.kind).toBe('invalid-format');
      expect(outcome.guard.failures).toBe(0);
    }
  });

  it('menerima PIN benar dan mengatur ulang hitungan gagal', () => {
    const wrong = checkPin('123456', '111111', INITIAL_GUARD, START);
    const ok = checkPin('123456', '123456', wrong.guard, START);
    expect(ok).toMatchObject({ kind: 'success', guard: { failures: 0 } });
  });

  it('melaporkan sisa percobaan 2, lalu 1, lalu mengunci pada kegagalan ketiga', () => {
    const first = checkPin('123456', '111111', INITIAL_GUARD, START);
    expect(first).toMatchObject({ kind: 'wrong', remaining: 2 });
    const second = checkPin('123456', '111111', first.guard, START);
    expect(second).toMatchObject({ kind: 'wrong', remaining: 1 });
    const third = checkPin('123456', '111111', second.guard, START);
    expect(third).toMatchObject({ kind: 'locked', retryAfterMs: LOCK_MS });
  });

  it('menolak PIN benar selama terkunci dan membukanya setelah 5 menit', () => {
    let guard = INITIAL_GUARD;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      guard = checkPin('123456', '111111', guard, START).guard;
    }
    expect(checkPin('123456', '123456', guard, START + 1000).kind).toBe('locked');
    expect(checkPin('123456', '123456', guard, START + LOCK_MS - 1).kind).toBe('locked');
    expect(checkPin('123456', '123456', guard, START + LOCK_MS).kind).toBe('success');
    expect(checkPin('123456', '111111', guard, START + LOCK_MS)).toMatchObject({
      kind: 'wrong',
      remaining: 2,
    });
  });

  it('mengenali PIN Owner dan PIN milik peran lain', () => {
    expect(ownerPinOwner(users, '482916')?.role).toBe('owner');
    expect(ownerPinOwner(users, '654321')).toBeUndefined();
    expect(pinBelongsToNonOwner(users, '654321')).toBe(true);
    expect(pinBelongsToNonOwner(users, '482916')).toBe(false);
    expect(pinBelongsToNonOwner(users, '000000')).toBe(false);
  });
});
