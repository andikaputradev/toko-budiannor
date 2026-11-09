import { formatDecimal, formatRupiah } from '../../../shared/format';

const UNITS: readonly (readonly [number, string])[] = [
  [1_000_000_000, 'M'],
  [1_000_000, 'jt'],
];

// Rupiah ringkas untuk kartu sempit: "Rp 142,9 jt", "Rp 50,3 M". Di bawah satu juta ditulis penuh.
export function compactRupiah(value: number): string {
  const abs = Math.abs(value);
  const sign = value < 0 && Math.round(abs) !== 0 ? '-' : '';
  for (const [size, suffix] of UNITS) {
    if (abs >= size) {
      return `${sign}Rp ${formatDecimal(abs / size, 1)} ${suffix}`;
    }
  }
  return formatRupiah(value);
}

// Laba atau selisih dengan tanda eksplisit: "+Rp 1.000" atau "-Rp 1.000".
export function signedRupiah(value: number): string {
  return value >= 0 ? `+${formatRupiah(value)}` : formatRupiah(value);
}

// Label sumbu grafik dalam juta rupiah: 0, 5, 12,5.
export function juta(value: number): string {
  return formatDecimal(value / 1_000_000, 1);
}
