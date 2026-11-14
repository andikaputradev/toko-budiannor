import { describe, expect, it } from 'vitest';
import { wantsUppercase } from '../../src/shared/uppercase-input';

function field(
  type: string,
  extra: { autocomplete?: string; inputMode?: string; keepCase?: string } = {},
) {
  return {
    type,
    autocomplete: extra.autocomplete ?? '',
    inputMode: extra.inputMode ?? '',
    dataset: extra.keepCase === undefined ? {} : { keepCase: extra.keepCase },
  };
}

describe('wantsUppercase (isian teks huruf kapital di POS dan BO)', () => {
  it('mengubah isian teks, pencarian, dan area teks', () => {
    expect(wantsUppercase(field('text'))).toBe(true);
    expect(wantsUppercase(field('search'))).toBe(true);
    expect(wantsUppercase(field('textarea'))).toBe(true);
  });

  it('tidak mengubah kata sandi, angka, tanggal, dan isian bukan teks', () => {
    for (const type of ['password', 'number', 'date', 'time', 'email', 'url', 'tel', 'file']) {
      expect(wantsUppercase(field(type)), type).toBe(false);
    }
  });

  it('tidak mengubah nama pengguna dan isian email yang bertipe teks', () => {
    expect(wantsUppercase(field('text', { autocomplete: 'username' }))).toBe(false);
    expect(wantsUppercase(field('text', { inputMode: 'email' }))).toBe(false);
  });

  it('menghormati atribut data-keep-case', () => {
    expect(wantsUppercase(field('text', { keepCase: '' }))).toBe(false);
  });
});
