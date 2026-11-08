import { describe, expect, it } from 'vitest';
import { createAmountModel, keyFromKeyboard } from '../../../src/apps/pos/domain/amount';
import { formatRupiah } from '../../../src/shared/format';

function setup(options: { value?: number; max?: number } = {}) {
  const changes: number[] = [];
  let enters = 0;
  const model = createAmountModel({
    ...options,
    onChange: (value) => changes.push(value),
    onEnter: () => {
      enters += 1;
    },
  });
  return { model, changes, enters: () => enters };
}

describe('entri nominal', () => {
  it('000 menambah tiga nol dan menghormati batas 12 digit', () => {
    const { model } = setup();
    model.press('1');
    model.press('000');
    expect(model.value()).toBe(1000);
    model.press('C');
    for (const digit of '999999999') {
      model.press(digit as '9');
    }
    model.press('000');
    expect(model.value()).toBe(999_999_999_000);
    model.press('5');
    expect(model.value()).toBe(999_999_999_000);
  });

  it('000 pada nilai kosong tetap nol dan C mengosongkan, hapus membuang satu digit', () => {
    const { model } = setup();
    model.press('000');
    expect(model.value()).toBe(0);
    for (const digit of '1234') {
      model.press(digit as '1');
    }
    model.press('Backspace');
    expect(model.value()).toBe(123);
    model.press('C');
    expect(model.value()).toBe(0);
    model.press('Backspace');
    expect(model.value()).toBe(0);
  });

  it('onChange dipanggil dengan nilai terbaru setiap tombol angka, tetapi tidak oleh setValue', () => {
    const { model, changes } = setup();
    model.press('2');
    model.press('5');
    model.press('Backspace');
    expect(changes).toEqual([2, 25, 2]);
    model.setValue(70_000);
    expect(changes).toEqual([2, 25, 2]);
    expect(model.value()).toBe(70_000);
  });

  it('max membatasi nilai dan setMax memotong nilai berjalan', () => {
    const { model, changes } = setup({ max: 50_000 });
    for (const digit of '5000') {
      model.press(digit as '5');
    }
    model.press('0');
    expect(model.value()).toBe(50_000);
    model.press('0');
    expect(model.value()).toBe(50_000);
    model.press('C');
    model.press('9');
    expect(model.value()).toBe(9);
    model.press('000');
    model.press('000');
    expect(model.value()).toBe(50_000);
    model.setMax(20_000);
    expect(model.value()).toBe(20_000);
    expect(changes.at(-1)).toBe(20_000);
    model.setMax(undefined);
    model.press('0');
    expect(model.value()).toBe(200_000);
  });

  it('setValue juga dipotong oleh max, dan nilai awal dipotong saat dibuat', () => {
    const { model } = setup({ max: 1000, value: 5000 });
    expect(model.value()).toBe(1000);
    model.setValue(9999);
    expect(model.value()).toBe(1000);
    model.setValue(-5);
    expect(model.value()).toBe(0);
  });

  it('enter memanggil onEnter tanpa mengubah nilai', () => {
    const { model, changes, enters } = setup({ value: 15_000 });
    model.press('Enter');
    expect(enters()).toBe(1);
    expect(model.value()).toBe(15_000);
    expect(changes).toEqual([]);
  });

  it('papan ketik fisik mengisi digit dan Backspace menghapus, tombol lain diabaikan', () => {
    const { model, enters } = setup();
    expect(keyFromKeyboard('7')).toBe('7');
    expect(keyFromKeyboard('Backspace')).toBe('Backspace');
    expect(keyFromKeyboard('Enter')).toBe('Enter');
    expect(keyFromKeyboard('a')).toBeUndefined();
    expect(keyFromKeyboard('10')).toBeUndefined();
    expect(keyFromKeyboard(' ')).toBeUndefined();
    expect(model.pressKeyboard('4')).toBe(true);
    expect(model.pressKeyboard('2')).toBe(true);
    expect(model.value()).toBe(42);
    expect(model.pressKeyboard('Backspace')).toBe(true);
    expect(model.value()).toBe(4);
    expect(model.pressKeyboard('x')).toBe(false);
    expect(model.value()).toBe(4);
    expect(model.pressKeyboard('Enter')).toBe(true);
    expect(enters()).toBe(1);
  });

  it('tampilan memakai format rupiah dengan pemisah ribuan, kosong sebelum diisi', () => {
    const { model } = setup();
    expect(model.hasValue()).toBe(false);
    expect(model.text()).toBe('');
    for (const digit of '1234567') {
      model.press(digit as '1');
    }
    expect(model.hasValue()).toBe(true);
    expect(model.text()).toBe(formatRupiah(1_234_567));
    expect(model.text()).toMatch(/^Rp 1\.234\.567$/);
    model.press('C');
    expect(model.text()).toBe('Rp 0');
    expect(setup({ value: 0 }).model.text()).toBe('Rp 0');
  });
});
