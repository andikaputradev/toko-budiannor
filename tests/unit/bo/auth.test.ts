import { describe, expect, it } from 'vitest';
import { generateDataset } from '../../../src/shared/data/generator';
import {
  checkLogin,
  INITIAL_LOGIN_GUARD,
  LOGIN_LOCK_MS,
  MAX_LOGIN_FAILURES,
} from '../../../src/apps/bo/domain/auth';

const users = generateDataset().users;
const NOW = 5_000_000;

describe('login Back-Office', () => {
  it('menolak nama pengguna dan kata sandi kosong dengan pesan Lampiran C', () => {
    expect(checkLogin(users, ' ', 'x', INITIAL_LOGIN_GUARD, NOW)).toMatchObject({
      kind: 'error',
      messageId: 'MSG-052',
    });
    expect(checkLogin(users, 'sinta.spv', '', INITIAL_LOGIN_GUARD, NOW)).toMatchObject({
      kind: 'error',
      messageId: 'MSG-053',
    });
  });

  it('memberi pesan sama untuk nama salah dan kata sandi salah', () => {
    const wrongName = checkLogin(users, 'tidak.ada', 'Kunci2026B', INITIAL_LOGIN_GUARD, NOW);
    const wrongPass = checkLogin(users, 'sinta.spv', 'Salah12345', INITIAL_LOGIN_GUARD, NOW);
    expect(wrongName).toMatchObject({ kind: 'error', messageId: 'MSG-054' });
    expect(wrongPass).toMatchObject({ kind: 'error', messageId: 'MSG-054' });
  });

  it('mengunci 15 menit pada kegagalan kelima dan menolak kata sandi benar selama terkunci', () => {
    let guard = INITIAL_LOGIN_GUARD;
    for (let attempt = 1; attempt < MAX_LOGIN_FAILURES; attempt += 1) {
      const outcome = checkLogin(users, 'sinta.spv', 'salah', guard, NOW);
      expect(outcome).toMatchObject({ messageId: 'MSG-054' });
      guard = outcome.guard;
    }
    const locked = checkLogin(users, 'sinta.spv', 'salah', guard, NOW);
    expect(locked).toMatchObject({ messageId: 'MSG-055' });
    expect(checkLogin(users, 'sinta.spv', 'Kunci2026B', locked.guard, NOW + 1000)).toMatchObject({
      messageId: 'MSG-055',
    });
    expect(
      checkLogin(users, 'sinta.spv', 'Kunci2026B', locked.guard, NOW + LOGIN_LOCK_MS),
    ).toMatchObject({ kind: 'ok' });
  });

  it('menerima Owner dan Supervisor serta menolak Kasir, Frontliner, dan akun nonaktif', () => {
    expect(checkLogin(users, 'haris.owner', 'Kunci2026A', INITIAL_LOGIN_GUARD, NOW).kind).toBe(
      'ok',
    );
    expect(checkLogin(users, 'sinta.spv', 'Kunci2026B', INITIAL_LOGIN_GUARD, NOW).kind).toBe('ok');
    expect(checkLogin(users, 'dewi.kasir', 'Kunci2026C', INITIAL_LOGIN_GUARD, NOW)).toMatchObject({
      messageId: 'MSG-056',
    });
    expect(checkLogin(users, 'agus.front', 'Kunci2026E', INITIAL_LOGIN_GUARD, NOW)).toMatchObject({
      messageId: 'MSG-003',
    });
    const inactive = users.map((user) => (user.id === 'U-2' ? { ...user, active: false } : user));
    expect(checkLogin(inactive, 'sinta.spv', 'Kunci2026B', INITIAL_LOGIN_GUARD, NOW)).toMatchObject(
      {
        messageId: 'MSG-020',
      },
    );
  });
});
