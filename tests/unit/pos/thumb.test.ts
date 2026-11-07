import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { avatarUrl } from '../../../src/apps/pos/thumb';

describe('avatar karyawan', () => {
  it('avatarUrl memetakan U-1 sampai U-5 ke berkas avatar yang ada', () => {
    for (const id of ['U-1', 'U-2', 'U-3', 'U-4', 'U-5']) {
      const url = avatarUrl(id);
      expect(url).toBe(`avatar/${id}.svg`);
      expect(existsSync(`public/${url ?? ''}`), id).toBe(true);
    }
  });

  it('avatarUrl tidak punya avatar untuk sales lapangan atau pengguna tak dikenal', () => {
    expect(avatarUrl('U-6')).toBeUndefined();
    expect(avatarUrl('X-1')).toBeUndefined();
  });
});
